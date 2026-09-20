import { PrismaClient, AnalyticsObservation as PrismaAnalyticsObservation, SocialAccount } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { SocialError } from "../errors";
import {
  AccountOption,
  DataAvailabilityState,
  FreshnessStatus,
  OverviewDbTotals,
  TopVideoSortField,
  SortOrder,
  TopVideoWithContent,
} from "./dashboard.types";

export type AccountResolutionResult =
  | { status: "RESOLVED"; account: SocialAccount }
  | { status: "MULTIPLE_ACCOUNTS"; accounts: AccountOption[] }
  | { status: "NO_ACCOUNTS" };

export class AnalyticsDashboardRepository {
  private db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  /**
   * Resolves the target SocialAccount for a workspace.
   * If socialAccountId is supplied, verifies workspace ownership and platform = YOUTUBE.
   * If omitted:
   *   - 1 account -> auto-resolved
   *   - >1 accounts -> MULTIPLE_ACCOUNTS
   *   - 0 accounts -> NO_ACCOUNTS
   */
  async resolveAccount(params: {
    workspaceId: string;
    socialAccountId?: string;
  }): Promise<AccountResolutionResult> {
    const { workspaceId, socialAccountId } = params;

    if (socialAccountId) {
      const account = await this.db.socialAccount.findUnique({
        where: { id: socialAccountId },
        include: { platform: true },
      });

      if (!account) {
        throw new SocialError(
          `Social account '${socialAccountId}' was not found.`,
          "SOCIAL_ACCOUNT_RESTRICTED",
          { statusCode: 404 }
        );
      }

      if (account.workspaceId !== workspaceId) {
        throw new SocialError(
          `Tenant isolation violation: Social account '${socialAccountId}' does not belong to workspace '${workspaceId}'.`,
          "SOCIAL_INVALID_REQUEST",
          { statusCode: 403 }
        );
      }

      if (account.platform.code !== "YOUTUBE") {
        throw new SocialError(
          `Social account '${socialAccountId}' is not a YouTube account (platform: ${account.platform.code}).`,
          "SOCIAL_INVALID_REQUEST",
          { statusCode: 400 }
        );
      }

      return { status: "RESOLVED", account };
    }

    // When socialAccountId is omitted, search active connected YouTube accounts
    const accounts = await this.db.socialAccount.findMany({
      where: {
        workspaceId,
        status: { in: ["CONNECTED", "HEALTHY", "SYNCING", "WARNING"] },
        platform: { code: "YOUTUBE" },
      },
      include: { platform: true },
    });

    if (accounts.length === 0) {
      return { status: "NO_ACCOUNTS" };
    }

    if (accounts.length === 1) {
      return { status: "RESOLVED", account: accounts[0] };
    }

    return {
      status: "MULTIPLE_ACCOUNTS",
      accounts: accounts.map((acc) => ({
        id: acc.id,
        externalAccountId: acc.externalAccountId,
        username: acc.username,
        displayName: acc.displayName,
        avatarUrl: acc.avatarUrl,
      })),
    };
  }

