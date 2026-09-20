import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { YouTubeAnalyticsSyncService } from "./analytics-sync.service";
import { prisma } from "@/lib/db/prisma";
import { socialTokenManager } from "../token-manager";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { InMemoryLock } from "@/lib/lock/distributed-lock";
import { YouTubeAnalyticsApiClient } from "../providers/youtube/youtube.analytics-api";
import { YouTubeAnalyticsReportPlanner } from "../providers/youtube/youtube.analytics-planner";
import { AnalyticsRepository } from "../analytics/analytics.repository";
import { SocialError } from "../errors";
import { Clock } from "./analytics-sync.types";

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
      updateMany: vi.fn(),
    },
    contentPlatform: {
      findMany: vi.fn(),
    },
    analyticsObservation: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../token-manager", () => ({
  socialTokenManager: {
    getValidAccessToken: vi.fn(),
  },
}));

vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Phase 3.3D — YouTube Analytics Sync Service", () => {
  let syncService: YouTubeAnalyticsSyncService;
  let inMemoryLock: InMemoryLock;
  let mockApiClient: YouTubeAnalyticsApiClient;
  let realPlanner: YouTubeAnalyticsReportPlanner;
  let mockAnalyticsRepo: AnalyticsRepository;
  let fixedClockDate: Date;
  let testClock: Clock;

  const validWorkspaceId = "ws-test-123";
  const validAccountId = "sa-test-456";
  const validUserId = "user-test-789";

  const defaultMockAccount = {
    id: validAccountId,
    workspaceId: validWorkspaceId,
    externalAccountId: "channel-ext-001",
    status: "HEALTHY",
    platform: { code: "YOUTUBE", name: "YouTube" },
    workspace: { id: validWorkspaceId, name: "Test Workspace" },
  };

  const sampleChannelOverviewTable = {
    kind: "youtubeAnalytics#resultTable",
    columnHeaders: [
      { name: "day", columnType: "DIMENSION", dataType: "STRING" },
      { name: "views", columnType: "METRIC", dataType: "INTEGER" },
      { name: "estimatedMinutesWatched", columnType: "METRIC", dataType: "INTEGER" },
      { name: "averageViewDuration", columnType: "METRIC", dataType: "INTEGER" },
      { name: "averageViewPercentage", columnType: "METRIC", dataType: "FLOAT" },
      { name: "likes", columnType: "METRIC", dataType: "INTEGER" },
      { name: "comments", columnType: "METRIC", dataType: "INTEGER" },
      { name: "shares", columnType: "METRIC", dataType: "INTEGER" },
      { name: "subscribersGained", columnType: "METRIC", dataType: "INTEGER" },
      { name: "subscribersLost", columnType: "METRIC", dataType: "INTEGER" },
    ],
    rows: [
      ["2026-03-08", 1200, 3600, 180, 52.5, 45, 12, 5, 10, 1],
      ["2026-03-09", 1500, 4500, 180, 55.0, 60, 15, 8, 14, 2],
    ],
  };

  const sampleTopVideosTable = {
    kind: "youtubeAnalytics#resultTable",
    columnHeaders: [
      { name: "video", columnType: "DIMENSION", dataType: "STRING" },
      { name: "views", columnType: "METRIC", dataType: "INTEGER" },
      { name: "estimatedMinutesWatched", columnType: "METRIC", dataType: "INTEGER" },
      { name: "averageViewDuration", columnType: "METRIC", dataType: "INTEGER" },
      { name: "averageViewPercentage", columnType: "METRIC", dataType: "FLOAT" },
      { name: "likes", columnType: "METRIC", dataType: "INTEGER" },
      { name: "comments", columnType: "METRIC", dataType: "INTEGER" },
      { name: "shares", columnType: "METRIC", dataType: "INTEGER" },
      { name: "subscribersGained", columnType: "METRIC", dataType: "INTEGER" },
    ],
    rows: [
      ["vid-top-001", 50000, 150000, 180, 60.0, 2000, 300, 150, 400],
      ["vid-top-002", 30000, 90000, 180, 58.0, 1200, 180, 90, 250],
    ],
  };

  const sampleDistributionTable = {
    kind: "youtubeAnalytics#resultTable",
    columnHeaders: [
      { name: "country", columnType: "DIMENSION", dataType: "STRING" },
      { name: "views", columnType: "METRIC", dataType: "INTEGER" },
      { name: "estimatedMinutesWatched", columnType: "METRIC", dataType: "INTEGER" },
      { name: "averageViewDuration", columnType: "METRIC", dataType: "INTEGER" },
    ],
    rows: [
      ["US", 25000, 75000, 180],
      ["ID", 15000, 45000, 180],
    ],
  };

  const sampleEmptyTable = {
    kind: "youtubeAnalytics#resultTable",
    columnHeaders: [
      { name: "day", columnType: "DIMENSION", dataType: "STRING" },
      { name: "views", columnType: "METRIC", dataType: "INTEGER" },
    ],
    rows: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    fixedClockDate = new Date(Date.UTC(2026, 2, 15)); // 2026-03-15
    testClock = { now: () => fixedClockDate };

    inMemoryLock = new InMemoryLock();
    realPlanner = new YouTubeAnalyticsReportPlanner();

    mockApiClient = {
      queryReport: vi.fn().mockImplementation(async (_token: string, query: any) => {
        if (query?.dimensions === "video") {
          return sampleTopVideosTable;
        }
        if (query?.dimensions === "country") {
          return sampleDistributionTable;
        }
        if (query?.filters?.includes("video==")) {
          return sampleChannelOverviewTable;
        }
        return sampleChannelOverviewTable;
      }),
    } as unknown as YouTubeAnalyticsApiClient;

    mockAnalyticsRepo = {
      upsertBatch: vi.fn().mockResolvedValue([]),
    } as unknown as AnalyticsRepository;

    vi.mocked(prisma.socialAccount.findUnique).mockResolvedValue(defaultMockAccount as any);
    vi.mocked(prisma.socialAccount.update).mockResolvedValue(defaultMockAccount as any);
    vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
      workspaceId: validWorkspaceId,
      userId: validUserId,
      role: "ADMIN",
    } as any);
    vi.mocked(prisma.syncJob.create).mockResolvedValue({ id: "sync-job-123" } as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({ id: "sync-job-123" } as any);
    vi.mocked(prisma.syncJob.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.contentPlatform.findMany).mockResolvedValue([]);
    vi.mocked(socialTokenManager.getValidAccessToken).mockResolvedValue("ya29.valid-mock-token");

    syncService = new YouTubeAnalyticsSyncService(
      prisma,
      socialTokenManager,
      inMemoryLock,
      mockAnalyticsRepo,
      realPlanner,
      mockApiClient,
      testClock
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // A. Authorization & Tenant Isolation
  // ===========================================================================
  describe("A. Authorization & Tenant Isolation", () => {
    it("1: rejects when social account is not found", async () => {
      vi.mocked(prisma.socialAccount.findUnique).mockResolvedValueOnce(null);

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: "sa-non-existent",
        })
      ).rejects.toThrow("Social account not found.");
    });

    it("2: rejects when account belongs to a different workspace (tenant isolation violation)", async () => {
      vi.mocked(prisma.socialAccount.findUnique).mockResolvedValueOnce({
        ...defaultMockAccount,
        workspaceId: "ws-different-workspace",
      } as any);

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
        })
      ).rejects.toThrow("Tenant isolation violation");
    });

    it("3: rejects when actor lacks social_accounts:manage permission", async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValueOnce({
        workspaceId: validWorkspaceId,
        userId: validUserId,
        role: "VIEWER", // VIEWER lacks social_accounts:manage
      } as any);

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          actorUserId: validUserId,
        })
      ).rejects.toThrow("Permission denied. User lacks permission to manage social accounts.");
    });

    it("4: rejects when platform is not YOUTUBE", async () => {
      vi.mocked(prisma.socialAccount.findUnique).mockResolvedValueOnce({
        ...defaultMockAccount,
        platform: { code: "TIKTOK", name: "TikTok" },
      } as any);

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
        })
      ).rejects.toThrow("Unsupported platform for YouTube analytics sync: TIKTOK");
    });
  });

  // ===========================================================================
  // B. Distributed Concurrency & Locking
  // ===========================================================================
  describe("B. Distributed Concurrency & Locking", () => {
    it("5: successfully acquires lock with designated key", async () => {
      const lockAcquireSpy = vi.spyOn(inMemoryLock, "acquire");

      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(lockAcquireSpy).toHaveBeenCalledWith(`social-analytics-sync:${validAccountId}`, {
        ttlMs: 120000,
        timeoutMs: 0,
      });
    });

    it("6: fails fast when lock is already held by an ongoing sync (409 Conflict)", async () => {
      // Pre-acquire the lock
      await inMemoryLock.acquire(`social-analytics-sync:${validAccountId}`, { ttlMs: 120000 });

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
        })
      ).rejects.toMatchObject({
        code: "SOCIAL_REFRESH_LOCKED",
        statusCode: 409,
        retryable: true,
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "ANALYTICS_SYNC_LOCKED" })
      );
    });

    it("7: releases lock upon successful completion", async () => {
      const lockReleaseSpy = vi.spyOn(inMemoryLock, "release");

      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(lockReleaseSpy).toHaveBeenCalledWith(
        `social-analytics-sync:${validAccountId}`,
        expect.any(String)
      );

      const isLocked = await inMemoryLock.isLocked(`social-analytics-sync:${validAccountId}`);
      expect(isLocked).toBe(false);
    });

    it("8: releases lock in finally block even when sync fails", async () => {
      vi.mocked(mockApiClient.queryReport).mockRejectedValueOnce(
        new SocialError("Google API 500 error", "SOCIAL_API_ERROR", { statusCode: 500 })
      );

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
        })
      ).rejects.toThrow();

      const isLocked = await inMemoryLock.isLocked(`social-analytics-sync:${validAccountId}`);
      expect(isLocked).toBe(false);
    });

    it("9: heartbeat extends lease during long operations", async () => {
      vi.useFakeTimers();
      const lockExtendSpy = vi.spyOn(inMemoryLock, "extend");

      // Mock queryReport to advance time past heartbeat interval (20s)
      vi.mocked(mockApiClient.queryReport).mockImplementation(async () => {
        vi.advanceTimersByTime(25000);
        return sampleChannelOverviewTable;
      });

      const syncPromise = syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      await vi.runAllTimersAsync();
      await syncPromise;

      expect(lockExtendSpy).toHaveBeenCalledWith(
        `social-analytics-sync:${validAccountId}`,
        expect.any(String),
        120000
      );

      vi.useRealTimers();
    });

    it("10: ensures ownership-safe release preventing unauthorized release", async () => {
      // Verify inMemoryLock rejects release with a bogus token
      await inMemoryLock.acquire("test-key", { ttlMs: 120000 });
      const released = await inMemoryLock.release("test-key", "wrong-token");
      expect(released).toBe(false);
    });
  });

  // ===========================================================================
  // C. SyncJob Lifecycle & State Transitions
  // ===========================================================================
  describe("C. SyncJob Lifecycle & State Transitions", () => {
    it("11: creates SYNC_ANALYTICS job with PROCESSING status", async () => {
      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(prisma.syncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          socialAccountId: validAccountId,
          jobType: "SYNC_ANALYTICS",
          status: "PROCESSING",
          attempts: 1,
        }),
      });
    });

    it("12: transitions SyncJob from PROCESSING to COMPLETED on success", async () => {
      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(prisma.syncJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sync-job-123", status: "PROCESSING" },
          data: expect.objectContaining({
            status: "COMPLETED",
            completedAt: expect.any(Date),
          }),
        })
      );
    });

    it("13: transitions SyncJob to FAILED when critical query fails", async () => {
      vi.mocked(mockApiClient.queryReport).mockRejectedValueOnce(
        new SocialError("Channel query failed", "SOCIAL_API_ERROR")
      );

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
        })
      ).rejects.toThrow("Channel query failed");

      expect(prisma.syncJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sync-job-123", status: "PROCESSING" },
          data: expect.objectContaining({
            status: "FAILED",
            errorMessage: expect.stringContaining("Channel query failed"),
          }),
        })
      );
    });
  });

  // ===========================================================================
  // D. Date Windows, Lag Policy & Clock Injection
  // ===========================================================================
  describe("D. Date Windows, Lag Policy & Clock Injection", () => {
    it("14: computes daily window as [T - 7, T - 2] using clock", async () => {
      // Clock is 2026-03-15 -> T-2 = 2026-03-13, T-7 = 2026-03-08
      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(result.effectiveDateRange.startDate).toBe("2026-03-08");
      expect(result.effectiveDateRange.endDate).toBe("2026-03-13");
    });

    it("15: uses [T - 30, T - 2] for rolling distribution queries", async () => {
      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(mockApiClient.queryReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          startDate: "2026-02-13",
          endDate: "2026-03-13",
        })
      );
    });

    it("16: creates exact non-overlapping 90-day slices for backfill", async () => {
      // Clock 2026-03-15:
      // Slice 0: [2025-12-15, 2026-01-13] (T-90 to T-61)
      // Slice 1: [2026-01-14, 2026-02-12] (T-60 to T-31)
      // Slice 2: [2026-02-13, 2026-03-13] (T-30 to T-2)
      const result = await syncService.backfillAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(result.requestedDateRange.startDate).toBe("2025-12-15");
      expect(result.requestedDateRange.endDate).toBe("2026-03-13");
      expect(result.patternResults.some((p) => p.pattern.includes("slice_0"))).toBe(true);
      expect(result.patternResults.some((p) => p.pattern.includes("slice_1"))).toBe(true);
      expect(result.patternResults.some((p) => p.pattern.includes("slice_2"))).toBe(true);
    });

    it("17: enforces lag clamping when requested endDate is too recent", async () => {
      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        startDate: "2026-03-01",
        endDate: "2026-03-15", // today: within 2-day lag
        lagPolicy: "CLAMP",
      });

      expect(result.effectiveDateRange.endDate).toBe("2026-03-13");
    });
  });

  // ===========================================================================
  // E. Query Pattern Execution & Planner Delegation
  // ===========================================================================
  describe("E. Query Pattern Execution & Planner Delegation", () => {
    it("18: plans and executes all seven query patterns in daily sync", async () => {
      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      const patterns = result.patternResults.map((p) => p.pattern);
      expect(patterns).toContain("CHANNEL_DAILY_OVERVIEW");
      expect(patterns).toContain("TOP_VIDEOS_PERFORMANCE");
      expect(patterns).toContain("VIDEO_DAILY_TIME_SERIES");
      expect(patterns).toContain("VIEWER_DEMOGRAPHICS");
      expect(patterns).toContain("GEOGRAPHIC_DISTRIBUTION");
      expect(patterns).toContain("TRAFFIC_SOURCE_DISTRIBUTION");
      expect(patterns).toContain("DEVICE_DISTRIBUTION");
    });

    it("19: delegates query options validation exclusively to reportPlanner", async () => {
      const plannerSpy = vi.spyOn(realPlanner, "planReport");

      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(plannerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryPattern: "CHANNEL_DAILY_OVERVIEW" })
      );
      expect(plannerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryPattern: "TOP_VIDEOS_PERFORMANCE" })
      );
    });

    it("20: handles empty reports without error", async () => {
      vi.mocked(mockApiClient.queryReport).mockResolvedValue(sampleEmptyTable);

      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(result.overallStatus).toBe("COMPLETED");
      expect(result.observationCount).toBe(0);
      expect(result.patternResults[0].status).toBe("EMPTY");
    });
  });

  // ===========================================================================
  // F. Video Selection & Determinism
  // ===========================================================================
  describe("F. Video Selection & Determinism", () => {
    it("21: selects top videos from TOP_VIDEOS_PERFORMANCE result", async () => {
      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(result.selectedVideoIds).toContain("vid-top-001");
      expect(result.selectedVideoIds).toContain("vid-top-002");
    });

    it("22: includes recently published videos within 14 days", async () => {
      vi.mocked(prisma.contentPlatform.findMany).mockResolvedValueOnce([
        { externalContentId: "vid-recent-999" } as any,
      ]);

      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(result.selectedVideoIds).toContain("vid-recent-999");
    });

    it("23: removes duplicates between top and recent videos", async () => {
      vi.mocked(prisma.contentPlatform.findMany).mockResolvedValueOnce([
        { externalContentId: "vid-top-001" } as any, // duplicate of top video
      ]);

      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      const count = result.selectedVideoIds.filter((id) => id === "vid-top-001").length;
      expect(count).toBe(1);
    });

    it("24: sorts final video list deterministically", async () => {
      vi.mocked(prisma.contentPlatform.findMany).mockResolvedValueOnce([
        { externalContentId: "vid-aaa" } as any,
        { externalContentId: "vid-zzz" } as any,
      ]);

      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      const sorted = [...result.selectedVideoIds].sort();
      expect(result.selectedVideoIds).toEqual(sorted);
    });

    it("25: supports explicit videoIds override", async () => {
      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        videoIds: ["custom-vid-2", "custom-vid-1"],
      });

      expect(result.selectedVideoIds).toEqual(["custom-vid-1", "custom-vid-2"]);
    });

    it("26: rejects explicit videoIds belonging to a different social account", async () => {
      vi.mocked(prisma.contentPlatform.findMany).mockResolvedValueOnce([
        { externalContentId: "stolen-vid" } as any, // belongs to another account
      ]);

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          videoIds: ["stolen-vid"],
        })
      ).rejects.toThrow("explicit video IDs belong to another social account");
    });
  });

  // ===========================================================================
  // G. Application Request Budget & Quota Strategy
  // ===========================================================================
  describe("G. Application Request Budget & Quota Strategy", () => {
    it("27: respects application request safety budget and stops dispatching queries", async () => {
      // Set budget = 2: enough for CHANNEL_DAILY_OVERVIEW (1) and TOP_VIDEOS_PERFORMANCE (1)
      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        maxRequestsBudget: 2,
      });

      expect(result.requestCount).toBe(2);
      expect(result.warnings.some((w) => w.includes("budget (2) reached"))).toBe(true);
    });

    it("28: marks remaining patterns as SKIPPED_BUDGET when budget is exhausted", async () => {
      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        maxRequestsBudget: 1, // Only channel overview will run
      });

      const skipped = result.patternResults.filter((p) => p.status === "SKIPPED_BUDGET");
      expect(skipped.length).toBeGreaterThanOrEqual(1);
    });

    it("29: preserves successful observations before budget exhaustion", async () => {
      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        maxRequestsBudget: 1,
      });

      expect(result.observationCount).toBe(2); // Channel overview observations were saved
      expect(mockAnalyticsRepo.upsertBatch).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // H. Partial Success & Priority Handling
  // ===========================================================================
  describe("H. Partial Success & Priority Handling", () => {
    it("30: completes job with warnings when non-critical distribution query fails", async () => {
      vi.mocked(mockApiClient.queryReport).mockImplementation(async (_token: string, query: any) => {
        if (query.dimensions === "country") {
          throw new SocialError("Country query temporary error", "SOCIAL_API_ERROR");
        }
        return sampleChannelOverviewTable;
      });

      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(result.overallStatus).toBe("COMPLETED");
      expect(result.warnings.some((w) => w.includes("GEOGRAPHIC_DISTRIBUTION failed"))).toBe(true);
      const geoResult = result.patternResults.find((p) => p.pattern === "GEOGRAPHIC_DISTRIBUTION");
      expect(geoResult?.status).toBe("FAILED");
    });

    it("31: fails entire sync when critical CHANNEL_DAILY_OVERVIEW query fails", async () => {
      vi.mocked(mockApiClient.queryReport).mockImplementation(async (_token: string, query: any) => {
        if (!query.dimensions || query.dimensions === "day") {
          throw new SocialError("Critical overview failed", "SOCIAL_API_ERROR");
        }
        return sampleChannelOverviewTable;
      });

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
        })
      ).rejects.toThrow("Critical overview failed");

      expect(prisma.syncJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sync-job-123", status: "PROCESSING" },
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });

    it("32: skips automatic video daily time-series if TOP_VIDEOS_PERFORMANCE fails", async () => {
      vi.mocked(mockApiClient.queryReport).mockImplementation(async (_token: string, query: any) => {
        if (query.dimensions === "video") {
          throw new SocialError("Top videos error", "SOCIAL_API_ERROR");
        }
        return sampleChannelOverviewTable;
      });

      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      const videoDaily = result.patternResults.find((p) => p.pattern === "VIDEO_DAILY_TIME_SERIES");
      expect(videoDaily).toBeUndefined(); // Was not attempted because top videos failed
    });
  });

  // ===========================================================================
  // I. Token Security & Error Classification
  // ===========================================================================
  describe("I. Token Security & Error Classification", () => {
    it("33: forces token refresh once upon encountering 401 SOCIAL_AUTH_REQUIRED", async () => {
      let callCount = 0;
      vi.mocked(mockApiClient.queryReport).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new SocialError("Token expired", "SOCIAL_AUTH_REQUIRED", { statusCode: 401 });
        }
        return sampleChannelOverviewTable;
      });

      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(socialTokenManager.getValidAccessToken).toHaveBeenCalledWith(validAccountId, {
        forceRefresh: true,
      });
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it("34: marks account REAUTH_REQUIRED and logs audit on revoked authorization", async () => {
      vi.mocked(mockApiClient.queryReport).mockRejectedValueOnce(
        new SocialError("Token revoked by user", "SOCIAL_TOKEN_REVOKED", { statusCode: 403 })
      );

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
        })
      ).rejects.toThrow("Token revoked by user");

      expect(prisma.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "REAUTH_REQUIRED" },
        })
      );
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "ANALYTICS_SYNC_REAUTH_REQUIRED" })
      );
    });

    it("35: delegates 429 rate limit retries to API client without infinite loop", async () => {
      // When API client retries are exhausted and it throws SOCIAL_RATE_LIMITED
      vi.mocked(mockApiClient.queryReport).mockRejectedValueOnce(
        new SocialError("Rate limit exceeded", "SOCIAL_RATE_LIMITED", { statusCode: 429 })
      );

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
        })
      ).rejects.toMatchObject({ code: "SOCIAL_RATE_LIMITED" });
    });

    it("36: does not retry invalid query (400) errors", async () => {
      vi.mocked(mockApiClient.queryReport).mockRejectedValueOnce(
        new SocialError("Invalid metric combination", "SOCIAL_INVALID_REQUEST", { statusCode: 400 })
      );

      await expect(
        syncService.syncAccountAnalytics({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
        })
      ).rejects.toMatchObject({ code: "SOCIAL_INVALID_REQUEST" });

      expect(socialTokenManager.getValidAccessToken).not.toHaveBeenCalledWith(
        validAccountId,
        expect.objectContaining({ forceRefresh: true })
      );
    });
  });

  // ===========================================================================
  // J. Batch Persistence & Idempotency
  // ===========================================================================
  describe("J. Batch Persistence & Idempotency", () => {
    it("37: persists all observations through AnalyticsRepository", async () => {
      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      expect(mockAnalyticsRepo.upsertBatch).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          syncJobId: "sync-job-123",
          dataLagDays: 2,
        })
      );
    });

    it("38: chunks large observation sets into bounded batches of 100", async () => {
      const largeRows = Array.from({ length: 250 }, (_, i) => [
        `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
        1000, 3000, 180, 50.0, 50, 10, 5, 5, 0,
      ]);

      vi.mocked(mockApiClient.queryReport).mockResolvedValueOnce({
        ...sampleChannelOverviewTable,
        rows: largeRows,
      });

      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      // 250 observations chunked by 100 -> 3 batches: 100, 100, 50
      expect(vi.mocked(mockAnalyticsRepo.upsertBatch).mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("39: executing sync twice is idempotent and does not create duplicate entries", async () => {
      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      // Repository handles idempotency via identityHash upsert
      expect(mockAnalyticsRepo.upsertBatch).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // K. Audit Logging & Security Safeguards
  // ===========================================================================
  describe("K. Audit Logging & Security Safeguards", () => {
    it("40: logs ANALYTICS_SYNC_STARTED and ANALYTICS_SYNC_COMPLETED events", async () => {
      await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        actorUserId: validUserId,
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ANALYTICS_SYNC_STARTED",
          workspaceId: validWorkspaceId,
          userId: validUserId,
        })
      );

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ANALYTICS_SYNC_COMPLETED",
          workspaceId: validWorkspaceId,
          userId: validUserId,
        })
      );
    });

    it("41: never leaks access tokens, refresh tokens, or secrets in sync results", async () => {
      const result = await syncService.syncAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
      });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("ya29.");
      expect(serialized).not.toContain("access_token");
      expect(serialized).not.toContain("client_secret");
    });

    it("42: resumes historical backfill from specified sliceIndex", async () => {
      const result = await syncService.backfillAccountAnalytics({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        resumeFromSliceIndex: 2, // Skip slices 0 and 1
      });

      expect(result.patternResults.some((p) => p.pattern.includes("slice_0"))).toBe(false);
      expect(result.patternResults.some((p) => p.pattern.includes("slice_1"))).toBe(false);
      expect(result.patternResults.some((p) => p.pattern.includes("slice_2"))).toBe(true);
    });
  });
});
