import { describe, it, expect, beforeEach, vi } from "vitest";
import { PlaylistService } from "./playlist.service";
import { InMemoryLock } from "@/lib/lock/distributed-lock";
import { logAuditEvent } from "@/modules/audit/audit-service";
import {
  validateCreatePlaylistInput,
  validateUpdatePlaylistInput,
  validateAddPlaylistItemInput,
  validateReorderPlaylistItemInput,
} from "./playlist.types";

vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Phase 3.4E — YouTube Playlist Service Suite", () => {
  let mockDb: any;
  let lock: InMemoryLock;
  let mockTokenManager: any;
  let mockDataApiClient: any;
  let service: PlaylistService;

  const validWorkspaceId = "ws-playlist-100";
  const validAccountId = "sa-playlist-200";
  const validUserId = "user-playlist-300";

  const defaultMockAccount = {
    id: validAccountId,
    workspaceId: validWorkspaceId,
    externalAccountId: "channel-yt-123",
    status: "HEALTHY",
    platform: { code: "YOUTUBE", name: "YouTube" },
    token: {
      scopes: ["https://www.googleapis.com/auth/youtube"],
    },
  };

  const samplePlaylistResource = {
    kind: "youtube#playlist" as const,
    id: "PL_sample_playlist_1",
    snippet: {
      title: "Test Playlist",
      description: "A test playlist description",
      publishedAt: "2026-09-19T00:00:00Z",
      thumbnails: {
        medium: { url: "https://yt.example.com/medium.jpg" },
      },
    },
    status: {
      privacyStatus: "public" as const,
    },
    contentDetails: {
      itemCount: 5,
    },
  };

  const samplePlaylistItemResource = {
    kind: "youtube#playlistItem" as const,
    id: "PLI_item_999",
    snippet: {
      playlistId: "PL_sample_playlist_1",
      position: 0,
      title: "Sample Video Title",
      description: "Video in playlist",
      publishedAt: "2026-09-19T01:00:00Z",
      resourceId: {
        kind: "youtube#video",
        videoId: "video-abc-123",
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      workspaceMember: {
        findUnique: vi.fn().mockResolvedValue({ role: "EDITOR" }),
      },
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue(defaultMockAccount),
      },
    };

    lock = new InMemoryLock();

    mockTokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
    };

    mockDataApiClient = {
      listPlaylists: vi.fn().mockResolvedValue({
        items: [samplePlaylistResource],
        nextPageToken: "next-token-123",
      }),
      getAuthenticatedChannel: vi.fn(),
      getUploadsPlaylistItems: vi.fn(),
      getVideosBatch: vi.fn(),
      getVideoById: vi.fn(),
      updateVideo: vi.fn(),
      insertPlaylist: vi.fn().mockResolvedValue(samplePlaylistResource),
      updatePlaylist: vi.fn().mockResolvedValue(samplePlaylistResource),
      deletePlaylist: vi.fn().mockResolvedValue(true),
      listPlaylistItems: vi.fn().mockResolvedValue({
        items: [samplePlaylistItemResource],
        nextPageToken: undefined,
      }),
      insertPlaylistItem: vi.fn().mockResolvedValue(samplePlaylistItemResource),
      updatePlaylistItem: vi.fn().mockResolvedValue(samplePlaylistItemResource),
      deletePlaylistItem: vi.fn().mockResolvedValue(true),
    };

    service = new PlaylistService(
      mockDb as any,
      lock,
      mockTokenManager as any,
      mockDataApiClient as any
    );
  });

  // =========================================================================
  // Input Validation
  // =========================================================================
  describe("Validation", () => {
    it("validates create playlist input", () => {
      expect(validateCreatePlaylistInput({ title: "" }).valid).toBe(false);
      expect(validateCreatePlaylistInput({ title: "   " }).valid).toBe(false);
      expect(validateCreatePlaylistInput({ title: "a".repeat(151) }).valid).toBe(false);
      expect(validateCreatePlaylistInput({ title: "Valid", description: "b".repeat(5001) }).valid).toBe(false);
      expect(validateCreatePlaylistInput({ title: "Valid", privacyStatus: "invalid" as any }).valid).toBe(false);
      expect(validateCreatePlaylistInput({ title: "Valid Title", privacyStatus: "unlisted" }).valid).toBe(true);
    });

    it("validates update playlist input", () => {
      expect(validateUpdatePlaylistInput({ title: "" }).valid).toBe(false);
      expect(validateUpdatePlaylistInput({ title: "a".repeat(151) }).valid).toBe(false);
      expect(validateUpdatePlaylistInput({ description: "b".repeat(5001) }).valid).toBe(false);
      expect(validateUpdatePlaylistInput({ privacyStatus: "invalid" as any }).valid).toBe(false);
      expect(validateUpdatePlaylistInput({ title: "New Title" }).valid).toBe(true);
    });

    it("validates add playlist item input", () => {
      expect(validateAddPlaylistItemInput({ videoId: "" }).valid).toBe(false);
      expect(validateAddPlaylistItemInput({ videoId: "   " }).valid).toBe(false);
      expect(validateAddPlaylistItemInput({ videoId: "vid-1", position: -1 }).valid).toBe(false);
      expect(validateAddPlaylistItemInput({ videoId: "vid-1", position: 1.5 }).valid).toBe(false);
      expect(validateAddPlaylistItemInput({ videoId: "vid-1", position: 0 }).valid).toBe(true);
    });

    it("validates reorder playlist item input", () => {
      expect(validateReorderPlaylistItemInput({ position: -1 }).valid).toBe(false);
      expect(validateReorderPlaylistItemInput({ position: 3.2 }).valid).toBe(false);
      expect(validateReorderPlaylistItemInput({ position: 2 }).valid).toBe(true);
    });
  });

  // =========================================================================
  // Authorization & RBAC
  // =========================================================================
  describe("Authorization & RBAC", () => {
    it("rejects non-members with 403", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.listPlaylists(
          { actorUserId: "outsider-user", workspaceId: validWorkspaceId },
          validAccountId
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: "SOCIAL_AUTH_REQUIRED",
        })
      );
    });

    it("denies VIEWER role from creating playlists (requires content:edit)", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValueOnce({ role: "VIEWER" });

      await expect(
        service.createPlaylist(
          { actorUserId: validUserId, workspaceId: validWorkspaceId },
          validAccountId,
          { title: "Unauthorized Playlist" }
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: "SOCIAL_AUTH_REQUIRED",
        })
      );
    });

    it("allows EDITOR role to create, update, and delete playlists", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValue({ role: "EDITOR" });

      const created = await service.createPlaylist(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        { title: "Editor Playlist" }
      );
      expect(created.id).toBe("PL_sample_playlist_1");

      const updated = await service.updatePlaylist(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "PL_sample_playlist_1",
        { title: "Updated Title" }
      );
      expect(updated.id).toBe("PL_sample_playlist_1");

      const deleted = await service.deletePlaylist(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "PL_sample_playlist_1"
      );
      expect(deleted.success).toBe(true);
    });

    it("strictly verifies OAuth write scope before creating or mutating playlist", async () => {
      mockDb.socialAccount.findFirst.mockResolvedValueOnce({
        ...defaultMockAccount,
        token: {
          scopes: ["https://www.googleapis.com/auth/youtube.readonly"], // missing write scope
        },
      });

      await expect(
        service.createPlaylist(
          { actorUserId: validUserId, workspaceId: validWorkspaceId },
          validAccountId,
          { title: "Denied Playlist" }
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_INSUFFICIENT_SCOPE",
          statusCode: 403,
        })
      );
    });
  });

  // =========================================================================
  // Playlists Operations
  // =========================================================================
  describe("Playlist Operations", () => {
    it("lists playlists with pagination", async () => {
      const result = await service.listPlaylists(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("PL_sample_playlist_1");
      expect(result.items[0].title).toBe("Test Playlist");
      expect(result.nextPageToken).toBe("next-token-123");
      expect(mockDataApiClient.listPlaylists).toHaveBeenCalledWith(
        "mock-access-token",
        "channel-yt-123",
        undefined
      );
    });

    it("creates a playlist and logs audit event", async () => {
      const result = await service.createPlaylist(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        { title: "New Series", description: "All episodes", privacyStatus: "unlisted" }
      );

      expect(result.id).toBe("PL_sample_playlist_1");
      expect(mockDataApiClient.insertPlaylist).toHaveBeenCalledWith("mock-access-token", {
        snippet: {
          title: "New Series",
          description: "All episodes",
        },
        status: {
          privacyStatus: "unlisted",
        },
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PLAYLIST_CREATED",
          resource: "playlist",
          resourceId: "PL_sample_playlist_1",
          details: expect.objectContaining({
            title: "Test Playlist",
            quotaUnitsEstimated: 50,
          }),
        })
      );
    });

    it("adds a video to a playlist and logs audit event", async () => {
      const item = await service.addVideoToPlaylist(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "PL_sample_playlist_1",
        { videoId: "video-abc-123", position: 0 }
      );

      expect(item.id).toBe("PLI_item_999");
      expect(item.videoId).toBe("video-abc-123");
      expect(mockDataApiClient.insertPlaylistItem).toHaveBeenCalledWith("mock-access-token", {
        snippet: {
          playlistId: "PL_sample_playlist_1",
          position: 0,
          resourceId: {
            kind: "youtube#video",
            videoId: "video-abc-123",
          },
        },
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PLAYLIST_ITEM_ADDED",
          resource: "playlist_item",
          resourceId: "PLI_item_999",
        })
      );
    });

    it("removes a video from playlist strictly using playlistItemId (never videoId)", async () => {
      const playlistItemId = "PLI_item_999";
      const result = await service.removeVideoFromPlaylist(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        playlistItemId
      );

      expect(result.success).toBe(true);
      expect(mockDataApiClient.deletePlaylistItem).toHaveBeenCalledWith(
        "mock-access-token",
        playlistItemId
      );
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PLAYLIST_ITEM_REMOVED",
          resourceId: playlistItemId,
        })
      );
    });

    it("reorders a playlist item", async () => {
      const item = await service.reorderPlaylistItem(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "PLI_item_999",
        "PL_sample_playlist_1",
        "video-abc-123",
        { position: 3 }
      );

      expect(item.id).toBe("PLI_item_999");
      expect(mockDataApiClient.updatePlaylistItem).toHaveBeenCalledWith("mock-access-token", {
        id: "PLI_item_999",
        snippet: {
          playlistId: "PL_sample_playlist_1",
          position: 3,
          resourceId: {
            kind: "youtube#video",
            videoId: "video-abc-123",
          },
        },
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PLAYLIST_ITEM_REORDERED",
          resourceId: "PLI_item_999",
          details: expect.objectContaining({
            newPosition: 3,
          }),
        })
      );
    });
  });

  // =========================================================================
  // Concurrency & Locking
  // =========================================================================
  describe("Concurrency & Locking", () => {
    it("rejects concurrent playlist mutation with SOCIAL_REFRESH_LOCKED (409)", async () => {
      const lockKey = `playlist-mutation:${validAccountId}:PL_sample_playlist_1`;
      // Pre-acquire lock
      const token = await lock.acquire(lockKey, { ttlMs: 30000 });
      expect(token).toBeTruthy();

      await expect(
        service.updatePlaylist(
          { actorUserId: validUserId, workspaceId: validWorkspaceId },
          validAccountId,
          "PL_sample_playlist_1",
          { title: "Contended Title" }
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_REFRESH_LOCKED",
          statusCode: 409,
        })
      );

      // Release lock and verify update succeeds
      await lock.release(lockKey, token as string);
      const updated = await service.updatePlaylist(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "PL_sample_playlist_1",
        { title: "Successful Title" }
      );
      expect(updated.id).toBe("PL_sample_playlist_1");
    });
  });
});