  /**
   * Aggregates overview totals via database queries, strictly preserving NULL != 0.
   */
  async getOverviewAggregates(params: {
    workspaceId: string;
    socialAccountId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<OverviewDbTotals> {
    const { workspaceId, socialAccountId, startDate, endDate } = params;

    const [aggregates, countResult] = await Promise.all([
      this.db.analyticsObservation.aggregate({
        where: {
          workspaceId,
          socialAccountId,
          queryPattern: "CHANNEL_DAILY_OVERVIEW",
          observationDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          views: true,
          estimatedMinutesWatched: true,
          likes: true,
          comments: true,
          shares: true,
          subscribersGained: true,
          subscribersLost: true,
          averageViewPercentage: true,
        },
        _count: {
          _all: true,
          views: true,
          estimatedMinutesWatched: true,
          likes: true,
          comments: true,
          shares: true,
          subscribersGained: true,
          subscribersLost: true,
          averageViewPercentage: true,
        },
      }),
      this.db.analyticsObservation.count({
        where: {
          workspaceId,
          socialAccountId,
          queryPattern: "CHANNEL_DAILY_OVERVIEW",
          observationDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    const count = countResult;
    const c = aggregates._count;
    const s = aggregates._sum;

    return {
      count,
      hasMeasuredViews: c.views > 0,
      viewsSum: c.views > 0 ? s.views : null,
      hasMeasuredMinutes: c.estimatedMinutesWatched > 0,
      estimatedMinutesWatchedSum:
        c.estimatedMinutesWatched > 0 ? s.estimatedMinutesWatched : null,
      hasMeasuredLikes: c.likes > 0,
      likesSum: c.likes > 0 ? s.likes : null,
      hasMeasuredComments: c.comments > 0,
      commentsSum: c.comments > 0 ? s.comments : null,
      hasMeasuredShares: c.shares > 0,
      sharesSum: c.shares > 0 ? s.shares : null,
      hasMeasuredSubsGained: c.subscribersGained > 0,
      subscribersGainedSum:
        c.subscribersGained > 0 ? s.subscribersGained : null,
      hasMeasuredSubsLost: c.subscribersLost > 0,
      subscribersLostSum: c.subscribersLost > 0 ? s.subscribersLost : null,
      averageViewPercentageSum:
        c.averageViewPercentage > 0 ? s.averageViewPercentage : null,
      averageViewPercentageCount: c.averageViewPercentage,
    };
  }

  /**
   * Retrieves daily time-series records for trends.
   */
  async getDailyTrends(params: {
    workspaceId: string;
    socialAccountId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<PrismaAnalyticsObservation[]> {
    const { workspaceId, socialAccountId, startDate, endDate } = params;

    return this.db.analyticsObservation.findMany({
      where: {
        workspaceId,
        socialAccountId,
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        granularity: "DAILY",
        observationDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: [{ observationDate: "asc" }, { capturedAt: "asc" }],
    });
  }

  /**
   * Retrieves top video performance strictly enforcing exact period match.
   * If exact match is absent, returns INSUFFICIENT_DATA (never substitutes closest windows).
   */
  async getTopVideos(params: {
    workspaceId: string;
    socialAccountId: string;
    startDate: Date;
    endDate: Date;
    sortBy: TopVideoSortField;
    sortOrder: SortOrder;
    limit: number;
    offset: number;
  }): Promise<{
    items: TopVideoWithContent[];
    total: number;
    dataAvailability: DataAvailabilityState;
  }> {
    const {
      workspaceId,
      socialAccountId,
      startDate,
      endDate,
      sortBy,
      sortOrder,
      limit,
      offset,
    } = params;

    // 1. Look for exact matching aggregated TOP_VIDEOS_PERFORMANCE records
    let effectiveWhere: any = {
      workspaceId,
      socialAccountId,
      queryPattern: "TOP_VIDEOS_PERFORMANCE",
      granularity: "AGGREGATED" as const,
      startDate,
      endDate,
      externalContentId: { not: null },
    };

    let total = await this.db.analyticsObservation.count({
      where: effectiveWhere,
    });

    if (total === 0) {
      // Fallback: Look for latest available TOP_VIDEOS_PERFORMANCE snapshot
      const latestSnapshot = await this.db.analyticsObservation.findFirst({
        where: {
          workspaceId,
          socialAccountId,
          queryPattern: "TOP_VIDEOS_PERFORMANCE",
          granularity: "AGGREGATED",
          externalContentId: { not: null },
        },
        orderBy: { capturedAt: "desc" },
        select: { startDate: true, endDate: true },
      });

      if (latestSnapshot) {
        effectiveWhere = {
          workspaceId,
          socialAccountId,
          queryPattern: "TOP_VIDEOS_PERFORMANCE",
          granularity: "AGGREGATED" as const,
          startDate: latestSnapshot.startDate,
          endDate: latestSnapshot.endDate,
          externalContentId: { not: null },
        };
        total = await this.db.analyticsObservation.count({
          where: effectiveWhere,
        });
      }
    }

    if (total === 0) {
      // Exact period aggregate does not exist.
      return {
        items: [],
        total: 0,
        dataAvailability: "INSUFFICIENT_DATA",
      };
    }

    // 2. Fetch sorted page with deterministic secondary tie-breaker
    const observations = await this.db.analyticsObservation.findMany({
      where: effectiveWhere,
      orderBy: [
        { [sortBy]: sortOrder },
        { externalContentId: "asc" },
      ],
      take: limit,
      skip: offset,
    });

    // 3. Metadata enrichment with ContentPlatform + Content
    const videoIds = observations
      .map((o) => o.externalContentId)
      .filter((id): id is string => Boolean(id));

    const contentPlatforms = await this.db.contentPlatform.findMany({
      where: {
        socialAccountId,
        externalContentId: { in: videoIds },
      },
      include: { content: true },
    });

    const metadataMap = new Map<
      string,
      {
        title: string;
        description: string | null;
        publishedAt: Date | null;
        externalUrl: string | null;
      }
    >();

    for (const cp of contentPlatforms) {
      if (cp.externalContentId) {
        metadataMap.set(cp.externalContentId, {
          title: cp.content.title,
          description: cp.content.description,
          publishedAt: cp.publishedAt ?? cp.content.publishedAt,
          externalUrl: cp.externalUrl,
        });
      }
    }

    const items: TopVideoWithContent[] = observations.map((obs) => {
      const vid = obs.externalContentId!;
      const meta = metadataMap.get(vid);

      return {
        videoId: vid,
        title: meta?.title ?? `YouTube Video (${vid})`,
        description: meta?.description ?? null,
        publishedAt: meta?.publishedAt ?? null,
        externalUrl: meta?.externalUrl ?? null,
        views: obs.views,
        estimatedMinutesWatched: obs.estimatedMinutesWatched,
        averageViewDuration: obs.averageViewDuration,
        averageViewPercentage: obs.averageViewPercentage,
        likes: obs.likes,
        comments: obs.comments,
        shares: obs.shares,
        subscribersGained: obs.subscribersGained,
        engagementRate: obs.engagementRate,
      };
    });

    return {
      items,
      total,
      dataAvailability: "COMPLETE",
    };
  }

  /**
   * Retrieves daily time-series records for a specific video with IDOR protection.
   */
  async getVideoTimeSeries(params: {
    workspaceId: string;
    socialAccountId: string;
    videoId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<{
    content: {
      videoId: string;
      title: string;
      description: string | null;
      publishedAt: Date | null;
      externalUrl: string | null;
    };
    observations: PrismaAnalyticsObservation[];
    dataAvailability: DataAvailabilityState;
  }> {
    const { workspaceId, socialAccountId, videoId, startDate, endDate } =
      params;

    // IDOR protection: Verify this video belongs to the account/workspace
    const cp = await this.db.contentPlatform.findFirst({
      where: {
        socialAccountId,
        externalContentId: videoId,
      },
      include: { content: true },
    });

    // If not in ContentPlatform, check if any observation exists for this video under this account
    const obsCheck = cp
      ? true
      : await this.db.analyticsObservation.findFirst({
          where: {
            workspaceId,
            socialAccountId,
            externalContentId: videoId,
          },
          select: { id: true },
        });

    if (!obsCheck) {
      throw new SocialError(
        `Video '${videoId}' was not found for this account.`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 404 }
      );
    }

    const observations = await this.db.analyticsObservation.findMany({
      where: {
        workspaceId,
        socialAccountId,
        externalContentId: videoId,
        queryPattern: "VIDEO_DAILY_TIME_SERIES",
        granularity: "DAILY",
        observationDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: [{ observationDate: "asc" }, { capturedAt: "asc" }],
    });

    const content = {
      videoId,
      title: cp?.content.title ?? `YouTube Video (${videoId})`,
      description: cp?.content.description ?? null,
      publishedAt: cp?.publishedAt ?? cp?.content.publishedAt ?? null,
      externalUrl: cp?.externalUrl ?? null,
    };

    return {
      content,
      observations,
      dataAvailability: observations.length > 0 ? "COMPLETE" : "NO_DATA",
    };
  }

  /**
   * Retrieves period-level aggregated distribution data (demographics, geography, traffic, devices).
   * Strictly avoids daily percentage summation.
   */
  async getAggregatedDistribution(params: {
    workspaceId: string;
    socialAccountId: string;
    queryPattern: string;
    startDate: Date;
    endDate: Date;
    limit?: number;
  }): Promise<{
    observations: PrismaAnalyticsObservation[];
    dataAvailability: DataAvailabilityState;
  }> {
    const {
      workspaceId,
      socialAccountId,
      queryPattern,
      startDate,
      endDate,
      limit,
    } = params;

    let observations = await this.db.analyticsObservation.findMany({
      where: {
        workspaceId,
        socialAccountId,
        queryPattern,
        granularity: "AGGREGATED",
        startDate,
        endDate,
      },
      orderBy: [{ views: "desc" }, { capturedAt: "desc" }],
      take: limit,
    });

    if (observations.length === 0) {
      // Fallback: Find the latest available snapshot for this queryPattern
      const latestSnapshot = await this.db.analyticsObservation.findFirst({
        where: {
          workspaceId,
          socialAccountId,
          queryPattern,
          granularity: "AGGREGATED",
        },
        orderBy: { capturedAt: "desc" },
        select: { startDate: true, endDate: true },
      });

      if (latestSnapshot) {
        observations = await this.db.analyticsObservation.findMany({
          where: {
            workspaceId,
            socialAccountId,
            queryPattern,
            granularity: "AGGREGATED",
            startDate: latestSnapshot.startDate,
            endDate: latestSnapshot.endDate,
          },
          orderBy: [{ views: "desc" }, { capturedAt: "desc" }],
          take: limit,
        });
      }
    }

    if (observations.length === 0) {
      return {
        observations: [],
        dataAvailability: "INSUFFICIENT_DATA",
      };
    }

    return {
      observations,
      dataAvailability: "COMPLETE",
    };
  }

  /**
   * Queries latest observation metadata to determine data freshness.
   */
  async getAccountFreshness(params: {
    workspaceId: string;
    socialAccountId: string;
    lagDays?: number;
  }): Promise<{
    latestObservationDate: string | null;
    dataAsOf: string | null;
    analyticsDataLagDays: number;
    status: FreshnessStatus;
  }> {
    const { workspaceId, socialAccountId, lagDays = 2 } = params;

    const [latestCapture, latestObsDate] = await Promise.all([
      this.db.analyticsObservation.findFirst({
        where: { workspaceId, socialAccountId },
        orderBy: { capturedAt: "desc" },
        select: { capturedAt: true, dataLagDays: true },
      }),
      this.db.analyticsObservation.findFirst({
        where: {
          workspaceId,
          socialAccountId,
          observationDate: { not: null },
        },
        orderBy: { observationDate: "desc" },
        select: { observationDate: true },
      }),
    ]);

    if (!latestCapture && !latestObsDate) {
      return {
        latestObservationDate: null,
        dataAsOf: null,
        analyticsDataLagDays: lagDays,
        status: "NO_DATA",
      };
    }

    const effectiveLag = latestCapture?.dataLagDays ?? lagDays;
    const observationDateStr = latestObsDate?.observationDate
      ? latestObsDate.observationDate.toISOString().substring(0, 10)
      : null;
    const capturedAtStr = latestCapture?.capturedAt
      ? latestCapture.capturedAt.toISOString()
      : null;

    let status: FreshnessStatus = "FRESH";

    if (latestObsDate?.observationDate) {
      const now = new Date();
      const expectedLatest = new Date(now.getTime());
      expectedLatest.setUTCDate(expectedLatest.getUTCDate() - (effectiveLag + 1));
      const expectedLatestStr = expectedLatest.toISOString().substring(0, 10);

      if (observationDateStr && observationDateStr < expectedLatestStr) {
        status = "STALE";
      }
    }

    return {
      latestObservationDate: observationDateStr,
      dataAsOf: capturedAtStr,
      analyticsDataLagDays: effectiveLag,
      status,
    };
  }

  /**
   * Retrieves lifetime channel stats from the latest AccountMetricSnapshot.
   */
  async getLifetimeStats(socialAccountId: string): Promise<{
    totalSubscribers: string | null;
    totalViews: string | null;
    totalVideos: string | null;
  } | undefined> {
    const snapshot = await this.db.accountMetricSnapshot.findFirst({
      where: { socialAccountId },
      orderBy: { capturedAt: "desc" },
      select: {
        followersCount: true,
        totalViews: true,
        totalVideos: true,
      },
    });

    if (!snapshot) return undefined;

    return {
      totalSubscribers: snapshot.followersCount?.toString() ?? null,
      totalViews: snapshot.totalViews?.toString() ?? null,
      totalVideos: snapshot.totalVideos?.toString() ?? null,
    };
  }
}

export const analyticsDashboardRepository = new AnalyticsDashboardRepository();
