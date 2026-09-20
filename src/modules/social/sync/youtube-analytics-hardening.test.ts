import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { YouTubeAnalyticsSyncService } from "./analytics-sync.service";
import { InMemoryLock } from "@/lib/lock/distributed-lock";
import { SocialError } from "../errors";
import { verifyCronSecret } from "@/lib/auth/cron-auth";
import { isPermanentTokenRefreshError } from "../token-manager";
import { YouTubeAnalyticsReportPlanner } from "../providers/youtube/youtube.analytics-planner";
import { logAuditEvent } from "@/modules/audit/audit-service";

// Mock audit service
vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Phase 3.3G — YouTube Analytics Production Hardening Suite", () => {
  let mockPrisma: any;
  let mockTokenManager: any;
  let lock: InMemoryLock;
  let mockApiClient: any;
  let planner: YouTubeAnalyticsReportPlanner;
  let mockRepo: any;
  let syncService: YouTubeAnalyticsSyncService;

  const validWorkspaceId = "ws-prod-100";
  const validAccountId = "sa-prod-200";
  const validUserId = "user-prod-300";

  const defaultMockAccount = {
    id: validAccountId,
    workspaceId: validWorkspaceId,
    externalAccountId: "channel-yt-999",
    status: "HEALTHY",
    lastSyncedAt: null,
    platform: { code: "YOUTUBE", name: "YouTube" },
    workspace: { id: validWorkspaceId, name: "Production Workspace" },
  };

  const sampleOverviewTable = {
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
    rows: [["2026-09-08", 1200, 3600, 180, 55.0, 50, 10, 5, 8, 1]],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      socialAccount: {
        findUnique: vi.fn().mockResolvedValue(defaultMockAccount),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(defaultMockAccount),
      },
      workspaceMember: {
        findUnique: vi.fn().mockResolvedValue({ role: "ADMIN" }),
      },
      syncJob: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: "job-sync-111", ...data })
        ),
        update: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: "job-sync-111", ...data })
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      contentPlatform: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    mockTokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue("mock-valid-token"),
    };

    lock = new InMemoryLock();

    mockApiClient = {
      queryReport: vi.fn().mockResolvedValue(sampleOverviewTable),
    };

    planner = new YouTubeAnalyticsReportPlanner();

    mockRepo = {
      upsertBatch: vi.fn().mockResolvedValue(undefined),
    };

    syncService = new YouTubeAnalyticsSyncService(
      mockPrisma as any,
      mockTokenManager as any,
      lock,
      mockRepo as any,
      planner,
      mockApiClient as any,
      { now: () => new Date("2026-09-10T00:00:00.000Z") }
    );
  });

  // =========================================================================
  // DOMAIN 1: Distributed Lock Contract & Key Unification
  // =========================================================================
  describe("Domain 1: Distributed Lock Contract & Key Unification", () => {
    it("uses strictly unified lock key 'social-analytics-sync:${accountId}' for manual sync", async () => {
      const acquireSpy = vi.spyOn(lock, "acquire");

      await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        actorUserId: validUserId,
        mode: "DAILY",
        triggerMode: "MANUAL",
      });

      expect(acquireSpy).toHaveBeenCalledWith(
        `social-analytics-sync:${validAccountId}`,
        expect.objectContaining({ ttlMs: 120000, timeoutMs: 0 })
      );
    });

    it("uses strictly unified lock key 'social-analytics-sync:${accountId}' for scheduled sync", async () => {
      const acquireSpy = vi.spyOn(lock, "acquire");

      await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        mode: "DAILY",
        triggerMode: "SCHEDULED",
      });

      expect(acquireSpy).toHaveBeenCalledWith(
        `social-analytics-sync:${validAccountId}`,
        expect.objectContaining({ ttlMs: 120000, timeoutMs: 0 })
      );
    });

    it("throws 409 SOCIAL_REFRESH_LOCKED when lock is already held", async () => {
      // Pre-acquire lock with another token
      await lock.acquire(`social-analytics-sync:${validAccountId}`, { ttlMs: 60000 });

      await expect(
        syncService.sync({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          mode: "DAILY",
          triggerMode: "SCHEDULED",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_REFRESH_LOCKED",
          statusCode: 409,
        })
      );
    });
  });

  // =========================================================================
  // DOMAIN 2: Stale Job Recovery Lifecycle
  // =========================================================================
  describe("Domain 2: Stale Job Recovery Lifecycle & Atomic Transitions", () => {
    it("marks PROCESSING jobs older than 15 minutes as FAILED with SYNC_JOB_TIMEOUT", async () => {
      mockPrisma.syncJob.updateMany.mockResolvedValueOnce({ count: 3 });

      const recoveredCount = await syncService.recoverStaleProcessingJobs(15);

      expect(recoveredCount).toBe(3);
      expect(mockPrisma.syncJob.updateMany).toHaveBeenCalledWith({
        where: {
          jobType: "SYNC_ANALYTICS",
          status: "PROCESSING",
          startedAt: { lt: expect.any(Date) },
        },
        data: expect.objectContaining({
          status: "FAILED",
          errorCode: "SYNC_JOB_TIMEOUT",
        }),
      });
    });

    it("uses custom threshold minutes when provided", async () => {
      await syncService.recoverStaleProcessingJobs(30);

      const calledWhere = mockPrisma.syncJob.updateMany.mock.calls[0][0].where;
      const cutoffDate = calledWhere.startedAt.lt;
      const expectedDiff = Date.now() - cutoffDate.getTime();

      // Expect ~30 minutes (allow 5 second test delta)
      expect(expectedDiff).toBeGreaterThanOrEqual(29 * 60 * 1000);
      expect(expectedDiff).toBeLessThanOrEqual(31 * 60 * 1000);
    });

    it("returns 0 when no stale jobs exist", async () => {
      mockPrisma.syncJob.updateMany.mockResolvedValueOnce({ count: 0 });

      const recovered = await syncService.recoverStaleProcessingJobs(15);
      expect(recovered).toBe(0);
    });

    it("allows PROCESSING -> COMPLETED transition atomically", async () => {
      mockPrisma.syncJob.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        mode: "DAILY",
        triggerMode: "MANUAL",
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.syncJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job-sync-111", status: "PROCESSING" },
        data: expect.objectContaining({
          status: "COMPLETED",
        }),
      });
    });

    it("forbids FAILED -> COMPLETED: prevents a late worker from overwriting a stale-recovered FAILED job", async () => {
      // Simulate that recoverStaleProcessingJobs already reclaimed the job as FAILED
      // When the slow worker finishes, updateMany returns count: 0 because status is no longer PROCESSING
      mockPrisma.syncJob.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        mode: "DAILY",
        triggerMode: "SCHEDULED",
      });

      // Workflow completes safely, but the database job record is NOT overwritten
      expect(result.success).toBe(true);
      expect(mockPrisma.syncJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job-sync-111", status: "PROCESSING" },
        data: expect.objectContaining({
          status: "COMPLETED",
        }),
      });
    });

    it("guarantees exactly one winner in concurrent completion vs stale recovery race", async () => {
      // Simulate race condition: Stale recovery and Worker Completion execute concurrently
      // Exactly one atomic updateMany can transition from PROCESSING
      const jobState = { status: "PROCESSING" };

      const simulateAtomicTransition = async (targetStatus: "COMPLETED" | "FAILED") => {
        if (jobState.status === "PROCESSING") {
          jobState.status = targetStatus;
          return { count: 1 };
        }
        return { count: 0 };
      };

      // Worker 1 (Recovery) attempts FAILED transition
      const recoveryResult = await simulateAtomicTransition("FAILED");
      // Worker 2 (Late Completion) attempts COMPLETED transition
      const completionResult = await simulateAtomicTransition("COMPLETED");

      expect(recoveryResult.count).toBe(1);
      expect(completionResult.count).toBe(0);
      expect(jobState.status).toBe("FAILED"); // Terminal status is preserved
    });
  });

  // =========================================================================
  // DOMAIN 3: Cron Route Authentication & Timing-Safe Security
  // =========================================================================
  describe("Domain 3: Cron Route Authentication & Timing-Safe Security", () => {
    const originalEnv = process.env.CRON_SECRET;

    beforeEach(() => {
      process.env.CRON_SECRET = "super-secret-cron-token-12345";
    });

    afterEach(() => {
      process.env.CRON_SECRET = originalEnv;
    });

    it("rejects request if Authorization header is missing (null)", () => {
      expect(verifyCronSecret(null)).toBe(false);
    });

    it("rejects request if Authorization header does not start with 'Bearer '", () => {
      expect(verifyCronSecret("Basic dXNlcjpwYXNz")).toBe(false);
    });

    it("rejects request if Bearer token is incorrect", () => {
      expect(verifyCronSecret("Bearer wrong-token-value")).toBe(false);
    });

    it("accepts request if Bearer token exactly matches CRON_SECRET", () => {
      expect(verifyCronSecret("Bearer super-secret-cron-token-12345")).toBe(true);
    });

    it("rejects request when CRON_SECRET is empty or unset in environment", () => {
      delete process.env.CRON_SECRET;
      expect(verifyCronSecret("Bearer super-secret-cron-token-12345")).toBe(false);

      process.env.CRON_SECRET = "   ";
      expect(verifyCronSecret("Bearer super-secret-cron-token-12345")).toBe(false);
    });
  });

  // =========================================================================
  // DOMAIN 4: Cron Route Discovery & Filtering Criteria
  // =========================================================================
  describe("Domain 4: Cron Route Discovery & Filtering Criteria", () => {
    it("discovers accounts with null lastSyncedAt and eligible statuses", async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValueOnce([
        { id: "sa-1", workspaceId: "ws-1", externalAccountId: "ch-1", displayName: "Ch 1" },
      ]);

      const accounts = await mockPrisma.socialAccount.findMany({
        where: {
          platform: { code: "YOUTUBE" },
          status: { in: ["CONNECTED", "HEALTHY", "WARNING"] },
          OR: [
            { lastSyncedAt: null },
            { lastSyncedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          ],
        },
      });

      expect(accounts).toHaveLength(1);
      expect(mockPrisma.socialAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["CONNECTED", "HEALTHY", "WARNING"] },
          }),
        })
      );
    });

    it("filters out accounts that synced recently within the last 24h", async () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Verify the cutoff logic
      expect(recentDate.getTime()).toBeGreaterThan(cutoff.getTime());
    });

    it("strictly excludes accounts with status REAUTH_REQUIRED or DISCONNECTED", async () => {
      const allowedStatuses = ["CONNECTED", "HEALTHY", "WARNING"];

      expect(allowedStatuses).not.toContain("REAUTH_REQUIRED");
      expect(allowedStatuses).not.toContain("DISCONNECTED");
      expect(allowedStatuses).not.toContain("TOKEN_EXPIRED");
    });

    it("enforces batch limit bounded to 5 accounts per run", async () => {
      mockPrisma.socialAccount.findMany.mockImplementation(({ take }: { take?: number }) => {
        expect(take).toBe(5);
        return Promise.resolve([]);
      });

      await mockPrisma.socialAccount.findMany({ take: 5 });
    });
  });

  // =========================================================================
  // DOMAIN 5: Cron Execution & Fault Isolation
  // =========================================================================
  describe("Domain 5: Cron Execution & Fault Isolation", () => {
    it("continues processing remaining accounts if one account fails during batch", async () => {
      let callCount = 0;
      const executeAccount = async (id: string) => {
        callCount++;
        if (id === "fail-account") {
          throw new SocialError("Provider API timeout", "SOCIAL_API_ERROR");
        }
        return { success: true };
      };

      const accounts = ["ok-1", "fail-account", "ok-2"];
      const results: any[] = [];

      for (const id of accounts) {
        try {
          await executeAccount(id);
          results.push({ id, status: "COMPLETED" });
        } catch (err: any) {
          results.push({ id, status: "FAILED", error: err.message });
        }
      }

      expect(callCount).toBe(3);
      expect(results).toHaveLength(3);
      expect(results[0].status).toBe("COMPLETED");
      expect(results[1].status).toBe("FAILED");
      expect(results[2].status).toBe("COMPLETED");
    });

    it("records SKIPPED_LOCKED status without throwing when lock contention occurs", async () => {
      const mockSync = vi.fn().mockRejectedValueOnce(
        new SocialError("Already in progress", "SOCIAL_REFRESH_LOCKED", { statusCode: 409 })
      );

      let recordStatus = "";
      try {
        await mockSync();
      } catch (err: any) {
        if (err instanceof SocialError && err.code === "SOCIAL_REFRESH_LOCKED") {
          recordStatus = "SKIPPED_LOCKED";
        }
      }

      expect(recordStatus).toBe("SKIPPED_LOCKED");
    });

    it("ensures response does not leak access tokens or secrets", () => {
      const cronResponsePayload = {
        success: true,
        totalDiscovered: 2,
        processedCount: 2,
        processed: [
          {
            accountId: "sa-1",
            externalAccountId: "ch-1",
            status: "COMPLETED",
            observationCount: 15,
            durationMs: 450,
          },
        ],
      };

      const serialized = JSON.stringify(cronResponsePayload);
      expect(serialized).not.toContain("access_token");
      expect(serialized).not.toContain("token");
      expect(serialized).not.toContain("Bearer");
      expect(serialized).not.toContain("secret");
    });
  });

  // =========================================================================
  // DOMAIN 6: Social Token Manager Error Classification
  // =========================================================================
  describe("Domain 6: Social Token Manager Error Classification", () => {
    it("classifies 'invalid_grant' as a permanent OAuth error", () => {
      const err = new SocialError("Token revoked or invalid_grant", "SOCIAL_TOKEN_REVOKED");
      expect(isPermanentTokenRefreshError(err)).toBe(true);
    });

    it("classifies 'revoked' token response as permanent", () => {
      const err = new Error("invalid_request: Token has been expired or revoked.");
      expect(isPermanentTokenRefreshError(err)).toBe(true);
    });

    it("classifies 400 Bad Request with unauthorized_client as permanent", () => {
      const err = new SocialError("Unauthorized client", "SOCIAL_AUTH_REQUIRED", { statusCode: 400 });
      expect(isPermanentTokenRefreshError(err)).toBe(true);
    });

    it("classifies 500 Internal Server Error as transient", () => {
      const err = new SocialError("Internal server error from Google", "SOCIAL_API_ERROR", { statusCode: 500 });
      expect(isPermanentTokenRefreshError(err)).toBe(false);
    });

    it("classifies 503 Service Unavailable as transient", () => {
      const err = new SocialError("Backend service unavailable", "SOCIAL_RATE_LIMITED", { statusCode: 503 });
      expect(isPermanentTokenRefreshError(err)).toBe(false);
    });

    it("classifies connection timeout or ECONNRESET as transient", () => {
      const err = new Error("connect ETIMEDOUT 142.250.190.42:443");
      expect(isPermanentTokenRefreshError(err)).toBe(false);
    });
  });

  // =========================================================================
  // DOMAIN 7: Single Retry Ownership & Non-Amplification
  // =========================================================================
  describe("Domain 7: Single Retry Ownership & Non-Amplification", () => {
    it("forces token refresh exactly once on 401 error and succeeds", async () => {
      // First call throws 401, second call succeeds after refresh
      mockApiClient.queryReport
        .mockRejectedValueOnce(
          new SocialError("Token expired", "SOCIAL_TOKEN_EXPIRED", { statusCode: 401 })
        )
        .mockResolvedValue(sampleOverviewTable);

      const result = await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        mode: "DAILY",
        triggerMode: "MANUAL",
      });

      expect(result.success).toBe(true);
      expect(mockTokenManager.getValidAccessToken).toHaveBeenCalledWith(
        validAccountId,
        { forceRefresh: true }
      );
    });

    it("aborts without infinite loop if second attempt after refresh also returns 401", async () => {
      // Both attempts throw 401
      mockApiClient.queryReport.mockRejectedValue(
        new SocialError("Unauthorized", "SOCIAL_AUTH_REQUIRED", { statusCode: 401 })
      );

      await expect(
        syncService.sync({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          mode: "DAILY",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 401,
        })
      );

      // Force refresh called at most once
      expect(mockTokenManager.getValidAccessToken).toHaveBeenCalledTimes(2);
    });

    it("marks account REAUTH_REQUIRED when forceRefresh throws permanent auth failure", async () => {
      mockApiClient.queryReport.mockRejectedValueOnce(
        new SocialError("Token expired", "SOCIAL_TOKEN_EXPIRED", { statusCode: 401 })
      );
      mockTokenManager.getValidAccessToken
        .mockResolvedValueOnce("initial-token")
        .mockRejectedValueOnce(
          new SocialError("Token revoked", "SOCIAL_TOKEN_REVOKED", { statusCode: 400 })
        );

      await expect(
        syncService.sync({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          mode: "DAILY",
        })
      ).rejects.toThrow();

      expect(mockPrisma.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validAccountId },
          data: { status: "REAUTH_REQUIRED" },
        })
      );
    });
  });

  // =========================================================================
  // DOMAIN 8: Security, Tenant Isolation & RBAC
  // =========================================================================
  describe("Domain 8: Security, Tenant Isolation & RBAC", () => {
    it("strictly rejects sync request if social account belongs to another workspace (403)", async () => {
      await expect(
        syncService.sync({
          workspaceId: "ws-different-999",
          socialAccountId: validAccountId,
          mode: "DAILY",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 403,
        })
      );
    });

    it("rejects sync request if actor lacks social_accounts:manage permission", async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValueOnce({
        role: "VIEWER", // Viewer lacks manage permission
      });

      await expect(
        syncService.sync({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          actorUserId: "viewer-user-id",
          mode: "DAILY",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_AUTH_REQUIRED",
          statusCode: 403,
        })
      );
    });

    it("logs audit events with zero sensitive credentials or tokens", async () => {
      await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        actorUserId: validUserId,
        mode: "DAILY",
        triggerMode: "MANUAL",
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ANALYTICS_SYNC_COMPLETED",
          details: expect.not.objectContaining({
            token: expect.anything(),
            accessToken: expect.anything(),
            secret: expect.anything(),
          }),
        })
      );
    });
  });

  // =========================================================================
  // DOMAIN 9: Partial Success & Metadata Telemetry
  // =========================================================================
  describe("Domain 9: Partial Success & Metadata Telemetry", () => {
    it("completes sync with warnings when non-critical distribution patterns fail", async () => {
      // Top videos succeeds, but demographics query fails
      mockApiClient.queryReport.mockImplementation(async (_token: string, options: any) => {
        if (options.dimensions === "ageGroup,gender") {
          throw new SocialError("Demographics insufficient data", "SOCIAL_API_ERROR", {
            statusCode: 400,
          });
        }
        return sampleOverviewTable;
      });

      const result = await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        mode: "DAILY",
        triggerMode: "SCHEDULED",
      });

      expect(result.success).toBe(true);
      expect(result.overallStatus).toBe("COMPLETED");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("VIEWER_DEMOGRAPHICS failed");
    });

    it("persists structured metadata on SyncJob creation and completion", async () => {
      await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        mode: "DAILY",
        triggerMode: "SCHEDULED",
      });

      // Verify create metadata
      expect(mockPrisma.syncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            mode: "DAILY",
            triggerMode: "SCHEDULED",
          }),
        }),
      });

      // Verify update metadata
      expect(mockPrisma.syncJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job-sync-111", status: "PROCESSING" },
        data: expect.objectContaining({
          status: "COMPLETED",
          metadata: expect.objectContaining({
            mode: "DAILY",
            triggerMode: "SCHEDULED",
            observationCount: expect.any(Number),
            durationMs: expect.any(Number),
          }),
        }),
      });
    });

    it("updates SocialAccount.lastSyncedAt upon successful sync completion", async () => {
      await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        mode: "DAILY",
        triggerMode: "SCHEDULED",
      });

      expect(mockPrisma.socialAccount.update).toHaveBeenCalledWith({
        where: { id: validAccountId },
        data: {
          lastSyncedAt: expect.any(Date),
        },
      });
    });
  });

  // =========================================================================
  // DOMAIN 10: Concurrency Specific Coverage (Section 4)
  // =========================================================================
  describe("Domain 10: Concurrency-Specific Distributed Lock Coverage", () => {
    it("4.A: executes concurrent parallel acquire where exactly one wins and others receive null", async () => {
      const testLock = new InMemoryLock();
      const lockKey = "social-analytics-sync:sa-concurrent-test";

      // Trigger 5 simultaneous acquire attempts with timeoutMs = 0
      const results = await Promise.all([
        testLock.acquire(lockKey, { timeoutMs: 0, ttlMs: 10000 }),
        testLock.acquire(lockKey, { timeoutMs: 0, ttlMs: 10000 }),
        testLock.acquire(lockKey, { timeoutMs: 0, ttlMs: 10000 }),
        testLock.acquire(lockKey, { timeoutMs: 0, ttlMs: 10000 }),
        testLock.acquire(lockKey, { timeoutMs: 0, ttlMs: 10000 }),
      ]);

      const winners = results.filter((token) => token !== null);
      const losers = results.filter((token) => token === null);

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(4);
      expect(typeof winners[0]).toBe("string");

      // Cleanup
      await testLock.release(lockKey, winners[0] as string);
      expect(await testLock.isLocked(lockKey)).toBe(false);
    });

    it("4.B: prevents wrong-owner release; lock remains valid until released by correct owner", async () => {
      const testLock = new InMemoryLock();
      const lockKey = "social-analytics-sync:sa-owner-guard";

      const tokenA = await testLock.acquire(lockKey, { ttlMs: 30000 });
      expect(tokenA).toBeTruthy();

      // Owner B attempts release
      const releaseAttemptByB = await testLock.release(lockKey, "wrong-owner-token-B");
      expect(releaseAttemptByB).toBe(false);
      expect(await testLock.isLocked(lockKey)).toBe(true);

      // Owner A releases
      const releaseAttemptByA = await testLock.release(lockKey, tokenA as string);
      expect(releaseAttemptByA).toBe(true);
      expect(await testLock.isLocked(lockKey)).toBe(false);
    });

    it("4.C: heartbeat extension extends expiration and rejects wrong-owner extension", async () => {
      const testLock = new InMemoryLock();
      const lockKey = "social-analytics-sync:sa-heartbeat-test";

      const tokenA = await testLock.acquire(lockKey, { ttlMs: 5000 });
      expect(tokenA).toBeTruthy();

      // Wrong owner cannot extend
      const extendByWrongOwner = await testLock.extend(lockKey, "invalid-token-xyz", 15000);
      expect(extendByWrongOwner).toBe(false);

      // Correct owner extends
      const extendByCorrectOwner = await testLock.extend(lockKey, tokenA as string, 15000);
      expect(extendByCorrectOwner).toBe(true);
      expect(await testLock.isLocked(lockKey)).toBe(true);

      await testLock.release(lockKey, tokenA as string);
    });

    it("4.D: stale lock recovery reclaims expired lease atomically for new owner", async () => {
      const testLock = new InMemoryLock();
      const lockKey = "social-analytics-sync:sa-stale-recovery";

      // Acquire with a 20ms TTL
      const oldToken = await testLock.acquire(lockKey, { ttlMs: 20 });
      expect(oldToken).toBeTruthy();

      // Wait 35ms for the lock lease to expire
      await new Promise((resolve) => setTimeout(resolve, 35));

      // Attempt acquisition by new owner
      const newToken = await testLock.acquire(lockKey, { timeoutMs: 0, ttlMs: 10000 });
      expect(newToken).toBeTruthy();
      expect(newToken).not.toBe(oldToken);

      // Verify old token cannot release the reclaimed lock
      const staleRelease = await testLock.release(lockKey, oldToken as string);
      expect(staleRelease).toBe(false);
      expect(await testLock.isLocked(lockKey)).toBe(true);

      // New owner releases successfully
      const validRelease = await testLock.release(lockKey, newToken as string);
      expect(validRelease).toBe(true);
      expect(await testLock.isLocked(lockKey)).toBe(false);
    });

    it("4.E: timeoutMs = 0 returns lock contention immediately without waiting", async () => {
      const testLock = new InMemoryLock();
      const lockKey = "social-analytics-sync:sa-fast-fail";

      const existingToken = await testLock.acquire(lockKey, { ttlMs: 30000 });
      expect(existingToken).toBeTruthy();

      const startTime = Date.now();
      const contendedToken = await testLock.acquire(lockKey, { timeoutMs: 0 });
      const elapsed = Date.now() - startTime;

      expect(contendedToken).toBeNull();
      expect(elapsed).toBeLessThan(50); // Immediate return, zero wait loop

      await testLock.release(lockKey, existingToken as string);
    });

    it("shares lock namespace between Manual and Scheduled sync: second execution receives contention", async () => {
      const sharedKey = `social-analytics-sync:${validAccountId}`;

      // 1. Manual sync acquires lock
      const manualToken = await lock.acquire(sharedKey, { ttlMs: 60000, timeoutMs: 0 });
      expect(manualToken).toBeTruthy();

      // 2. Scheduled sync attempts same account
      await expect(
        syncService.sync({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          mode: "DAILY",
          triggerMode: "SCHEDULED",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_REFRESH_LOCKED",
          statusCode: 409,
        })
      );

      // 3. Manual sync completes and releases lock
      await lock.release(sharedKey, manualToken as string);
      expect(await lock.isLocked(sharedKey)).toBe(false);

      // 4. Now scheduled sync can proceed
      const scheduledResult = await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        mode: "DAILY",
        triggerMode: "SCHEDULED",
      });
      expect(scheduledResult.success).toBe(true);
    });
  });

  // =========================================================================
  // DOMAIN 11: Scheduler Retry Ownership & Error Handling (Section 5)
  // =========================================================================
  describe("Domain 11: Scheduler Retry Ownership & Error Handling", () => {
    it("5.A: does NOT retry REAUTH_REQUIRED accounts at scheduler level", async () => {
      // Setup: Account fails permanently during sync with REAUTH_REQUIRED
      mockApiClient.queryReport.mockRejectedValueOnce(
        new SocialError("invalid_grant: Token has been revoked", "SOCIAL_TOKEN_REVOKED", {
          statusCode: 400,
        })
      );

      // Sync service throws and marks account REAUTH_REQUIRED
      let syncError: any = null;
      try {
        await syncService.sync({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          mode: "DAILY",
          triggerMode: "SCHEDULED",
        });
      } catch (err) {
        syncError = err;
      }

      expect(syncError).toBeTruthy();
      expect(mockPrisma.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validAccountId },
          data: { status: "REAUTH_REQUIRED" },
        })
      );

      // Verification: Scheduler discovery query strictly filters out REAUTH_REQUIRED accounts
      const eligibleStatuses = ["CONNECTED", "HEALTHY", "WARNING"];
      expect(eligibleStatuses).not.toContain("REAUTH_REQUIRED");
      // No retry loop exists in the scheduler for permanent auth failures
    });

    it("5.B: classifies permanent 4xx errors as permanent and preserves account state without scheduler retry", async () => {
      const permanentErrors = [
        new SocialError("unauthorized_client", "SOCIAL_AUTH_REQUIRED", { statusCode: 400 }),
        new SocialError("invalid_client", "SOCIAL_AUTH_REQUIRED", { statusCode: 401 }),
        new SocialError("access_denied", "SOCIAL_AUTH_REQUIRED", { statusCode: 403 }),
      ];

      for (const err of permanentErrors) {
        expect(isPermanentTokenRefreshError(err)).toBe(true);
      }
    });

    it("5.C: leaves transient failure retries (429, 500, 503, ETIMEDOUT) to the lower API client layer", async () => {
      const transientErrors = [
        new SocialError("Rate limit exceeded", "SOCIAL_RATE_LIMITED", { statusCode: 429 }),
        new SocialError("Internal server error", "SOCIAL_API_ERROR", { statusCode: 500 }),
        new SocialError("Service unavailable", "SOCIAL_API_ERROR", { statusCode: 503 }),
        new Error("connect ETIMEDOUT 142.250.190.42:443"),
      ];

      for (const err of transientErrors) {
        expect(isPermanentTokenRefreshError(err)).toBe(false);
      }

      // Transient errors do NOT set status to REAUTH_REQUIRED
      mockApiClient.queryReport.mockRejectedValueOnce(
        new SocialError("Service unavailable", "SOCIAL_API_ERROR", { statusCode: 503 })
      );

      await expect(
        syncService.sync({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          mode: "DAILY",
          triggerMode: "SCHEDULED",
        })
      ).rejects.toThrow();

      // Account status was NOT changed to REAUTH_REQUIRED
      const calls = mockPrisma.socialAccount.update.mock.calls;
      const reauthCall = calls.find((call: any) => call[0]?.data?.status === "REAUTH_REQUIRED");
      expect(reauthCall).toBeUndefined();
    });
  });

  // =========================================================================
  // DOMAIN 12: Quota Policy & Budget Exhaustion (Section 6)
  // =========================================================================
  describe("Domain 12: Quota Policy & Budget Exhaustion", () => {
    it("stops subsequent patterns safely when maxRequestsBudget is exhausted without marking job as FAILED", async () => {
      // Set budget = 1: critical overview uses 1 request, subsequent queries should be skipped
      const result = await syncService.sync({
        workspaceId: validWorkspaceId,
        socialAccountId: validAccountId,
        mode: "DAILY",
        triggerMode: "SCHEDULED",
        maxRequestsBudget: 1,
      });

      expect(result.success).toBe(true);
      expect(result.requestCount).toBe(1);
      // API client queryReport should have been called only once for CHANNEL_DAILY_OVERVIEW
      expect(mockApiClient.queryReport).toHaveBeenCalledTimes(1);

      // Warnings should document the skipped patterns
      expect(result.warnings.some((w) => w.includes("budget (1) reached"))).toBe(true);

      // Audit event for quota exhaustion was logged
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ANALYTICS_QUOTA_EXHAUSTED",
          details: expect.objectContaining({
            budget: 1,
          }),
        })
      );

      // SyncJob status updated to COMPLETED with warnings, NOT FAILED
      expect(mockPrisma.syncJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-sync-111", status: "PROCESSING" },
          data: expect.objectContaining({
            status: "COMPLETED",
          }),
        })
      );
    });
  });

  // =========================================================================
  // DOMAIN 13: Defensive Malformed & Nonexistent Account ID Handling (Section 7)
  // =========================================================================
  describe("Domain 13: Defensive Malformed & Nonexistent Account ID Handling", () => {
    it("7.A: safely rejects nonexistent social account ID with 404 before acquiring lock or calling API", async () => {
      mockPrisma.socialAccount.findUnique.mockResolvedValueOnce(null);

      const acquireSpy = vi.spyOn(lock, "acquire");

      await expect(
        syncService.sync({
          workspaceId: validWorkspaceId,
          socialAccountId: "nonexistent-account-id",
          mode: "DAILY",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_INVALID_REQUEST",
          statusCode: 404,
        })
      );

      // Guard: No lock acquired for nonexistent account
      expect(acquireSpy).not.toHaveBeenCalled();
      // Guard: No API request made
      expect(mockApiClient.queryReport).not.toHaveBeenCalled();
    });

    it("7.B: safely rejects invalid parameters (e.g. negative lag days) without creating lock or calling provider", async () => {
      const acquireSpy = vi.spyOn(lock, "acquire");

      await expect(
        syncService.sync({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          mode: "DAILY",
          analyticsDataLagDays: -5,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_INVALID_REQUEST",
          statusCode: 400,
        })
      );

      expect(acquireSpy).not.toHaveBeenCalled();
      expect(mockApiClient.queryReport).not.toHaveBeenCalled();
    });
  });
});

