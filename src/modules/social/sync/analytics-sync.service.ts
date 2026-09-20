import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { SocialError } from "../errors";
import { defaultLock, DistributedLock } from "@/lib/lock/distributed-lock";
import { socialTokenManager, SocialTokenManager } from "../token-manager";
import { AnalyticsRepository } from "../analytics/analytics.repository";
import { YouTubeAnalyticsReportPlanner } from "../providers/youtube/youtube.analytics-planner";
import { YouTubeAnalyticsApiClient } from "../providers/youtube/youtube.analytics-api";
import { YouTubeAnalyticsMapper } from "../providers/youtube/youtube.analytics-mapper";
import { YouTubeAnalyticsQueryPattern } from "../providers/youtube/youtube.analytics.types";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { hasPermission } from "@/lib/auth/rbac";
import {
  AnalyticsSyncOptions,
  AnalyticsSyncResult,
  AnalyticsPatternResult,
  BackfillSlice,
  Clock,
  defaultSystemClock,
} from "./analytics-sync.types";

/**
 * Format a Date object into an ISO YYYY-MM-DD string in UTC.
 */
function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Subtracts days from a Date in UTC.
 */
function subDaysUTC(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/**
 * Parses a YYYY-MM-DD string into a UTC Date.
 */
function parseDateUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

export class YouTubeAnalyticsSyncService {
  constructor(
    private readonly prismaClient: PrismaClient = defaultPrisma,
    private readonly tokenManager: SocialTokenManager = socialTokenManager,
    private readonly lock: DistributedLock = defaultLock,
    private readonly analyticsRepo: AnalyticsRepository = new AnalyticsRepository(prismaClient),
    private readonly reportPlanner: YouTubeAnalyticsReportPlanner = new YouTubeAnalyticsReportPlanner(),
    private readonly apiClient: YouTubeAnalyticsApiClient = new YouTubeAnalyticsApiClient(),
    private readonly clock: Clock = defaultSystemClock
  ) {}

  /**
   * Recovers stale PROCESSING SyncJobs that exceeded the maximum allowed duration.
   * Atomically transitions stale jobs to FAILED status.
   */
  async recoverStaleProcessingJobs(thresholdMinutes = 15): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    const result = await this.prismaClient.syncJob.updateMany({
      where: {
        jobType: "SYNC_ANALYTICS",
        status: "PROCESSING",
        startedAt: { lt: cutoff },
      },
      data: {
        status: "FAILED",
        errorCode: "SYNC_JOB_TIMEOUT",
        errorMessage: `Sync job exceeded maximum execution time (${thresholdMinutes}m) and was reclaimed as stale.`,
        completedAt: new Date(),
      },
    });
    return result.count;
  }

  /**
   * Main sync entry point. Routes to daily sync or historical backfill based on options.mode.
   */
  async sync(options: AnalyticsSyncOptions): Promise<AnalyticsSyncResult> {
    if (options.mode === "BACKFILL") {
      return this.backfillAccountAnalytics(options);
    }
    return this.syncAccountAnalytics(options);
  }

  /**
   * Executes a daily incremental analytics synchronization for a connected YouTube account.
   */
  async syncAccountAnalytics(options: AnalyticsSyncOptions): Promise<AnalyticsSyncResult> {
    return this.executeSyncWorkflow(options, "DAILY");
  }

  /**
   * Executes a 90-day historical analytics backfill divided into 3 sequential non-overlapping 30-day slices.
   */
  async backfillAccountAnalytics(options: AnalyticsSyncOptions): Promise<AnalyticsSyncResult> {
    return this.executeSyncWorkflow(options, "BACKFILL");
  }

  /**
   * Internal orchestrator handling validation, concurrency locks, job state, token resolution,
   * query planning, API execution, batch persistence, and audit logging.
   */
  private async executeSyncWorkflow(
    options: AnalyticsSyncOptions,
    mode: "DAILY" | "BACKFILL"
  ): Promise<AnalyticsSyncResult> {
    const startTime = this.clock.now();
    const startTimeMs = startTime.getTime();
    const warnings: string[] = [];
    const patternResults: AnalyticsPatternResult[] = [];
    let totalRequestCount = 0;
    let totalObservationCount = 0;
    let selectedVideoIds: string[] = [];

    // 1. Resolve effective clock date and date windows
    const currentDate = options.currentDate
      ? typeof options.currentDate === "string"
        ? parseDateUTC(options.currentDate)
        : options.currentDate
      : this.clock.now();

    const lagDays = options.analyticsDataLagDays ?? 2;
    if (lagDays < 0 || !Number.isInteger(lagDays)) {
      throw new SocialError(
        `Invalid analyticsDataLagDays: ${lagDays}. Must be a non-negative integer.`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    const availableEndDateObj = subDaysUTC(currentDate, lagDays);
    const availableEndDate = formatDateUTC(availableEndDateObj);

    // 2. Validate SocialAccount existence, workspace ownership, and provider
    const account = await this.prismaClient.socialAccount.findUnique({
      where: { id: options.socialAccountId },
      include: { platform: true, workspace: true },
    });

    if (!account) {
      throw new SocialError("Social account not found.", "SOCIAL_INVALID_REQUEST", {
        statusCode: 404,
      });
    }

    if (account.workspaceId !== options.workspaceId) {
      throw new SocialError(
        `Tenant isolation violation: Social account '${options.socialAccountId}' does not belong to workspace '${options.workspaceId}'.`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 403 }
      );
    }

    if (account.platform.code !== "YOUTUBE") {
      throw new SocialError(
        `Unsupported platform for YouTube analytics sync: ${account.platform.code}`,
        "SOCIAL_UNSUPPORTED_OPERATION",
        { provider: account.platform.code, statusCode: 400 }
      );
    }

    // 3. Verify actor permissions within workspace if actorUserId is supplied
    if (options.actorUserId) {
      const membership = await this.prismaClient.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: options.workspaceId,
            userId: options.actorUserId,
          },
        },
      });

      if (!membership || !hasPermission(membership.role, "social_accounts:manage")) {
        throw new SocialError(
          "Permission denied. User lacks permission to manage social accounts.",
          "SOCIAL_AUTH_REQUIRED",
          { provider: "YOUTUBE", statusCode: 403 }
        );
      }
    }

    // 4. Concurrency Guard: Acquire exclusive distributed lock for analytics sync
    const lockKey = `social-analytics-sync:${account.id}`;
    const lockToken = await this.lock.acquire(lockKey, {
      ttlMs: 120000, // 120s lease
      timeoutMs: 0, // Fail-fast immediately
    });

    if (!lockToken) {
      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "ANALYTICS_SYNC_LOCKED",
        resource: "social_account",
        resourceId: account.id,
        details: { provider: "YOUTUBE", reason: "Concurrent analytics sync in progress" },
      }).catch(() => {});

      throw new SocialError(
        "An analytics synchronization operation is already in progress for this account.",
        "SOCIAL_REFRESH_LOCKED",
        {
          provider: "YOUTUBE",
          statusCode: 409,
          retryable: true,
        }
      );
    }

    // Set up heartbeat timer (every 20s) to extend lease during sync
    const heartbeatTimer = setInterval(async () => {
      await this.lock.extend(lockKey, lockToken, 120000).catch(() => {});
    }, 20000);

    let syncJobId = "";
    const maxBudget = options.maxRequestsBudget ?? 100;
    let budgetExhaustedLogged = false;

    try {
      // 5. Create SyncJob and record ANALYTICS_SYNC_STARTED audit event
      const triggerMode = options.triggerMode ?? (options.actorUserId ? "MANUAL" : "SCHEDULED");
      const syncJob = await this.prismaClient.syncJob.create({
        data: {
          socialAccountId: account.id,
          jobType: "SYNC_ANALYTICS",
          status: "PROCESSING",
          attempts: 1,
          startedAt: startTime,
          metadata: {
            mode,
            triggerMode,
            maxBudget,
            requestedDateRange: {
              startDate: options.startDate,
              endDate: options.endDate,
            },
          },
        },
      });
      syncJobId = syncJob.id;

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "ANALYTICS_SYNC_STARTED",
        resource: "social_account",
        resourceId: account.id,
        details: {
          provider: "YOUTUBE",
          syncJobId,
          mode,
          triggerMode,
        },
      });

      // 6. Obtain valid access token via SocialTokenManager
      let accessToken = await this.tokenManager.getValidAccessToken(account.id);

      // Helper function to execute API query with 401 force-refresh retry
      const executeQueryWithAuth = async (queryOptions: any) => {
        try {
          return await this.apiClient.queryReport(accessToken, queryOptions);
        } catch (err: any) {
          if (
            err instanceof SocialError &&
            (err.code === "SOCIAL_TOKEN_EXPIRED" ||
              err.code === "SOCIAL_AUTH_REQUIRED" ||
              err.statusCode === 401)
          ) {
            // Force refresh access token once
            try {
              accessToken = await this.tokenManager.getValidAccessToken(account.id, {
                forceRefresh: true,
              });
              return await this.apiClient.queryReport(accessToken, queryOptions);
            } catch (refreshErr: any) {
              await this.handleAuthFailure(account.id, options, refreshErr);
              throw refreshErr;
            }
          }

          if (
            err instanceof SocialError &&
            (err.code === "SOCIAL_TOKEN_REVOKED" || err.statusCode === 403)
          ) {
            await this.handleAuthFailure(account.id, options, err);
          }

          throw err;
        }
      };

      // Helper to check and increment budget
      const canProceedWithBudget = (patternName: string): boolean => {
        if (totalRequestCount >= maxBudget) {
          if (!budgetExhaustedLogged) {
            budgetExhaustedLogged = true;
            logAuditEvent({
              workspaceId: options.workspaceId,
              userId: options.actorUserId,
              action: "ANALYTICS_QUOTA_EXHAUSTED",
              resource: "social_account",
              resourceId: account.id,
              details: {
                provider: "YOUTUBE",
                syncJobId,
                budget: maxBudget,
                message: "Application request budget reached. Halting subsequent queries.",
              },
            }).catch(() => {});
          }
          patternResults.push({
            pattern: patternName,
            status: "SKIPPED_BUDGET",
            requests: 0,
            observations: 0,
            warning: `Pattern ${patternName} skipped: application request budget (${maxBudget}) reached.`,
            durationMs: 0,
          });
          warnings.push(`Pattern ${patternName} skipped: application request budget (${maxBudget}) reached.`);
          return false;
        }
        return true;
      };

      let requestedDateRange = { startDate: "", endDate: "" };
      let effectiveDateRange = { startDate: "", endDate: "" };

      if (mode === "DAILY") {
        // Compute daily date ranges
        const defaultStartDate = formatDateUTC(subDaysUTC(currentDate, 7));
        const reqStart = options.startDate ?? defaultStartDate;
        const reqEnd = options.endDate ?? availableEndDate;

        requestedDateRange = { startDate: reqStart, endDate: reqEnd };

        // Plan CHANNEL_DAILY_OVERVIEW to enforce lag validation and policy
        const channelPlan = this.reportPlanner.planReport({
          queryPattern: "CHANNEL_DAILY_OVERVIEW",
          startDate: reqStart,
          endDate: reqEnd,
          analyticsDataLagDays: lagDays,
          lagPolicy: options.lagPolicy ?? "CLAMP",
          currentDate,
        });

        const effectiveDailyStart = channelPlan.queryOptions.startDate;
        const effectiveDailyEnd = channelPlan.queryOptions.endDate;
        effectiveDateRange = { startDate: effectiveDailyStart, endDate: effectiveDailyEnd };

        // Rolling 30d range for distribution & top video reports
        const rollingStartDate = formatDateUTC(subDaysUTC(currentDate, 30));
        const rollingEndDate = effectiveDailyEnd;

        // =====================================================================
        // Step A: CHANNEL_DAILY_OVERVIEW (CRITICAL)
        // =====================================================================
        const p1Start = Date.now();
        if (canProceedWithBudget("CHANNEL_DAILY_OVERVIEW")) {
          totalRequestCount++;
          try {
            const table = await executeQueryWithAuth(channelPlan.queryOptions);
            const obs = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
              provider: "YOUTUBE",
              source: "ANALYTICS_API",
              queryPattern: "CHANNEL_DAILY_OVERVIEW",
              granularity: channelPlan.granularity,
              startDate: effectiveDailyStart,
              endDate: effectiveDailyEnd,
              socialAccountId: account.id,
              externalAccountId: account.externalAccountId,
              capturedAt: startTime,
            });

            await this.persistInBatches(obs, options.workspaceId, account.id, syncJobId, lagDays);
            totalObservationCount += obs.length;

            patternResults.push({
              pattern: "CHANNEL_DAILY_OVERVIEW",
              status: obs.length > 0 ? "SUCCESS" : "EMPTY",
              requests: 1,
              observations: obs.length,
              durationMs: Date.now() - p1Start,
            });
          } catch (err: any) {
            patternResults.push({
              pattern: "CHANNEL_DAILY_OVERVIEW",
              status: "FAILED",
              requests: 1,
              observations: 0,
              errorCode: err instanceof SocialError ? err.code : "SOCIAL_API_ERROR",
              warning: err.message,
              durationMs: Date.now() - p1Start,
            });
            // Critical failure: abort workflow
            throw err;
          }
        }

        // =====================================================================
        // Step B: TOP_VIDEOS_PERFORMANCE (HIGH)
        // =====================================================================
        let topVideosSucceeded = false;
        const p2Start = Date.now();
        const topVideoIdsFromApi: string[] = [];

        if (canProceedWithBudget("TOP_VIDEOS_PERFORMANCE")) {
          totalRequestCount++;
          try {
            const topVideosPlan = this.reportPlanner.planReport({
              queryPattern: "TOP_VIDEOS_PERFORMANCE",
              startDate: rollingStartDate,
              endDate: rollingEndDate,
              analyticsDataLagDays: lagDays,
              lagPolicy: options.lagPolicy ?? "CLAMP",
              currentDate,
            });

            const table = await executeQueryWithAuth(topVideosPlan.queryOptions);
            const obs = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
              provider: "YOUTUBE",
              source: "ANALYTICS_API",
              queryPattern: "TOP_VIDEOS_PERFORMANCE",
              granularity: topVideosPlan.granularity,
              startDate: rollingStartDate,
              endDate: rollingEndDate,
              socialAccountId: account.id,
              externalAccountId: account.externalAccountId,
              capturedAt: startTime,
            });

            // Extract video IDs from returned rows
            if (table.rows && Array.isArray(table.rows)) {
              const videoColIdx = table.columnHeaders.findIndex((h: any) => h.name === "video");
              if (videoColIdx !== -1) {
                for (const row of table.rows) {
                  const vid = String(row[videoColIdx]);
                  if (vid && vid.trim().length > 0) {
                    topVideoIdsFromApi.push(vid.trim());
                  }
                }
              }
            }

            await this.persistInBatches(obs, options.workspaceId, account.id, syncJobId, lagDays);
            totalObservationCount += obs.length;
            topVideosSucceeded = true;

            patternResults.push({
              pattern: "TOP_VIDEOS_PERFORMANCE",
              status: obs.length > 0 ? "SUCCESS" : "EMPTY",
              requests: 1,
              observations: obs.length,
              durationMs: Date.now() - p2Start,
            });
          } catch (err: any) {
            warnings.push(`TOP_VIDEOS_PERFORMANCE failed: ${err.message}`);
            patternResults.push({
              pattern: "TOP_VIDEOS_PERFORMANCE",
              status: "FAILED",
              requests: 1,
              observations: 0,
              errorCode: err instanceof SocialError ? err.code : "SOCIAL_API_ERROR",
              warning: err.message,
              durationMs: Date.now() - p2Start,
            });
          }
        }

        // =====================================================================
        // Step C: Deterministic Video Selection
        // =====================================================================
        if (options.videoIds && options.videoIds.length > 0) {
          // Explicit override provided: validate ownership against ContentPlatform
          const candidateIds = [...new Set(options.videoIds.map((v) => v.trim()).filter(Boolean))];

          // Check if any candidate video is associated with a different social account
          const conflictingRecords = await this.prismaClient.contentPlatform.findMany({
            where: {
              externalContentId: { in: candidateIds },
              socialAccountId: { not: account.id },
            },
            select: { externalContentId: true },
          });

          if (conflictingRecords.length > 0) {
            const conflictIds = conflictingRecords.map((r) => r.externalContentId).filter(Boolean);
            throw new SocialError(
              `Validation failed: explicit video IDs belong to another social account: ${conflictIds.join(", ")}`,
              "SOCIAL_INVALID_REQUEST",
              { provider: "YOUTUBE", statusCode: 403 }
            );
          }

          selectedVideoIds = candidateIds.sort();
        } else if (topVideosSucceeded) {
          // Automatic selection: Top N from API + recently published videos from DB
          const topNLimit = options.topVideosLimit ?? 10;
          const topN = topVideoIdsFromApi.slice(0, topNLimit);

          const recentDays = options.recentVideoDays ?? 14;
          const recentThreshold = subDaysUTC(currentDate, recentDays);

          const recentRecords = await this.prismaClient.contentPlatform.findMany({
            where: {
              socialAccountId: account.id,
              publishedAt: { gte: recentThreshold },
              externalContentId: { not: null },
            },
            select: { externalContentId: true },
          });

          const recentIds = recentRecords
            .map((r) => r.externalContentId)
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

          selectedVideoIds = [...new Set([...topN, ...recentIds])].sort();
        }

        // =====================================================================
        // Step D: VIDEO_DAILY_TIME_SERIES (NON-CRITICAL)
        // =====================================================================
        if (selectedVideoIds.length > 0) {
          const p3Start = Date.now();
          let videoRequests = 0;
          let videoObsCount = 0;
          let videoFailed = false;

          for (const videoId of selectedVideoIds) {
            if (!canProceedWithBudget("VIDEO_DAILY_TIME_SERIES")) {
              break;
            }

            totalRequestCount++;
            videoRequests++;

            try {
              const videoPlan = this.reportPlanner.planReport({
                queryPattern: "VIDEO_DAILY_TIME_SERIES",
                startDate: effectiveDailyStart,
                endDate: effectiveDailyEnd,
                filters: { video: videoId },
                analyticsDataLagDays: lagDays,
                lagPolicy: options.lagPolicy ?? "CLAMP",
                currentDate,
              });

              const table = await executeQueryWithAuth(videoPlan.queryOptions);
              const obs = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
                provider: "YOUTUBE",
                source: "ANALYTICS_API",
                queryPattern: "VIDEO_DAILY_TIME_SERIES",
                granularity: videoPlan.granularity,
                startDate: effectiveDailyStart,
                endDate: effectiveDailyEnd,
                socialAccountId: account.id,
                externalAccountId: account.externalAccountId,
                capturedAt: startTime,
              });

              // Ensure dimensions include video ID for projection mapping
              for (const o of obs) {
                o.dimensions = { ...(o.dimensions || {}), video: videoId };
              }

              await this.persistInBatches(obs, options.workspaceId, account.id, syncJobId, lagDays);
              videoObsCount += obs.length;
              totalObservationCount += obs.length;
            } catch (err: any) {
              videoFailed = true;
              warnings.push(`VIDEO_DAILY_TIME_SERIES failed for video '${videoId}': ${err.message}`);
            }
          }

          patternResults.push({
            pattern: "VIDEO_DAILY_TIME_SERIES",
            status: videoRequests === 0 ? "SKIPPED_BUDGET" : videoFailed ? "FAILED" : "SUCCESS",
            requests: videoRequests,
            observations: videoObsCount,
            durationMs: Date.now() - p3Start,
          });
        }

        // =====================================================================
        // Step E: Audience & Distribution Query Patterns (NON-CRITICAL)
        // =====================================================================
        const distributionPatterns: YouTubeAnalyticsQueryPattern[] = [
          "VIEWER_DEMOGRAPHICS",
          "GEOGRAPHIC_DISTRIBUTION",
          "TRAFFIC_SOURCE_DISTRIBUTION",
          "DEVICE_DISTRIBUTION",
        ];

        for (const pattern of distributionPatterns) {
          const pStart = Date.now();
          if (!canProceedWithBudget(pattern)) {
            continue;
          }

          totalRequestCount++;
          try {
            const plan = this.reportPlanner.planReport({
              queryPattern: pattern,
              startDate: rollingStartDate,
              endDate: rollingEndDate,
              analyticsDataLagDays: lagDays,
              lagPolicy: options.lagPolicy ?? "CLAMP",
              currentDate,
            });

            const table = await executeQueryWithAuth(plan.queryOptions);
            const obs = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
              provider: "YOUTUBE",
              source: "ANALYTICS_API",
              queryPattern: pattern,
              granularity: plan.granularity,
              startDate: rollingStartDate,
              endDate: rollingEndDate,
              socialAccountId: account.id,
              externalAccountId: account.externalAccountId,
              capturedAt: startTime,
            });

            await this.persistInBatches(obs, options.workspaceId, account.id, syncJobId, lagDays);
            totalObservationCount += obs.length;

            patternResults.push({
              pattern,
              status: obs.length > 0 ? "SUCCESS" : "EMPTY",
              requests: 1,
              observations: obs.length,
              durationMs: Date.now() - pStart,
            });
          } catch (err: any) {
            warnings.push(`${pattern} failed: ${err.message}`);
            patternResults.push({
              pattern,
              status: "FAILED",
              requests: 1,
              observations: 0,
              errorCode: err instanceof SocialError ? err.code : "SOCIAL_API_ERROR",
              warning: err.message,
              durationMs: Date.now() - pStart,
            });
          }
        }
      } else {
        // =====================================================================
        // Mode: BACKFILL (90 days split into 3 non-overlapping 30-day slices)
        // =====================================================================
        const backfillStartDate = formatDateUTC(subDaysUTC(currentDate, 90));
        requestedDateRange = { startDate: backfillStartDate, endDate: availableEndDate };
        effectiveDateRange = { startDate: backfillStartDate, endDate: availableEndDate };

        const slices: BackfillSlice[] = [
          {
            sliceIndex: 0,
            startDate: formatDateUTC(subDaysUTC(currentDate, 90)),
            endDate: formatDateUTC(subDaysUTC(currentDate, 61)),
          },
          {
            sliceIndex: 1,
            startDate: formatDateUTC(subDaysUTC(currentDate, 60)),
            endDate: formatDateUTC(subDaysUTC(currentDate, 31)),
          },
          {
            sliceIndex: 2,
            startDate: formatDateUTC(subDaysUTC(currentDate, 30)),
            endDate: availableEndDate,
          },
        ];

        const resumeIndex = options.resumeFromSliceIndex ?? 0;

        for (const slice of slices) {
          if (slice.sliceIndex < resumeIndex) {
            continue; // Skip already completed slices on resume
          }

          // Execute channel overview for slice
          const sliceChannelStart = Date.now();
          if (canProceedWithBudget(`CHANNEL_DAILY_OVERVIEW[slice_${slice.sliceIndex}]`)) {
            totalRequestCount++;
            try {
              const plan = this.reportPlanner.planReport({
                queryPattern: "CHANNEL_DAILY_OVERVIEW",
                startDate: slice.startDate,
                endDate: slice.endDate,
                analyticsDataLagDays: lagDays,
                lagPolicy: options.lagPolicy ?? "CLAMP",
                currentDate,
              });

              const table = await executeQueryWithAuth(plan.queryOptions);
              const obs = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
                provider: "YOUTUBE",
                source: "ANALYTICS_API",
                queryPattern: "CHANNEL_DAILY_OVERVIEW",
                granularity: plan.granularity,
                startDate: slice.startDate,
                endDate: slice.endDate,
                socialAccountId: account.id,
                externalAccountId: account.externalAccountId,
                capturedAt: startTime,
              });

              await this.persistInBatches(obs, options.workspaceId, account.id, syncJobId, lagDays);
              totalObservationCount += obs.length;

              patternResults.push({
                pattern: `CHANNEL_DAILY_OVERVIEW[slice_${slice.sliceIndex}]`,
                status: obs.length > 0 ? "SUCCESS" : "EMPTY",
                requests: 1,
                observations: obs.length,
                durationMs: Date.now() - sliceChannelStart,
              });
            } catch (err: any) {
              patternResults.push({
                pattern: `CHANNEL_DAILY_OVERVIEW[slice_${slice.sliceIndex}]`,
                status: "FAILED",
                requests: 1,
                observations: 0,
                errorCode: err instanceof SocialError ? err.code : "SOCIAL_API_ERROR",
                warning: err.message,
                durationMs: Date.now() - sliceChannelStart,
              });
              // Backfill slice failure: abort remaining slices to allow checkpointed resumption
              throw err;
            }
          }

          // Execute top videos for slice
          const sliceTopStart = Date.now();
          if (canProceedWithBudget(`TOP_VIDEOS_PERFORMANCE[slice_${slice.sliceIndex}]`)) {
            totalRequestCount++;
            try {
              const plan = this.reportPlanner.planReport({
                queryPattern: "TOP_VIDEOS_PERFORMANCE",
                startDate: slice.startDate,
                endDate: slice.endDate,
                analyticsDataLagDays: lagDays,
                lagPolicy: options.lagPolicy ?? "CLAMP",
                currentDate,
              });

              const table = await executeQueryWithAuth(plan.queryOptions);
              const obs = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
                provider: "YOUTUBE",
                source: "ANALYTICS_API",
                queryPattern: "TOP_VIDEOS_PERFORMANCE",
                granularity: plan.granularity,
                startDate: slice.startDate,
                endDate: slice.endDate,
                socialAccountId: account.id,
                externalAccountId: account.externalAccountId,
                capturedAt: startTime,
              });

              await this.persistInBatches(obs, options.workspaceId, account.id, syncJobId, lagDays);
              totalObservationCount += obs.length;

              patternResults.push({
                pattern: `TOP_VIDEOS_PERFORMANCE[slice_${slice.sliceIndex}]`,
                status: obs.length > 0 ? "SUCCESS" : "EMPTY",
                requests: 1,
                observations: obs.length,
                durationMs: Date.now() - sliceTopStart,
              });
            } catch (err: any) {
              warnings.push(`TOP_VIDEOS_PERFORMANCE[slice_${slice.sliceIndex}] failed: ${err.message}`);
              patternResults.push({
                pattern: `TOP_VIDEOS_PERFORMANCE[slice_${slice.sliceIndex}]`,
                status: "FAILED",
                requests: 1,
                observations: 0,
                errorCode: err instanceof SocialError ? err.code : "SOCIAL_API_ERROR",
                warning: err.message,
                durationMs: Date.now() - sliceTopStart,
              });
            }
          }
        }
      }

      const durationMs = Date.now() - startTimeMs;
      const completedTime = this.clock.now();

      // 7. Atomic Conditional Transition: PROCESSING -> COMPLETED
      let errorMessage: string | null = null;
      if (warnings.length > 0) {
        errorMessage = JSON.stringify({
          warnings,
          observations: totalObservationCount,
          requests: totalRequestCount,
        });
      }

      await this.prismaClient.syncJob.updateMany({
        where: {
          id: syncJobId,
          status: "PROCESSING",
        },
        data: {
          status: "COMPLETED",
          completedAt: completedTime,
          errorMessage,
          metadata: {
            mode,
            triggerMode,
            requestCount: totalRequestCount,
            observationCount: totalObservationCount,
            durationMs,
            warnings: warnings.length > 0 ? warnings : undefined,
            patternResultsSummary: patternResults.map((p) => ({
              pattern: p.pattern,
              status: p.status,
              observations: p.observations,
              requests: p.requests,
            })),
          },
        },
      });

      // Update SocialAccount.lastSyncedAt
      await this.prismaClient.socialAccount
        .update({
          where: { id: account.id },
          data: { lastSyncedAt: completedTime },
        })
        .catch(() => {});

      // 8. Log ANALYTICS_SYNC_COMPLETED audit event
      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "ANALYTICS_SYNC_COMPLETED",
        resource: "social_account",
        resourceId: account.id,
        details: {
          provider: "YOUTUBE",
          syncJobId,
          mode,
          triggerMode,
          requestCount: totalRequestCount,
          observationCount: totalObservationCount,
          durationMs,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      });

      return {
        success: true,
        accountId: account.id,
        workspaceId: options.workspaceId,
        syncJobId,
        mode,
        startedAt: startTime,
        completedAt: completedTime,
        durationMs,
        requestedDateRange,
        effectiveDateRange,
        patternResults,
        requestCount: totalRequestCount,
        observationCount: totalObservationCount,
        selectedVideoIds,
        warnings,
        overallStatus: "COMPLETED",
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTimeMs;
      const completedTime = this.clock.now();

      if (syncJobId) {
        const triggerMode = options.triggerMode ?? (options.actorUserId ? "MANUAL" : "SCHEDULED");
        await this.prismaClient.syncJob
          .updateMany({
            where: {
              id: syncJobId,
              status: "PROCESSING",
            },
            data: {
              status: "FAILED",
              completedAt: completedTime,
              errorCode: error instanceof SocialError ? error.code : "SOCIAL_API_ERROR",
              errorMessage: error?.message || "YouTube analytics synchronization failed.",
              metadata: {
                mode,
                triggerMode,
                durationMs,
                errorCode: error instanceof SocialError ? error.code : "SOCIAL_API_ERROR",
                errorMessage: error?.message || "YouTube analytics synchronization failed.",
              },
            },
          })
          .catch(() => {});
      }

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "ANALYTICS_SYNC_FAILED",
        resource: "social_account",
        resourceId: account.id,
        details: {
          provider: "YOUTUBE",
          syncJobId,
          mode,
          triggerMode: options.triggerMode ?? (options.actorUserId ? "MANUAL" : "SCHEDULED"),
          durationMs,
          error: error?.message || "Analytics sync failed",
          errorCode: error instanceof SocialError ? error.code : undefined,
        },
      }).catch(() => {});

      if (error instanceof SocialError) {
        throw error;
      }

      throw new SocialError(
        error?.message || "YouTube analytics synchronization failed.",
        "SOCIAL_API_ERROR",
        { provider: "YOUTUBE", cause: error }
      );
    } finally {
      // 9. Guaranteed Distributed Lock Release by Owner
      clearInterval(heartbeatTimer);
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Persists normalized observations in bounded batches of 100 to prevent large transactions.
   */
  private async persistInBatches(
    observations: any[],
    workspaceId: string,
    socialAccountId: string,
    syncJobId: string,
    dataLagDays: number
  ): Promise<void> {
    const BATCH_SIZE = 100;
    for (let i = 0; i < observations.length; i += BATCH_SIZE) {
      const batch = observations.slice(i, i + BATCH_SIZE);
      await this.analyticsRepo.upsertBatch(batch, {
        workspaceId,
        socialAccountId,
        syncJobId,
        dataLagDays,
      });
    }
  }

  /**
   * Handles authentication and authorization failures by marking account status and logging audit event.
   */
  private async handleAuthFailure(
    socialAccountId: string,
    options: AnalyticsSyncOptions,
    err: any
  ): Promise<void> {
    await this.prismaClient.socialAccount
      .update({
        where: { id: socialAccountId },
        data: { status: "REAUTH_REQUIRED" },
      })
      .catch(() => {});

    await logAuditEvent({
      workspaceId: options.workspaceId,
      userId: options.actorUserId,
      action: "ANALYTICS_SYNC_REAUTH_REQUIRED",
      resource: "social_account",
      resourceId: socialAccountId,
      details: {
        provider: "YOUTUBE",
        reason: err.message,
      },
    }).catch(() => {});
  }
}

export const youTubeAnalyticsSyncService = new YouTubeAnalyticsSyncService();
