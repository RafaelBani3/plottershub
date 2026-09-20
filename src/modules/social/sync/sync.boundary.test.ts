import { describe, it, expect, vi, beforeEach } from "vitest";
import { SocialSyncService } from "./sync.service";
import { SocialProviderRegistry } from "../registry";
import { socialTokenManager } from "../token-manager";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    socialAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    syncJob: {
      create: vi.fn(),
      update: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
    },
    accountMetricSnapshot: {
      create: vi.fn(),
    },
    content: {
      update: vi.fn(),
      create: vi.fn(),
    },
    contentPlatform: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    contentMetricSnapshot: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

vi.mock("../token-manager", () => ({
  socialTokenManager: {
    getValidAccessToken: vi.fn(),
  },
}));

vi.mock("../registry", () => ({
  SocialProviderRegistry: {
    getProvider: vi.fn(),
  },
}));

describe("SocialSyncService — Multi-Page Traversal & Boundary Detection (Phase 3.4C)", () => {
  let syncService: SocialSyncService;
  let mockLock: any;
  let mockProvider: any;
  let mockDataApiClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLock = {
      acquire: vi.fn().mockResolvedValue("lock-token-123"),
      release: vi.fn().mockResolvedValue(true),
      extend: vi.fn().mockResolvedValue(true),
    };

    mockDataApiClient = {
      getAuthenticatedChannel: vi.fn().mockResolvedValue({
        id: "UC_123",
        snippet: { title: "Test Channel", customUrl: "@test" },
        statistics: { videoCount: "10" },
        contentDetails: {
          relatedPlaylists: { uploads: "UU_123" },
        },
      }),
      getUploadsPlaylistItems: vi.fn(),
      getVideosBatch: vi.fn(),
    };

    mockProvider = {
      dataApiClient: mockDataApiClient,
    };

    (SocialProviderRegistry.getProvider as any).mockReturnValue(mockProvider);
    (socialTokenManager.getValidAccessToken as any).mockResolvedValue("mock_access_token");

    (prisma.socialAccount.findUnique as any).mockResolvedValue({
      id: "acc-123",
      workspaceId: "ws-123",
      platform: { code: "YOUTUBE" },
    });

    (prisma.syncJob.create as any).mockResolvedValue({ id: "job-1" });
    (prisma.syncJob.update as any).mockResolvedValue({ id: "job-1" });
    (prisma.socialAccount.update as any).mockResolvedValue({});
    (prisma.accountMetricSnapshot.create as any).mockResolvedValue({});

    (prisma.$transaction as any).mockImplementation(async (callback: any) => {
      return callback(prisma);
    });

    syncService = new SocialSyncService(mockLock);
  });

  it("traverses multiple pages via nextPageToken up to limit", async () => {
    // Page 1: returns item1 and nextPageToken="token_p2"
    mockDataApiClient.getUploadsPlaylistItems
      .mockResolvedValueOnce({
        items: [{ contentDetails: { videoId: "vid_1" }, snippet: { resourceId: { videoId: "vid_1" } } }],
        nextPageToken: "token_p2",
      })
      // Page 2: returns item2 and no nextPageToken
      .mockResolvedValueOnce({
        items: [{ contentDetails: { videoId: "vid_2" }, snippet: { resourceId: { videoId: "vid_2" } } }],
        nextPageToken: undefined,
      });

    mockDataApiClient.getVideosBatch
      .mockResolvedValueOnce([
        {
          id: "vid_1",
          snippet: { title: "Video 1", publishedAt: "2026-03-01T00:00:00Z" },
          contentDetails: { duration: "PT5M" },
          statistics: { viewCount: "100" },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "vid_2",
          snippet: { title: "Video 2", publishedAt: "2026-02-01T00:00:00Z" },
          contentDetails: { duration: "PT45S" },
          statistics: { viewCount: "200" },
        },
      ]);

    (prisma.contentPlatform.findFirst as any).mockResolvedValue(null);
    (prisma.content.create as any).mockResolvedValue({ id: "c_new" });
    (prisma.contentPlatform.create as any).mockResolvedValue({ id: "cp_new" });
    (prisma.contentMetricSnapshot.create as any).mockResolvedValue({});

    const result = await syncService.syncYouTubeAccount({
      accountId: "acc-123",
      maxVideosLimit: 10,
    });

    expect(mockDataApiClient.getUploadsPlaylistItems).toHaveBeenCalledTimes(2);
    expect(mockDataApiClient.getUploadsPlaylistItems).toHaveBeenNthCalledWith(
      1,
      "mock_access_token",
      "UU_123",
      undefined,
      10
    );
    expect(mockDataApiClient.getUploadsPlaylistItems).toHaveBeenNthCalledWith(
      2,
      "mock_access_token",
      "UU_123",
      "token_p2",
      9
    );
    expect(result.videosDiscovered).toBe(2);
    expect(result.videosProcessed).toBe(2);
  });

  it("halts pagination when stopOnKnownContent is true and known video is encountered", async () => {
    // Page 1: returns item1 and nextPageToken="token_p2"
    mockDataApiClient.getUploadsPlaylistItems.mockResolvedValueOnce({
      items: [{ contentDetails: { videoId: "vid_known" }, snippet: { resourceId: { videoId: "vid_known" } } }],
      nextPageToken: "token_p2",
    });

    mockDataApiClient.getVideosBatch.mockResolvedValueOnce([
      {
        id: "vid_known",
        snippet: { title: "Known Video", publishedAt: "2026-03-01T00:00:00Z" },
        contentDetails: { duration: "PT5M" },
        statistics: { viewCount: "150" },
      },
    ]);

    // Already exists in DB
    (prisma.contentPlatform.findFirst as any).mockResolvedValue({
      id: "cp_known",
      contentId: "c_known",
    });
    (prisma.content.update as any).mockResolvedValue({});
    (prisma.contentPlatform.update as any).mockResolvedValue({});
    (prisma.contentMetricSnapshot.create as any).mockResolvedValue({});

    const result = await syncService.syncYouTubeAccount({
      accountId: "acc-123",
      stopOnKnownContent: true,
      maxVideosLimit: 100,
    });

    // Halts after Page 1 because vid_known was already in DB
    expect(mockDataApiClient.getUploadsPlaylistItems).toHaveBeenCalledTimes(1);
    expect(result.videosUpdated).toBe(1);
    expect(result.videosCreated).toBe(0);
  });

  it("halts pagination when historicalCutoffDate is reached", async () => {
    mockDataApiClient.getUploadsPlaylistItems.mockResolvedValueOnce({
      items: [{ contentDetails: { videoId: "vid_old" }, snippet: { resourceId: { videoId: "vid_old" } } }],
      nextPageToken: "token_p2",
    });

    mockDataApiClient.getVideosBatch.mockResolvedValueOnce([
      {
        id: "vid_old",
        snippet: { title: "Old Video", publishedAt: "2020-01-01T00:00:00Z" }, // Older than cutoff
        contentDetails: { duration: "PT2M" },
        statistics: { viewCount: "50" },
      },
    ]);

    (prisma.contentPlatform.findFirst as any).mockResolvedValue(null);
    (prisma.content.create as any).mockResolvedValue({ id: "c_new" });
    (prisma.contentPlatform.create as any).mockResolvedValue({ id: "cp_new" });
    (prisma.contentMetricSnapshot.create as any).mockResolvedValue({});

    const result = await syncService.syncYouTubeAccount({
      accountId: "acc-123",
      historicalCutoffDate: new Date("2024-01-01T00:00:00Z"),
      maxVideosLimit: 100,
    });

    // Halts pagination without fetching Page 2
    expect(mockDataApiClient.getUploadsPlaylistItems).toHaveBeenCalledTimes(1);
    expect(result.videosProcessed).toBe(1);
  });

  it("persists mapped platformMetadata into ContentPlatform.metadata on create and update", async () => {
    mockDataApiClient.getUploadsPlaylistItems.mockResolvedValueOnce({
      items: [{ contentDetails: { videoId: "vid_new" }, snippet: { resourceId: { videoId: "vid_new" } } }],
      nextPageToken: undefined,
    });

    mockDataApiClient.getVideosBatch.mockResolvedValueOnce([
      {
        id: "vid_new",
        snippet: {
          title: "New Shorts #shorts",
          publishedAt: "2026-03-10T00:00:00Z",
          channelId: "UC_123",
          channelTitle: "Test Channel",
          tags: ["#shorts"],
          categoryId: "28",
        },
        contentDetails: { duration: "PT45S" },
        status: { privacyStatus: "public", uploadStatus: "uploaded" },
        statistics: { viewCount: "999" },
      },
    ]);

    (prisma.contentPlatform.findFirst as any).mockResolvedValue(null);
    (prisma.content.create as any).mockResolvedValue({ id: "c_1" });
    (prisma.contentPlatform.create as any).mockResolvedValue({ id: "cp_1" });
    (prisma.contentMetricSnapshot.create as any).mockResolvedValue({});

    await syncService.syncYouTubeAccount({
      accountId: "acc-123",
    });

    // ContentPlatform.create must receive metadata
    expect(prisma.contentPlatform.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            contentType: "SHORTS",
            durationSeconds: 45,
            privacyStatus: "public",
          }),
        }),
      })
    );
  });
});
