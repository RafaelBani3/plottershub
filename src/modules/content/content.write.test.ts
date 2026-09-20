import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentService } from "./content.service";
import { YouTubeVideoResource } from "../social/providers/youtube/youtube.types";

vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

describe("ContentService — Content Write Pipeline (Phase 3.4D)", () => {
  let service: ContentService;
  let mockDb: any;
  let mockRepository: any;
  let mockLock: any;
  let mockTokenManager: any;
  let mockDataApiClient: any;

  const mockMembership = {
    workspaceId: "ws-123",
    userId: "usr-editor",
    role: "EDITOR", // Has content:edit
  };

  const mockRow = {
    id: "cp_1",
    contentId: "c_1",
    status: "PUBLISHED",
    externalContentId: "vid_yt_123",
    metadata: {
      title: "Initial Title",
      description: "Initial Description",
      tags: ["tag1"],
      categoryId: "28",
      privacyStatus: "PUBLIC",
      contentType: "LONG_FORM",
      classificationConfidence: "HIGH",
      classificationSource: "DURATION_EXCEEDS_SHORTS_MAX",
      classificationRationale: "Long form > 180s",
      durationSeconds: 200,
    },
    content: {
      id: "c_1",
      title: "Initial Title",
      description: "Initial Description",
      status: "PUBLISHED",
      workspaceId: "ws-123",
    },
    socialAccount: {
      id: "acc_1",
      workspaceId: "ws-123",
      externalAccountId: "UC_channel_1",
      status: "CONNECTED",
      platform: { code: "YOUTUBE" },
      token: {
        scopes: "openid https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube",
      },
    },
  };

  const mockLiveYouTubeVideo: YouTubeVideoResource = {
    kind: "youtube#video",
    id: "vid_yt_123",
    snippet: {
      publishedAt: "2026-01-01T00:00:00Z",
      channelId: "UC_channel_1",
      title: "Live YouTube Title",
      description: "Live YouTube Description",
      tags: ["tag1"],
      categoryId: "28",
    },
    status: {
      uploadStatus: "processed",
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: false,
    },
    contentDetails: {
      duration: "PT3M20S", // 200 seconds
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      workspaceMember: {
        findUnique: vi.fn().mockResolvedValue(mockMembership),
      },
      contentPlatform: {
        findFirst: vi.fn().mockResolvedValue(mockRow),
        update: vi.fn().mockResolvedValue({ id: "cp_1" }),
      },
      content: {
        update: vi.fn().mockResolvedValue({ id: "c_1" }),
      },
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue(mockRow.socialAccount),
      },
      $transaction: vi.fn().mockImplementation(async (fns: any) => Promise.all(fns)),
    };

    mockRepository = {
      getContentById: vi.fn().mockResolvedValue({
        id: "cp_1",
        contentId: "c_1",
        title: "Updated Title",
      }),
      listContent: vi.fn(),
      getSummaryMetrics: vi.fn(),
    };

    mockLock = {
      acquire: vi.fn().mockResolvedValue("lock-token-xyz"),
      release: vi.fn().mockResolvedValue(true),
    };

    mockTokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue("mock_valid_token"),
    };

    mockDataApiClient = {
      getVideoById: vi.fn().mockResolvedValue(mockLiveYouTubeVideo),
      updateVideo: vi.fn().mockResolvedValue({
        ...mockLiveYouTubeVideo,
        snippet: {
          ...mockLiveYouTubeVideo.snippet,
          title: "Updated Title",
        },
      }),
    };

    service = new ContentService(
      mockRepository,
      mockDb,
      mockLock,
      mockTokenManager,
      mockDataApiClient
    );
  });

  it("1. rejects update when actor lacks content:edit permission (e.g. VIEWER)", async () => {
    mockDb.workspaceMember.findUnique.mockResolvedValueOnce({
      workspaceId: "ws-123",
      userId: "usr-viewer",
      role: "VIEWER",
    });

    await expect(
      service.updateContent(
        { actorUserId: "usr-viewer", workspaceId: "ws-123" },
        "c_1",
        { title: "New Title" }
      )
    ).rejects.toThrow(/Permission denied/i);
  });

  it("2. rejects update when input validation fails (e.g. title with < >)", async () => {
    await expect(
      service.updateContent(
        { actorUserId: "usr-editor", workspaceId: "ws-123" },
        "c_1",
        { title: "Bad <Title>" }
      )
    ).rejects.toThrow(/cannot contain '<' or '>'/i);
  });

  it("3. rejects update when account lacks write scope (https://www.googleapis.com/auth/youtube)", async () => {
    mockDb.contentPlatform.findFirst.mockResolvedValueOnce({
      ...mockRow,
      socialAccount: {
        ...mockRow.socialAccount,
        token: {
          scopes: "openid https://www.googleapis.com/auth/youtube.readonly", // Read-only only!
        },
      },
    });

    await expect(
      service.updateContent(
        { actorUserId: "usr-editor", workspaceId: "ws-123" },
        "c_1",
        { title: "New Title" }
      )
    ).rejects.toThrow(/Account lacks write permissions/i);
  });

  it("4. handles lock contention with 409 Conflict", async () => {
    mockLock.acquire.mockResolvedValueOnce(null); // Lock already held

    await expect(
      service.updateContent(
        { actorUserId: "usr-editor", workspaceId: "ws-123" },
        "c_1",
        { title: "New Title" }
      )
    ).rejects.toThrow(/operation is currently in progress/i);

    expect(mockLock.acquire).toHaveBeenCalledWith(
      "content-update:acc_1:vid_yt_123",
      { ttlMs: 15000, timeoutMs: 0 }
    );
  });

  it("5. executes safe Read-Modify-Write update, re-evaluates Shorts classifier, and persists to DB", async () => {
    const result = await service.updateContent(
      { actorUserId: "usr-editor", workspaceId: "ws-123" },
      "c_1",
      { title: "Updated Title" }
    );

    expect(result).toBeDefined();
    // Pre-fetch live state before merge
    expect(mockDataApiClient.getVideoById).toHaveBeenCalledWith(
      "mock_valid_token",
      "vid_yt_123",
      "snippet,status"
    );

    // Call updateVideo with typed payload
    expect(mockDataApiClient.updateVideo).toHaveBeenCalledWith(
      "mock_valid_token",
      ["snippet"],
      expect.objectContaining({
        id: "vid_yt_123",
        snippet: expect.objectContaining({
          title: "Updated Title",
          description: "Live YouTube Description", // Preserved from live
          tags: ["tag1"], // Preserved from live
          categoryId: "28", // Preserved from live
        }),
      })
    );

    // Lock must be released
    expect(mockLock.release).toHaveBeenCalledWith(
      "content-update:acc_1:vid_yt_123",
      "lock-token-xyz"
    );
  });

  it("6. releases lock even if YouTube updateVideo throws an error", async () => {
    mockDataApiClient.updateVideo.mockRejectedValueOnce(new Error("YouTube API 500 error"));

    await expect(
      service.updateContent(
        { actorUserId: "usr-editor", workspaceId: "ws-123" },
        "c_1",
        { title: "New Title" }
      )
    ).rejects.toThrow(/YouTube API 500 error/i);

    expect(mockLock.release).toHaveBeenCalledWith(
      "content-update:acc_1:vid_yt_123",
      "lock-token-xyz"
    );
  });

  it("7. handles provider success followed by local DB failure with reconciliation error (Guardrail 6)", async () => {
    // DB transaction fails after YouTube API succeeded
    mockDb.$transaction.mockRejectedValueOnce(new Error("Database disk full"));

    await expect(
      service.updateContent(
        { actorUserId: "usr-editor", workspaceId: "ws-123" },
        "c_1",
        { title: "New Title" }
      )
    ).rejects.toThrow(/updated on YouTube, but local database persistence failed/i);

    // Lock was still released
    expect(mockLock.release).toHaveBeenCalled();
  });
});
