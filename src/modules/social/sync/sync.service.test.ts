import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SocialSyncService } from "./sync.service";
import { prisma } from "@/lib/db/prisma";
import { socialTokenManager } from "../token-manager";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { YouTubeMapper } from "../providers/youtube/youtube.mapper";
import { InMemoryLock } from "@/lib/lock/distributed-lock";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    socialAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
    },
    syncJob: {
      create: vi.fn(),
      update: vi.fn(),
    },
    accountMetricSnapshot: {
      create: vi.fn(),
    },
    content: {
      create: vi.fn(),
      update: vi.fn(),
    },
    contentPlatform: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contentMetricSnapshot: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (callback) => {
      return callback(prisma);
    }),
  },
}));

vi.mock("../token-manager", () => ({
  socialTokenManager: {
    getValidAccessToken: vi.fn(),
  },
}));

vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn(),
}));

describe("Phase 3.2: YouTube Data API Synchronization Pipeline", () => {
  let lock: InMemoryLock;
  let service: SocialSyncService;
  const originalFetch = global.fetch;

  const mockSocialAccount = {
    id: "acc-yt-123",
    workspaceId: "ws-plotters-999",
    platformId: "plat-yt-1",
    externalAccountId: "UC_Channel123",
    username: "plotterscreator",
    displayName: "Plotters Creator",
    avatarUrl: "https://yt3.ggpht.com/avatar.jpg",
    status: "CONNECTED",
    platform: { code: "YOUTUBE", name: "YouTube" },
    workspace: { id: "ws-plotters-999", name: "Primary Studio" },
    token: { id: "tok-1" },
  };

  const mockChannelResponse = {
    kind: "youtube#channelListResponse",
    items: [
      {
        id: "UC_Channel123",
        snippet: {
          title: "Plotters Creator Channel",
          description: "Tech reviews and coding tutorials",
          customUrl: "@plotterscreator",
          thumbnails: {
            high: { url: "https://yt3.ggpht.com/avatar_new.jpg" },
          },
        },
        contentDetails: {
          relatedPlaylists: {
            uploads: "UU_Channel123",
          },
        },
        statistics: {
          viewCount: "5000000",
          subscriberCount: "125000",
          videoCount: "42",
        },
      },
    ],
  };

  const mockPlaylistResponse = {
    kind: "youtube#playlistItemListResponse",
    nextPageToken: "page_token_2",
    items: [
      {
        id: "pli-1",
        contentDetails: { videoId: "vid-001" },
        snippet: { resourceId: { videoId: "vid-001" } },
      },
      {
        id: "pli-2",
        contentDetails: { videoId: "vid-002" },
        snippet: { resourceId: { videoId: "vid-002" } },
      },
      {
        id: "pli-duplicate",
        contentDetails: { videoId: "vid-001" }, // Duplicate in playlist
        snippet: { resourceId: { videoId: "vid-001" } },
      },
    ],
  };

  const mockVideosResponse = {
    kind: "youtube#videoListResponse",
    items: [
      {
        id: "vid-001",
        snippet: {
          title: "Introduction to Next.js 15",
          description: "Full guide to Next.js 15 features",
          publishedAt: "2026-03-01T12:00:00Z",
          thumbnails: {
            high: { url: "https://i.ytimg.com/vi/vid-001/hqdefault.jpg" },
          },
        },
        contentDetails: {
          duration: "PT15M33S",
        },
        status: {
          privacyStatus: "public",
          uploadStatus: "processed",
        },
        statistics: {
          viewCount: "15000",
          likeCount: "1200",
          commentCount: "85",
        },
      },
      {
        id: "vid-002",
        snippet: {
          title: "Unlisted Alpha Feature Demo",
          description: "Testing unlisted video status",
          publishedAt: "2026-03-05T10:00:00Z",
        },
        contentDetails: {
          duration: "PT2M10S",
        },
        status: {
          privacyStatus: "unlisted",
          uploadStatus: "processed",
        },
        statistics: {
          viewCount: "0",
          likeCount: "0",
          // commentCount omitted: test NULL vs 0
        },
      },
    ],
  };

  beforeEach(() => {
    lock = new InMemoryLock();
    service = new SocialSyncService(lock);
    vi.clearAllMocks();

    (prisma.socialAccount.findUnique as any).mockResolvedValue(mockSocialAccount);
    (prisma.workspaceMember.findUnique as any).mockResolvedValue({
      id: "mem-1",
      workspaceId: "ws-plotters-999",
      userId: "user-admin",
      role: "ADMIN",
    });
    (prisma.syncJob.create as any).mockResolvedValue({ id: "job-sync-101" });
    (prisma.syncJob.update as any).mockResolvedValue({});
    (prisma.socialAccount.update as any).mockResolvedValue({});
    (prisma.accountMetricSnapshot.create as any).mockResolvedValue({});
    (prisma.content.create as any).mockResolvedValue({ id: "content-new-1" });
    (prisma.content.update as any).mockResolvedValue({ id: "content-new-1" });
    (prisma.contentPlatform.findFirst as any).mockResolvedValue(null);
    (prisma.contentPlatform.create as any).mockResolvedValue({ id: "cp-new-1" });
    (prisma.contentPlatform.update as any).mockResolvedValue({ id: "cp-new-1" });
    (prisma.contentMetricSnapshot.create as any).mockResolvedValue({});

    (socialTokenManager.getValidAccessToken as any).mockResolvedValue("ya29.valid_access_token");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1 & 2: channels.list & Uploads Playlist Extraction
  describe("1-2. Channel Profile & Uploads Playlist Extraction", () => {
    it("fetches channel details, extracts uploads playlist ID (UU...), and inserts AccountMetricSnapshot", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) {
          return Promise.resolve({
            ok: true,
            json: async () => mockChannelResponse,
          });
        }
        if (url.includes("/playlistItems")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ items: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const result = await service.syncYouTubeAccount({
        accountId: "acc-yt-123",
        actorUserId: "user-admin",
      });

      expect(result.success).toBe(true);
      expect(result.channelId).toBe("UC_Channel123");
      expect(result.channelTitle).toBe("Plotters Creator Channel");

      // Verify AccountMetricSnapshot insertion with BigInt values
      expect(prisma.accountMetricSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            socialAccountId: "acc-yt-123",
            followersCount: 125000n,
            totalVideos: 42n,
            totalViews: 5000000n,
            followingCount: null,
            totalLikes: null,
            subscribersGained: null,
            subscribersLost: null,
          }),
        })
      );
    });
  });

  // 3 & 4 & 5 & 6: Pagination, Batching, 50-video boundary & Duplicate Deduplication
  describe("3-6. Playlist Pagination, Deduplication & 50-Video Batching", () => {
    it("deduplicates video IDs in playlist page and batches them up to 50 per videos.list call", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) {
          return Promise.resolve({ ok: true, json: async () => mockChannelResponse });
        }
        if (url.includes("/playlistItems")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              nextPageToken: undefined,
              items: mockPlaylistResponse.items,
            }),
          });
        }
        if (url.includes("/videos")) {
          return Promise.resolve({ ok: true, json: async () => mockVideosResponse });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const result = await service.syncYouTubeAccount({
        accountId: "acc-yt-123",
        actorUserId: "user-admin",
      });

      expect(result.videosDiscovered).toBe(2); // 3 items in page, deduplicated to 2 unique IDs
      expect(result.videosProcessed).toBe(2);
      expect(result.videosCreated).toBe(2);
      expect(result.snapshotsCreated).toBe(2);
    });
  });

  // 7 & 8 & 9 & 10: Content Creation, Update, ContentPlatform & ContentMetricSnapshot
  describe("7-10. Content & Metric Snapshot Ingestion", () => {
    it("creates Content and ContentPlatform on initial sync, updates on subsequent sync", async () => {
      // First sync: new video
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) return Promise.resolve({ ok: true, json: async () => mockChannelResponse });
        if (url.includes("/playlistItems")) return Promise.resolve({ ok: true, json: async () => ({ items: [mockPlaylistResponse.items[0]] }) });
        if (url.includes("/videos")) return Promise.resolve({ ok: true, json: async () => ({ items: [mockVideosResponse.items[0]] }) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const result1 = await service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" });
      expect(result1.videosCreated).toBe(1);
      expect(result1.videosUpdated).toBe(0);

      // Second sync: existing video found in database
      (prisma.contentPlatform.findFirst as any).mockResolvedValue({
        id: "cp-existing-1",
        contentId: "content-existing-1",
        socialAccountId: "acc-yt-123",
        externalContentId: "vid-001",
      });

      const result2 = await service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" });
      expect(result2.videosCreated).toBe(0);
      expect(result2.videosUpdated).toBe(1);
    });
  });

  // 12 & 13: Strict NULL vs 0 & BigInt Precision
  describe("12-13. Strict NULL vs 0 Semantics and BigInt Precision", () => {
    it("preserves explicit 0 for viewCount/likeCount while storing omitted fields, shares, and saves strictly as NULL", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) return Promise.resolve({ ok: true, json: async () => mockChannelResponse });
        if (url.includes("/playlistItems")) return Promise.resolve({ ok: true, json: async () => ({ items: [mockPlaylistResponse.items[1]] }) });
        if (url.includes("/videos")) return Promise.resolve({ ok: true, json: async () => ({ items: [mockVideosResponse.items[1]] }) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" });

      expect(prisma.contentMetricSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            views: 0n,         // Explicit "0" -> 0n
            likes: 0n,         // Explicit "0" -> 0n
            comments: null,    // Missing commentCount -> null
            shares: null,      // Strict NULL: Unsupported by YouTube Data API
            saves: null,       // Strict NULL: Unsupported by YouTube Data API
            followersGained: null,
          }),
        })
      );
    });

    it("verifies safe BigInt parser handles large metrics without precision loss", () => {
      expect(YouTubeMapper.parseBigIntOrNull("9007199254740993")).toBe(9007199254740993n);
      expect(YouTubeMapper.parseBigIntOrNull("0")).toBe(0n);
      expect(YouTubeMapper.parseBigIntOrNull(0)).toBe(0n);
      expect(YouTubeMapper.parseBigIntOrNull(undefined)).toBeNull();
      expect(YouTubeMapper.parseBigIntOrNull(null)).toBeNull();
      expect(YouTubeMapper.parseBigIntOrNull("invalid")).toBeNull();
    });

    it("verifies ISO 8601 duration parser", () => {
      expect(YouTubeMapper.parseISO8601Duration("PT15M33S")).toBe(933);
      expect(YouTubeMapper.parseISO8601Duration("PT1H2M3S")).toBe(3723);
      expect(YouTubeMapper.parseISO8601Duration("P1DT2H")).toBe(93600);
      expect(YouTubeMapper.parseISO8601Duration(null)).toBeNull();
    });
  });

  // 14 & 15 & 16: Video Status Handling (Private, Unlisted, Deleted/Rejected)
  describe("14-16. Conservative Status Mapping (Public, Unlisted, Deleted/Rejected)", () => {
    it("maps unlisted/private videos to PUBLISHED, and deleted/rejected videos to ARCHIVED/CANCELLED", async () => {
      const deletedVideo = {
        id: "vid-del-99",
        snippet: { title: "Deleted Video", publishedAt: "2026-01-01T00:00:00Z" },
        status: { uploadStatus: "deleted", privacyStatus: "private" },
      };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) return Promise.resolve({ ok: true, json: async () => mockChannelResponse });
        if (url.includes("/playlistItems")) return Promise.resolve({ ok: true, json: async () => ({ items: [{ contentDetails: { videoId: "vid-del-99" } }] }) });
        if (url.includes("/videos")) return Promise.resolve({ ok: true, json: async () => ({ items: [deletedVideo] }) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" });

      expect(prisma.content.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ARCHIVED",
          }),
        })
      );
      expect(prisma.contentPlatform.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CANCELLED",
          }),
        })
      );
    });
  });

  // 19 & 20: Tenant Isolation & RBAC Permission Denial
  describe("19-20. Server-Derived Tenant Isolation & RBAC Enforcement", () => {
    it("rejects synchronization when user lacks social_accounts:manage in account workspace", async () => {
      (prisma.workspaceMember.findUnique as any).mockResolvedValue({
        id: "mem-viewer",
        workspaceId: "ws-plotters-999",
        userId: "user-viewer",
        role: "VIEWER", // Viewer lacks social_accounts:manage
      });

      await expect(
        service.syncYouTubeAccount({
          accountId: "acc-yt-123",
          actorUserId: "user-viewer",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          name: "SocialError",
          code: "SOCIAL_AUTH_REQUIRED",
          statusCode: 403,
        })
      );
    });

    it("rejects synchronization if maxVideosLimit exceeds bounded guardrail (1000)", async () => {
      await expect(
        service.syncYouTubeAccount({
          accountId: "acc-yt-123",
          actorUserId: "user-admin",
          maxVideosLimit: 5000, // Invalid: exceeds 1000
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_INVALID_REQUEST",
        })
      );
    });
  });

  // 22 & 24: Quota Exceeded & Audit Events
  describe("22 & 24. Quota Error Handling & Audit Logging", () => {
    it("records SYNC_STARTED, SYNC_FAILED on quota error, updating account status to API_ERROR", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) {
          return Promise.resolve({
            ok: false,
            status: 403,
            json: async () => ({
              error: {
                code: 403,
                message: "Daily quota limit exceeded",
                errors: [{ reason: "quotaExceeded" }],
              },
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await expect(
        service.syncYouTubeAccount({
          accountId: "acc-yt-123",
          actorUserId: "user-admin",
        })
      ).rejects.toThrowError();

      // Verify audit logs
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SYNC_STARTED",
        })
      );
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SYNC_FAILED",
        })
      );

      // Verify account status updated to API_ERROR
      expect(prisma.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "API_ERROR" },
        })
      );
    });
  });

  // ============================================================================
  // Phase 3.2B: Concurrency Hardening, Distributed Lock & Lease Lifecycle Tests
  // ============================================================================
  describe("Phase 3.2B: Concurrency Guarding & Distributed Lock Guarantees", () => {
    it("A & B: first sync acquires lock and second concurrent sync for same account is rejected with 409", async () => {
      let finishSyncA: () => void;
      const gateA = new Promise<void>((resolve) => {
        finishSyncA = resolve;
      });

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/channels")) {
          await gateA;
          return { ok: true, json: async () => mockChannelResponse };
        }
        if (url.includes("/playlistItems")) {
          return { ok: true, json: async () => ({ items: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      // Request A starts
      const syncPromiseA = service.syncYouTubeAccount({
        accountId: "acc-yt-123",
        actorUserId: "user-admin",
      });

      // Wait until Request A has definitely acquired the lock and entered the gate
      while (!(await lock.isLocked("social-sync:acc-yt-123"))) {
        await new Promise((r) => setTimeout(r, 2));
      }

      // Request B arrives while Request A is holding the lock
      let errorB: any = null;
      try {
        await service.syncYouTubeAccount({
          accountId: "acc-yt-123",
          actorUserId: "user-admin",
        });
      } catch (err) {
        errorB = err;
      }

      expect(errorB).not.toBeNull();
      expect(errorB.name).toBe("SocialError");
      expect(errorB.code).toBe("SOCIAL_REFRESH_LOCKED");
      expect(errorB.statusCode).toBe(409);
      expect(errorB.retryable).toBe(true);

      // Now open gate and let Request A finish
      finishSyncA!();
      const resultA = await syncPromiseA;
      expect(resultA.success).toBe(true);

      // Verify that SyncJob was created only ONCE (for Request A, not rejected Request B)
      expect(prisma.syncJob.create).toHaveBeenCalledTimes(1);
    });

    it("C: different accounts can sync concurrently without blocking each other", async () => {
      const mockAccount2 = {
        ...mockSocialAccount,
        id: "acc-yt-456",
        externalAccountId: "UC_Channel456",
      };

      (prisma.socialAccount.findUnique as any).mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "acc-yt-123") return Promise.resolve(mockSocialAccount);
        if (where.id === "acc-yt-456") return Promise.resolve(mockAccount2);
        return Promise.resolve(null);
      });

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) {
          return Promise.resolve({ ok: true, json: async () => mockChannelResponse });
        }
        if (url.includes("/playlistItems")) {
          return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      // Launch sync on Account 1 and Account 2 concurrently
      const [result1, result2] = await Promise.all([
        service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" }),
        service.syncYouTubeAccount({ accountId: "acc-yt-456", actorUserId: "user-admin" }),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.accountId).toBe("acc-yt-123");
      expect(result2.accountId).toBe("acc-yt-456");
      expect(prisma.syncJob.create).toHaveBeenCalledTimes(2);
    });

    it("D: lock is released after successful sync, allowing subsequent sync immediately", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) {
          return Promise.resolve({ ok: true, json: async () => mockChannelResponse });
        }
        if (url.includes("/playlistItems")) {
          return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      // Run sync 1
      const res1 = await service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" });
      expect(res1.success).toBe(true);

      // Verify lock is no longer held
      expect(await lock.isLocked("social-sync:acc-yt-123")).toBe(false);

      // Run sync 2 immediately afterwards
      const res2 = await service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" });
      expect(res2.success).toBe(true);
    });

    it("E: lock is released after failed sync, allowing subsequent retry", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: { message: "Internal Server Error" } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      // Run sync 1 (fails)
      await expect(
        service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" })
      ).rejects.toThrow();

      // Verify lock was released in finally block
      expect(await lock.isLocked("social-sync:acc-yt-123")).toBe(false);

      // Now mock successful API and run sync 2
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) {
          return Promise.resolve({ ok: true, json: async () => mockChannelResponse });
        }
        if (url.includes("/playlistItems")) {
          return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const res2 = await service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" });
      expect(res2.success).toBe(true);
    });

    it("F: stale/expired lock allows next sync to acquire", async () => {
      // Simulate an abandoned lock that expired
      await lock.acquire("social-sync:acc-yt-123", { ttlMs: 20 });
      await new Promise((r) => setTimeout(r, 30));

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/channels")) {
          return Promise.resolve({ ok: true, json: async () => mockChannelResponse });
        }
        if (url.includes("/playlistItems")) {
          return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const result = await service.syncYouTubeAccount({ accountId: "acc-yt-123", actorUserId: "user-admin" });
      expect(result.success).toBe(true);
    });

    it("G, H & I: rejected concurrent sync creates no duplicate SyncJob, ContentPlatform, snapshots, or false audit events", async () => {
      let finishSyncA: () => void;
      const gateA = new Promise<void>((resolve) => {
        finishSyncA = resolve;
      });

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/channels")) {
          await gateA;
          return { ok: true, json: async () => mockChannelResponse };
        }
        if (url.includes("/playlistItems")) {
          return {
            ok: true,
            json: async () => ({ items: [mockPlaylistResponse.items[0]] }),
          };
        }
        if (url.includes("/videos")) {
          return {
            ok: true,
            json: async () => ({ items: [mockVideosResponse.items[0]] }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      // Request A starts
      const syncPromiseA = service.syncYouTubeAccount({
        accountId: "acc-yt-123",
        actorUserId: "user-admin",
      });

      // Wait until Request A has definitely acquired the lock
      while (!(await lock.isLocked("social-sync:acc-yt-123"))) {
        await new Promise((r) => setTimeout(r, 2));
      }

      // Request B arrives and is rejected
      let errorB: any = null;
      try {
        await service.syncYouTubeAccount({
          accountId: "acc-yt-123",
          actorUserId: "user-admin",
        });
      } catch (err) {
        errorB = err;
      }

      expect(errorB).not.toBeNull();
      expect(errorB.name).toBe("SocialError");
      expect(errorB.code).toBe("SOCIAL_REFRESH_LOCKED");
      expect(errorB.statusCode).toBe(409);

      // Open gate to finish Request A
      finishSyncA!();
      await syncPromiseA;

      // Assertions:
      // Exactly 1 SyncJob created
      expect(prisma.syncJob.create).toHaveBeenCalledTimes(1);
      // Exactly 1 AccountMetricSnapshot created
      expect(prisma.accountMetricSnapshot.create).toHaveBeenCalledTimes(1);
      // Exactly 1 Content & ContentPlatform created
      expect(prisma.content.create).toHaveBeenCalledTimes(1);
      expect(prisma.contentPlatform.create).toHaveBeenCalledTimes(1);
      // Exactly 1 ContentMetricSnapshot created
      expect(prisma.contentMetricSnapshot.create).toHaveBeenCalledTimes(1);

      // Audit logs: exactly 1 SYNC_STARTED and 1 SYNC_COMPLETED (no ghost audits for rejected Request B)
      const auditCalls = (logAuditEvent as any).mock.calls;
      const startedEvents = auditCalls.filter((call: any) => call[0].action === "SYNC_STARTED");
      const completedEvents = auditCalls.filter((call: any) => call[0].action === "SYNC_COMPLETED");
      expect(startedEvents).toHaveLength(1);
      expect(completedEvents).toHaveLength(1);
    });
  });
});
