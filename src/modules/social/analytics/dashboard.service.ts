import { SocialError } from "../errors";
import {
  analyticsDashboardRepository,
  AnalyticsDashboardRepository,
} from "./dashboard.repository";
import {
  ALLOWED_SORT_ORDERS,
  ALLOWED_TOP_VIDEO_SORT_FIELDS,
  CountryDistributionItem,
  DailyTrendPoint,
  DashboardAudienceData,
  DashboardDevicesData,
  DashboardGeographyData,
  DashboardOverviewData,
  DashboardResponseEnvelope,
  DashboardSummaryData,
  DashboardTopVideosData,
  DashboardTrafficSourcesData,
  DashboardTrendsData,
  DataAvailabilityState,
  DemographicGroup,
  DeviceDistributionItem,
  MetricComparison,
  SortOrder,
  TopVideoItem,
  TopVideoSortField,
  TrafficSourceItem,
  VideoDetailData,
} from "./dashboard.types";
import { SocialAccount } from "@prisma/client";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface DateRangeResolution {
  startDate: Date;
  endDate: Date;
  startDateStr: string;
  endDateStr: string;
  days: number;
  prevStartDate: Date;
  prevEndDate: Date;
  prevStartDateStr: string;
  prevEndDateStr: string;
}

export class YouTubeDashboardService {
  private repo: AnalyticsDashboardRepository;
  private nowProvider: () => Date;

  constructor(
    repo: AnalyticsDashboardRepository = analyticsDashboardRepository,
    nowProvider: () => Date = () => new Date()
  ) {
    this.repo = repo;
    this.nowProvider = nowProvider;
  }

  // ---------------------------------------------------------------------------
  // Date & Validation Utilities
  // ---------------------------------------------------------------------------

  private formatDateUTC(d: Date): string {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private parseDateUTC(str: string): Date {
    const [year, month, day] = str.split("-").map((v) => parseInt(v, 10));
    return new Date(Date.UTC(year, month - 1, day));
  }

  /**
   * Resolves and validates date ranges against hard limits (no silent clamping).
   * @param maxDays 90 for daily endpoints, 365 for aggregate endpoints.
   */
  resolveDateRange(
    startDateStr?: string,
    endDateStr?: string,
    maxDays: 90 | 365 = 365,
    lagDays = 2
  ): DateRangeResolution {
    const now = this.nowProvider();

    // Default dates if omitted: [today - lag - 27 days, today - lag] (28-day window)
    let endStr = endDateStr;
    let startStr = startDateStr;

    if (!endStr) {
      const defaultEnd = new Date(now.getTime());
      defaultEnd.setUTCDate(defaultEnd.getUTCDate() - lagDays);
      endStr = this.formatDateUTC(defaultEnd);
    }

    if (!startStr) {
      const defaultStart = this.parseDateUTC(endStr);
      defaultStart.setUTCDate(defaultStart.getUTCDate() - 27);
      startStr = this.formatDateUTC(defaultStart);
    }

    // Format syntax validation
    if (!ISO_DATE_REGEX.test(startStr)) {
      throw new SocialError(
        `Invalid startDate: '${startStr}'. Must be formatted as YYYY-MM-DD.`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 400 }
      );
    }

    if (!ISO_DATE_REGEX.test(endStr)) {
      throw new SocialError(
        `Invalid endDate: '${endStr}'. Must be formatted as YYYY-MM-DD.`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 400 }
      );
    }

    const startDate = this.parseDateUTC(startStr);
    const endDate = this.parseDateUTC(endStr);

    if (startDate.getTime() > endDate.getTime()) {
      throw new SocialError(
        `Invalid date interval: startDate (${startStr}) must not be after endDate (${endStr}).`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 400 }
      );
    }

    const todayStr = this.formatDateUTC(now);
    if (endStr > todayStr) {
      throw new SocialError(
        `Invalid endDate: '${endStr}' is in the future (current date: ${todayStr}).`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 400 }
      );
    }

    const diffTime = endDate.getTime() - startDate.getTime();
    const days = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (days > maxDays) {
      throw new SocialError(
        `Requested date range of ${days} days exceeds the maximum allowed limit of ${maxDays} days.`,
        "DATE_RANGE_EXCEEDED",
        { statusCode: 400 }
      );
    }

    // Previous comparison period calculation (same number of days immediately preceding)
    const prevEndDate = new Date(startDate.getTime());
    prevEndDate.setUTCDate(prevEndDate.getUTCDate() - 1);

    const prevStartDate = new Date(prevEndDate.getTime());
    prevStartDate.setUTCDate(prevStartDate.getUTCDate() - (days - 1));

    return {
      startDate,
      endDate,
      startDateStr: startStr,
      endDateStr: endStr,
      days,
      prevStartDate,
      prevEndDate,
      prevStartDateStr: this.formatDateUTC(prevStartDate),
      prevEndDateStr: this.formatDateUTC(prevEndDate),
    };
  }

  // ---------------------------------------------------------------------------
  // Account Resolution
  // ---------------------------------------------------------------------------

  async resolveAccountOrThrow(params: {
    workspaceId: string;
    socialAccountId?: string;
  }): Promise<
    | { status: "RESOLVED"; account: SocialAccount }
    | { status: "NO_ACCOUNTS" }
  > {
    const result = await this.repo.resolveAccount(params);

    if (result.status === "MULTIPLE_ACCOUNTS") {
      throw new SocialError(
        "Multiple connected YouTube accounts found in this workspace. Please specify 'socialAccountId'.",
        "MULTIPLE_ACCOUNTS_FOUND",
        {
          statusCode: 400,
        }
      );
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Comparison & Mathematical Formulas (Strict NULL != 0)
  // ---------------------------------------------------------------------------

  private computeBigIntComparison(
    current: bigint | null,
    previous: bigint | null
  ): MetricComparison<string | null> {
    if (current === null || previous === null) {
      return {
        current: current !== null ? current.toString() : null,
        previous: previous !== null ? previous.toString() : null,
        delta: null,
        percentageChange: null,
      };
    }

    const delta = current - previous;
    let percentageChange: number | null = null;

    if (previous === 0n) {
      percentageChange = current === 0n ? 0 : null;
    } else {
      const deltaNum = Number(delta);
      const prevNum = Number(previous);
      percentageChange = Math.round((deltaNum / prevNum) * 10000) / 100;
    }

    return {
      current: current.toString(),
      previous: previous.toString(),
      delta: delta.toString(),
      percentageChange,
    };
  }

  private computeNumberComparison(
    current: number | null,
    previous: number | null
  ): MetricComparison<number | null> {
    if (current === null || previous === null) {
      return {
        current,
        previous,
        delta: null,
        percentageChange: null,
      };
    }

    const delta = Math.round((current - previous) * 100) / 100;
    let percentageChange: number | null = null;

    if (previous === 0) {
      percentageChange = current === 0 ? 0 : null;
    } else {
      percentageChange =
        Math.round(((current - previous) / previous) * 10000) / 100;
    }

    return {
      current,
      previous,
      delta,
      percentageChange,
    };
  }

  private calculateEngagementRate(
    views: bigint | null,
    likes: bigint | null,
    comments: bigint | null,
    shares: bigint | null
  ): number | null {
    if (
      views === null ||
      views === 0n ||
      likes === null ||
      comments === null ||
      shares === null
    ) {
      return null;
    }

    const totalInteractions = likes + comments + shares;
    const rate = Number(totalInteractions) / Number(views);
    return Math.round(rate * 10000) / 100;
  }

  private calculateAverageViewDuration(
    minutes: bigint | null,
    views: bigint | null
  ): number | null {
    if (views === null || views === 0n || minutes === null) {
      return null;
    }
    const seconds = Number(minutes) * 60;
    return Math.round(seconds / Number(views));
  }

  private buildEmptyEnvelope<T>(
    workspaceId: string,
    socialAccountId: string,
    data: T,
    dateRange: DateRangeResolution
  ): DashboardResponseEnvelope<T> {
    return {
      data,
      meta: {
        workspaceId,
        socialAccountId,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        dataAvailability: "NO_DATA",
        freshness: {
          latestObservationDate: null,
          dataAsOf: null,
          analyticsDataLagDays: 2,
          status: "NO_DATA",
        },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Endpoints Implementation
  // ---------------------------------------------------------------------------

  /**
   * Overview KPI cards with previous period comparison.
   */
  async getOverview(params: {
    workspaceId: string;
    socialAccountId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardResponseEnvelope<DashboardOverviewData>> {
    const { workspaceId, socialAccountId, startDate, endDate } = params;
    const accountRes = await this.resolveAccountOrThrow({
      workspaceId,
      socialAccountId,
    });

    const dateRange = this.resolveDateRange(startDate, endDate, 365);

    if (accountRes.status === "NO_ACCOUNTS") {
      const emptyOverview: DashboardOverviewData = {
        views: { current: null, previous: null, delta: null, percentageChange: null },
        estimatedMinutesWatched: { current: null, previous: null, delta: null, percentageChange: null },
        averageViewDurationSeconds: { current: null, previous: null, delta: null, percentageChange: null },
        averageViewPercentage: { current: null, previous: null, delta: null, percentageChange: null },
        likes: { current: null, previous: null, delta: null, percentageChange: null },
        comments: { current: null, previous: null, delta: null, percentageChange: null },
        shares: { current: null, previous: null, delta: null, percentageChange: null },
        subscribersGained: { current: null, previous: null, delta: null, percentageChange: null },
        subscribersLost: { current: null, previous: null, delta: null, percentageChange: null },
        netSubscribers: { current: null, previous: null, delta: null, percentageChange: null },
        engagementRate: { current: null, previous: null, delta: null, percentageChange: null },
      };
      return this.buildEmptyEnvelope(workspaceId, "", emptyOverview, dateRange);
    }

    const account = accountRes.account;

    const [curTotals, prevTotals, freshness, lifetime] = await Promise.all([
      this.repo.getOverviewAggregates({
        workspaceId,
        socialAccountId: account.id,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
      this.repo.getOverviewAggregates({
        workspaceId,
        socialAccountId: account.id,
        startDate: dateRange.prevStartDate,
        endDate: dateRange.prevEndDate,
      }),
      this.repo.getAccountFreshness({
        workspaceId,
        socialAccountId: account.id,
      }),
      this.repo.getLifetimeStats(account.id),
    ]);

    // Average View Duration
    const curAvgDuration = this.calculateAverageViewDuration(
      curTotals.estimatedMinutesWatchedSum,
      curTotals.viewsSum
    );
    const prevAvgDuration = this.calculateAverageViewDuration(
      prevTotals.estimatedMinutesWatchedSum,
      prevTotals.viewsSum
    );

    // Average View Percentage
    const curAvgPct =
      curTotals.averageViewPercentageCount > 0 &&
      curTotals.averageViewPercentageSum !== null
        ? Math.round(
            (curTotals.averageViewPercentageSum.toNumber() /
              curTotals.averageViewPercentageCount) *
              100
          ) / 100
        : null;

    const prevAvgPct =
      prevTotals.averageViewPercentageCount > 0 &&
      prevTotals.averageViewPercentageSum !== null
        ? Math.round(
            (prevTotals.averageViewPercentageSum.toNumber() /
              prevTotals.averageViewPercentageCount) *
              100
          ) / 100
        : null;

    // Engagement Rate
    const curEngRate = this.calculateEngagementRate(
      curTotals.viewsSum,
      curTotals.likesSum,
      curTotals.commentsSum,
      curTotals.sharesSum
    );
    const prevEngRate = this.calculateEngagementRate(
      prevTotals.viewsSum,
      prevTotals.likesSum,
      prevTotals.commentsSum,
      prevTotals.sharesSum
    );

    // Net Subscribers
    const curNetSubs =
      curTotals.hasMeasuredSubsGained && curTotals.hasMeasuredSubsLost
        ? (curTotals.subscribersGainedSum ?? 0n) -
          (curTotals.subscribersLostSum ?? 0n)
        : null;

    const prevNetSubs =
      prevTotals.hasMeasuredSubsGained && prevTotals.hasMeasuredSubsLost
        ? (prevTotals.subscribersGainedSum ?? 0n) -
          (prevTotals.subscribersLostSum ?? 0n)
        : null;

    const dataAvailability: DataAvailabilityState =
      curTotals.count > 0 ? "COMPLETE" : "NO_DATA";

    const overviewData: DashboardOverviewData = {
      views: this.computeBigIntComparison(curTotals.viewsSum, prevTotals.viewsSum),
      estimatedMinutesWatched: this.computeBigIntComparison(
        curTotals.estimatedMinutesWatchedSum,
        prevTotals.estimatedMinutesWatchedSum
      ),
      averageViewDurationSeconds: this.computeNumberComparison(
        curAvgDuration,
        prevAvgDuration
      ),
      averageViewPercentage: this.computeNumberComparison(curAvgPct, prevAvgPct),
      likes: this.computeBigIntComparison(curTotals.likesSum, prevTotals.likesSum),
      comments: this.computeBigIntComparison(curTotals.commentsSum, prevTotals.commentsSum),
      shares: this.computeBigIntComparison(curTotals.sharesSum, prevTotals.sharesSum),
      subscribersGained: this.computeBigIntComparison(
        curTotals.subscribersGainedSum,
        prevTotals.subscribersGainedSum
      ),
      subscribersLost: this.computeBigIntComparison(
        curTotals.subscribersLostSum,
        prevTotals.subscribersLostSum
      ),
      netSubscribers: this.computeBigIntComparison(curNetSubs, prevNetSubs),
      engagementRate: this.computeNumberComparison(curEngRate, prevEngRate),
      lifetimeStats: lifetime,
    };

    return {
      data: overviewData,
      meta: {
        workspaceId,
        socialAccountId: account.id,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        comparison: {
          startDate: dateRange.prevStartDateStr,
          endDate: dateRange.prevEndDateStr,
          days: dateRange.days,
        },
        dataAvailability,
        freshness,
      },
    };
  }

  /**
   * Daily time series trends (max 90 days).
   */
  async getTrends(params: {
    workspaceId: string;
    socialAccountId?: string;
    startDate?: string;
    endDate?: string;
    metrics?: string;
  }): Promise<DashboardResponseEnvelope<DashboardTrendsData>> {
    const { workspaceId, socialAccountId, startDate, endDate } = params;
    const accountRes = await this.resolveAccountOrThrow({
      workspaceId,
      socialAccountId,
    });

    const dateRange = this.resolveDateRange(startDate, endDate, 90);

    if (accountRes.status === "NO_ACCOUNTS") {
      return this.buildEmptyEnvelope(
        workspaceId,
        "",
        { series: [] },
        dateRange
      );
    }

    const account = accountRes.account;

    const [observations, freshness] = await Promise.all([
      this.repo.getDailyTrends({
        workspaceId,
        socialAccountId: account.id,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
      this.repo.getAccountFreshness({
        workspaceId,
        socialAccountId: account.id,
      }),
    ]);

    const series: DailyTrendPoint[] = observations.map((obs) => {
      const engRate = this.calculateEngagementRate(
        obs.views,
        obs.likes,
        obs.comments,
        obs.shares
      );

      return {
        date: obs.observationDate
          ? this.formatDateUTC(obs.observationDate)
          : obs.startDate.toISOString().substring(0, 10),
        views: obs.views !== null ? obs.views.toString() : null,
        estimatedMinutesWatched:
          obs.estimatedMinutesWatched !== null
            ? obs.estimatedMinutesWatched.toString()
            : null,
        averageViewDuration: obs.averageViewDuration,
        likes: obs.likes !== null ? obs.likes.toString() : null,
        comments: obs.comments !== null ? obs.comments.toString() : null,
        shares: obs.shares !== null ? obs.shares.toString() : null,
        subscribersGained:
          obs.subscribersGained !== null ? obs.subscribersGained.toString() : null,
        subscribersLost:
          obs.subscribersLost !== null ? obs.subscribersLost.toString() : null,
        engagementRate: engRate,
      };
    });

    const dataAvailability: DataAvailabilityState =
      series.length > 0 ? "COMPLETE" : "NO_DATA";

    return {
      data: { series },
      meta: {
        workspaceId,
        socialAccountId: account.id,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        dataAvailability,
        freshness,
      },
    };
  }

  /**
   * Top video performance with strict period integrity (max 365 days).
   */
  async getTopVideos(params: {
    workspaceId: string;
    socialAccountId?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
  }): Promise<DashboardResponseEnvelope<DashboardTopVideosData>> {
    const {
      workspaceId,
      socialAccountId,
      startDate,
      endDate,
      sortBy: rawSortBy = "views",
      sortOrder: rawSortOrder = "desc",
      limit: rawLimit = 10,
      offset: rawOffset = 0,
    } = params;

    // Validate sort parameters
    if (
      !ALLOWED_TOP_VIDEO_SORT_FIELDS.includes(
        rawSortBy as TopVideoSortField
      )
    ) {
      throw new SocialError(
        `Invalid sortBy: '${rawSortBy}'. Allowed fields: ${ALLOWED_TOP_VIDEO_SORT_FIELDS.join(", ")}.`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 400 }
      );
    }

    if (!ALLOWED_SORT_ORDERS.includes(rawSortOrder as SortOrder)) {
      throw new SocialError(
        `Invalid sortOrder: '${rawSortOrder}'. Allowed values: asc, desc.`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 400 }
      );
    }

    const sortBy = rawSortBy as TopVideoSortField;
    const sortOrder = rawSortOrder as SortOrder;

    const limit = Math.min(Math.max(Number(rawLimit) || 10, 1), 50);
    const offset = Math.max(Number(rawOffset) || 0, 0);

    const accountRes = await this.resolveAccountOrThrow({
      workspaceId,
      socialAccountId,
    });

    const dateRange = this.resolveDateRange(startDate, endDate, 365);

    if (accountRes.status === "NO_ACCOUNTS") {
      return this.buildEmptyEnvelope(
        workspaceId,
        "",
        { videos: [], pagination: { total: 0, limit, offset, hasMore: false } },
        dateRange
      );
    }

    const account = accountRes.account;

    const [topResult, freshness] = await Promise.all([
      this.repo.getTopVideos({
        workspaceId,
        socialAccountId: account.id,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sortBy,
        sortOrder,
        limit,
        offset,
      }),
      this.repo.getAccountFreshness({
        workspaceId,
        socialAccountId: account.id,
      }),
    ]);

    const videos: TopVideoItem[] = topResult.items.map((item, idx) => {
      const engRate = item.engagementRate
        ? item.engagementRate.toNumber()
        : this.calculateEngagementRate(
            item.views,
            item.likes,
            item.comments,
            item.shares
          );

      return {
        videoId: item.videoId,
        title: item.title,
        description: item.description,
        publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
        externalUrl: item.externalUrl,
        rank: offset + idx + 1,
        metrics: {
          views: item.views !== null ? item.views.toString() : null,
          estimatedMinutesWatched:
            item.estimatedMinutesWatched !== null
              ? item.estimatedMinutesWatched.toString()
              : null,
          averageViewDuration: item.averageViewDuration,
          averageViewPercentage: item.averageViewPercentage
            ? item.averageViewPercentage.toNumber()
            : null,
          likes: item.likes !== null ? item.likes.toString() : null,
          comments: item.comments !== null ? item.comments.toString() : null,
          shares: item.shares !== null ? item.shares.toString() : null,
          subscribersGained:
            item.subscribersGained !== null
              ? item.subscribersGained.toString()
              : null,
          engagementRate: engRate,
        },
      };
    });

    const hasMore = offset + videos.length < topResult.total;

    return {
      data: {
        videos,
        pagination: {
          total: topResult.total,
          limit,
          offset,
          hasMore,
        },
      },
      meta: {
        workspaceId,
        socialAccountId: account.id,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        dataAvailability: topResult.dataAvailability,
        freshness,
      },
    };
  }

  /**
   * Single video daily breakdown with IDOR protection (max 90 days).
   */
  async getVideoDetail(params: {
    workspaceId: string;
    socialAccountId?: string;
    videoId: string;
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardResponseEnvelope<VideoDetailData>> {
    const { workspaceId, socialAccountId, videoId, startDate, endDate } =
      params;

    if (!videoId) {
      throw new SocialError(
        "Missing required path parameter: 'videoId'",
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 400 }
      );
    }

    const accountRes = await this.resolveAccountOrThrow({
      workspaceId,
      socialAccountId,
    });

    const dateRange = this.resolveDateRange(startDate, endDate, 90);

    if (accountRes.status === "NO_ACCOUNTS") {
      throw new SocialError(
        "No active YouTube accounts found in this workspace.",
        "SOCIAL_ACCOUNT_RESTRICTED",
        { statusCode: 404 }
      );
    }

    const account = accountRes.account;

    const [videoData, freshness] = await Promise.all([
      this.repo.getVideoTimeSeries({
        workspaceId,
        socialAccountId: account.id,
        videoId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
      this.repo.getAccountFreshness({
        workspaceId,
        socialAccountId: account.id,
      }),
    ]);

    let sumViews = 0n;
    let sumMinutes = 0n;
    let sumLikes = 0n;
    let sumComments = 0n;
    let sumShares = 0n;
    let sumSubsGained = 0n;
    let hasViews = false;
    let hasMinutes = false;
    let hasLikes = false;
    let hasComments = false;
    let hasShares = false;
    let hasSubsGained = false;

    const dailySeries: DailyTrendPoint[] = videoData.observations.map((obs) => {
      if (obs.views !== null) {
        sumViews += obs.views;
        hasViews = true;
      }
      if (obs.estimatedMinutesWatched !== null) {
        sumMinutes += obs.estimatedMinutesWatched;
        hasMinutes = true;
      }
      if (obs.likes !== null) {
        sumLikes += obs.likes;
        hasLikes = true;
      }
      if (obs.comments !== null) {
        sumComments += obs.comments;
        hasComments = true;
      }
      if (obs.shares !== null) {
        sumShares += obs.shares;
        hasShares = true;
      }
      if (obs.subscribersGained !== null) {
        sumSubsGained += obs.subscribersGained;
        hasSubsGained = true;
      }

      const engRate = this.calculateEngagementRate(
        obs.views,
        obs.likes,
        obs.comments,
        obs.shares
      );

      return {
        date: obs.observationDate
          ? this.formatDateUTC(obs.observationDate)
          : obs.startDate.toISOString().substring(0, 10),
        views: obs.views !== null ? obs.views.toString() : null,
        estimatedMinutesWatched:
          obs.estimatedMinutesWatched !== null
            ? obs.estimatedMinutesWatched.toString()
            : null,
        averageViewDuration: obs.averageViewDuration,
        likes: obs.likes !== null ? obs.likes.toString() : null,
        comments: obs.comments !== null ? obs.comments.toString() : null,
        shares: obs.shares !== null ? obs.shares.toString() : null,
        subscribersGained:
          obs.subscribersGained !== null
            ? obs.subscribersGained.toString()
            : null,
        subscribersLost:
          obs.subscribersLost !== null ? obs.subscribersLost.toString() : null,
        engagementRate: engRate,
      };
    });

    const totalViews = hasViews ? sumViews : null;
    const totalMinutes = hasMinutes ? sumMinutes : null;
    const totalLikes = hasLikes ? sumLikes : null;
    const totalComments = hasComments ? sumComments : null;
    const totalShares = hasShares ? sumShares : null;
    const totalSubsGained = hasSubsGained ? sumSubsGained : null;

    const avgDuration = this.calculateAverageViewDuration(
      totalMinutes,
      totalViews
    );
    const overallEngRate = this.calculateEngagementRate(
      totalViews,
      totalLikes,
      totalComments,
      totalShares
    );

    const periodTotals = {
      views: totalViews !== null ? totalViews.toString() : null,
      estimatedMinutesWatched:
        totalMinutes !== null ? totalMinutes.toString() : null,
      averageViewDuration: avgDuration,
      averageViewPercentage: null,
      likes: totalLikes !== null ? totalLikes.toString() : null,
      comments: totalComments !== null ? totalComments.toString() : null,
      shares: totalShares !== null ? totalShares.toString() : null,
      subscribersGained:
        totalSubsGained !== null ? totalSubsGained.toString() : null,
      engagementRate: overallEngRate,
    };

    return {
      data: {
        video: {
          videoId: videoData.content.videoId,
          title: videoData.content.title,
          description: videoData.content.description,
          publishedAt: videoData.content.publishedAt
            ? videoData.content.publishedAt.toISOString()
            : null,
          externalUrl: videoData.content.externalUrl,
        },
        periodTotals,
        dailySeries,
      },
      meta: {
        workspaceId,
        socialAccountId: account.id,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        dataAvailability: videoData.dataAvailability,
        freshness,
      },
    };
  }

  /**
   * Demographics: age & gender distribution (period aggregate only; never daily sum).
   */
  async getAudience(params: {
    workspaceId: string;
    socialAccountId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardResponseEnvelope<DashboardAudienceData>> {
    const { workspaceId, socialAccountId, startDate, endDate } = params;
    const accountRes = await this.resolveAccountOrThrow({
      workspaceId,
      socialAccountId,
    });

    const dateRange = this.resolveDateRange(startDate, endDate, 365);

    if (accountRes.status === "NO_ACCOUNTS") {
      return this.buildEmptyEnvelope(
        workspaceId,
        "",
        {
          demographics: [],
          genderTotals: { male: 0, female: 0, userSpecified: 0 },
          ageTotals: {},
        },
        dateRange
      );
    }

    const account = accountRes.account;

    const [distResult, freshness] = await Promise.all([
      this.repo.getAggregatedDistribution({
        workspaceId,
        socialAccountId: account.id,
        queryPattern: "VIEWER_DEMOGRAPHICS",
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
      this.repo.getAccountFreshness({
        workspaceId,
        socialAccountId: account.id,
      }),
    ]);

    const demographics: DemographicGroup[] = [];
    const genderTotals = { male: 0, female: 0, userSpecified: 0 };
    const ageTotals: Record<string, number> = {};

    for (const obs of distResult.observations) {
      const dims = obs.dimensions as Record<string, string> | null;
      const metrics = obs.metrics as Record<string, any> | null;

      const ageGroup = dims?.ageGroup ?? "unknown";
      const genderRaw = dims?.gender ?? "user_specified";
      const gender: DemographicGroup["gender"] =
        genderRaw === "female" || genderRaw === "male"
          ? genderRaw
          : "user_specified";

      const pct = Number(metrics?.viewerPercentage ?? 0);

      demographics.push({
        ageGroup,
        gender,
        viewerPercentage: pct,
      });

      if (gender === "female") genderTotals.female += pct;
      else if (gender === "male") genderTotals.male += pct;
      else genderTotals.userSpecified += pct;

      ageTotals[ageGroup] = (ageTotals[ageGroup] ?? 0) + pct;
    }

    // Round totals
    genderTotals.female = Math.round(genderTotals.female * 100) / 100;
    genderTotals.male = Math.round(genderTotals.male * 100) / 100;
    genderTotals.userSpecified =
      Math.round(genderTotals.userSpecified * 100) / 100;

    for (const k of Object.keys(ageTotals)) {
      ageTotals[k] = Math.round(ageTotals[k] * 100) / 100;
    }

    return {
      data: {
        demographics,
        genderTotals,
        ageTotals,
      },
      meta: {
        workspaceId,
        socialAccountId: account.id,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        dataAvailability: distResult.dataAvailability,
        freshness,
      },
    };
  }

  /**
   * Country distribution with percentage shares (period aggregate only).
   */
  async getGeography(params: {
    workspaceId: string;
    socialAccountId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<DashboardResponseEnvelope<DashboardGeographyData>> {
    const {
      workspaceId,
      socialAccountId,
      startDate,
      endDate,
      limit: rawLimit = 20,
    } = params;

    const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 100);

    const accountRes = await this.resolveAccountOrThrow({
      workspaceId,
      socialAccountId,
    });

    const dateRange = this.resolveDateRange(startDate, endDate, 365);

    if (accountRes.status === "NO_ACCOUNTS") {
      return this.buildEmptyEnvelope(
        workspaceId,
        "",
        { countries: [], totalPeriodViews: null },
        dateRange
      );
    }

    const account = accountRes.account;

    const [distResult, freshness] = await Promise.all([
      this.repo.getAggregatedDistribution({
        workspaceId,
        socialAccountId: account.id,
        queryPattern: "GEOGRAPHIC_DISTRIBUTION",
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        limit,
      }),
      this.repo.getAccountFreshness({
        workspaceId,
        socialAccountId: account.id,
      }),
    ]);

    let totalViews = 0n;
    for (const obs of distResult.observations) {
      if (obs.views !== null) {
        totalViews += obs.views;
      }
    }

    const totalViewsNum = Number(totalViews);

    const countries: CountryDistributionItem[] = distResult.observations.map(
      (obs) => {
        const dims = obs.dimensions as Record<string, string> | null;
        const countryCode = dims?.country ?? "UNKNOWN";

        let percentageShare: number | null = null;
        if (totalViewsNum > 0 && obs.views !== null) {
          percentageShare =
            Math.round((Number(obs.views) / totalViewsNum) * 10000) / 100;
        }

        return {
          countryCode,
          countryName: countryCode, // In UI / future resolved via ISO dictionary
          views: obs.views !== null ? obs.views.toString() : null,
          estimatedMinutesWatched:
            obs.estimatedMinutesWatched !== null
              ? obs.estimatedMinutesWatched.toString()
              : null,
          subscribersGained:
            obs.subscribersGained !== null
              ? obs.subscribersGained.toString()
              : null,
          percentageShare,
        };
      }
    );

    return {
      data: {
        countries,
        totalPeriodViews: totalViews > 0n ? totalViews.toString() : null,
      },
      meta: {
        workspaceId,
        socialAccountId: account.id,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        dataAvailability: distResult.dataAvailability,
        freshness,
      },
    };
  }

  /**
   * Traffic sources distribution (period aggregate only).
   */
  async getTrafficSources(params: {
    workspaceId: string;
    socialAccountId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardResponseEnvelope<DashboardTrafficSourcesData>> {
    const { workspaceId, socialAccountId, startDate, endDate } = params;
    const accountRes = await this.resolveAccountOrThrow({
      workspaceId,
      socialAccountId,
    });

    const dateRange = this.resolveDateRange(startDate, endDate, 365);

    if (accountRes.status === "NO_ACCOUNTS") {
      return this.buildEmptyEnvelope(
        workspaceId,
        "",
        { sources: [] },
        dateRange
      );
    }

    const account = accountRes.account;

    const [distResult, freshness] = await Promise.all([
      this.repo.getAggregatedDistribution({
        workspaceId,
        socialAccountId: account.id,
        queryPattern: "TRAFFIC_SOURCE_DISTRIBUTION",
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
      this.repo.getAccountFreshness({
        workspaceId,
        socialAccountId: account.id,
      }),
    ]);

    let totalViews = 0n;
    for (const obs of distResult.observations) {
      if (obs.views !== null) totalViews += obs.views;
    }
    const totalViewsNum = Number(totalViews);

    const friendlyNames: Record<string, string> = {
      YT_SEARCH: "YouTube Search",
      RELATED_VIDEO: "Suggested Videos",
      SUGGESTED_VIDEO: "Suggested Videos",
      EXT_URL: "External",
      NOTIFICATION: "Notifications",
      DIRECT_OR_UNKNOWN: "Direct or Unknown",
      PLAYLIST: "Playlists",
      END_SCREEN: "End Screens",
      SHORTS: "Shorts Feed",
    };

    const sources: TrafficSourceItem[] = distResult.observations.map((obs) => {
      const dims = obs.dimensions as Record<string, string> | null;
      const sourceType = dims?.insightTrafficSourceType ?? "UNKNOWN";
      const displayName = friendlyNames[sourceType] ?? sourceType;

      let percentageShare: number | null = null;
      if (totalViewsNum > 0 && obs.views !== null) {
        percentageShare =
          Math.round((Number(obs.views) / totalViewsNum) * 10000) / 100;
      }

      return {
        sourceType,
        displayName,
        views: obs.views !== null ? obs.views.toString() : null,
        estimatedMinutesWatched:
          obs.estimatedMinutesWatched !== null
            ? obs.estimatedMinutesWatched.toString()
            : null,
        percentageShare,
      };
    });

    return {
      data: { sources },
      meta: {
        workspaceId,
        socialAccountId: account.id,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        dataAvailability: distResult.dataAvailability,
        freshness,
      },
    };
  }

  /**
   * Device distribution (period aggregate only).
   */
  async getDevices(params: {
    workspaceId: string;
    socialAccountId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardResponseEnvelope<DashboardDevicesData>> {
    const { workspaceId, socialAccountId, startDate, endDate } = params;
    const accountRes = await this.resolveAccountOrThrow({
      workspaceId,
      socialAccountId,
    });

    const dateRange = this.resolveDateRange(startDate, endDate, 365);

    if (accountRes.status === "NO_ACCOUNTS") {
      return this.buildEmptyEnvelope(
        workspaceId,
        "",
        { devices: [] },
        dateRange
      );
    }

    const account = accountRes.account;

    const [distResult, freshness] = await Promise.all([
      this.repo.getAggregatedDistribution({
        workspaceId,
        socialAccountId: account.id,
        queryPattern: "DEVICE_DISTRIBUTION",
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
      this.repo.getAccountFreshness({
        workspaceId,
        socialAccountId: account.id,
      }),
    ]);

    let totalViews = 0n;
    for (const obs of distResult.observations) {
      if (obs.views !== null) totalViews += obs.views;
    }
    const totalViewsNum = Number(totalViews);

    const friendlyNames: Record<string, string> = {
      MOBILE: "Mobile phone",
      DESKTOP: "Computer",
      TV: "TV",
      TABLET: "Tablet",
      GAME_CONSOLE: "Game Console",
      UNKNOWN: "Unknown",
    };

    const devices: DeviceDistributionItem[] = distResult.observations.map(
      (obs) => {
        const dims = obs.dimensions as Record<string, string> | null;
        const deviceType = dims?.deviceType ?? "UNKNOWN";
        const displayName = friendlyNames[deviceType] ?? deviceType;

        let percentageShare: number | null = null;
        if (totalViewsNum > 0 && obs.views !== null) {
          percentageShare =
            Math.round((Number(obs.views) / totalViewsNum) * 10000) / 100;
        }

        return {
          deviceType,
          displayName,
          views: obs.views !== null ? obs.views.toString() : null,
          estimatedMinutesWatched:
            obs.estimatedMinutesWatched !== null
              ? obs.estimatedMinutesWatched.toString()
              : null,
          percentageShare,
        };
      }
    );

    return {
      data: { devices },
      meta: {
        workspaceId,
        socialAccountId: account.id,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        dataAvailability: distResult.dataAvailability,
        freshness,
      },
    };
  }

  /**
   * Composite summary endpoint: Overview + Daily Trends + Top 5 Videos.
   * Executes a bounded query budget in parallel using Promise.all with single account resolution.
   */
  async getSummary(params: {
    workspaceId: string;
    socialAccountId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardResponseEnvelope<DashboardSummaryData>> {
    const { workspaceId, socialAccountId, startDate, endDate } = params;

    // Daily trends limit (90 days) takes precedence for summary endpoint
    const dateRange = this.resolveDateRange(startDate, endDate, 90);

    const accountRes = await this.resolveAccountOrThrow({
      workspaceId,
      socialAccountId,
    });

    if (accountRes.status === "NO_ACCOUNTS") {
      const emptyOverview: DashboardOverviewData = {
        views: { current: null, previous: null, delta: null, percentageChange: null },
        estimatedMinutesWatched: { current: null, previous: null, delta: null, percentageChange: null },
        averageViewDurationSeconds: { current: null, previous: null, delta: null, percentageChange: null },
        averageViewPercentage: { current: null, previous: null, delta: null, percentageChange: null },
        likes: { current: null, previous: null, delta: null, percentageChange: null },
        comments: { current: null, previous: null, delta: null, percentageChange: null },
        shares: { current: null, previous: null, delta: null, percentageChange: null },
        subscribersGained: { current: null, previous: null, delta: null, percentageChange: null },
        subscribersLost: { current: null, previous: null, delta: null, percentageChange: null },
        netSubscribers: { current: null, previous: null, delta: null, percentageChange: null },
        engagementRate: { current: null, previous: null, delta: null, percentageChange: null },
      };

      return this.buildEmptyEnvelope(
        workspaceId,
        "",
        {
          overview: emptyOverview,
          trends: { series: [] },
          topVideos: {
            videos: [],
            pagination: { total: 0, limit: 5, offset: 0, hasMore: false },
          },
        },
        dateRange
      );
    }

    const account = accountRes.account;

    // Single parallelized execution pipeline: Exactly 6 targeted queries
    const [
      curTotals,
      prevTotals,
      dailyObservations,
      topResult,
      freshness,
      lifetime,
    ] = await Promise.all([
      this.repo.getOverviewAggregates({
        workspaceId,
        socialAccountId: account.id,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
      this.repo.getOverviewAggregates({
        workspaceId,
        socialAccountId: account.id,
        startDate: dateRange.prevStartDate,
        endDate: dateRange.prevEndDate,
      }),
      this.repo.getDailyTrends({
        workspaceId,
        socialAccountId: account.id,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
      this.repo.getTopVideos({
        workspaceId,
        socialAccountId: account.id,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sortBy: "views",
        sortOrder: "desc",
        limit: 5,
        offset: 0,
      }),
      this.repo.getAccountFreshness({
        workspaceId,
        socialAccountId: account.id,
      }),
      this.repo.getLifetimeStats(account.id),
    ]);

    // Format Overview
    const curAvgDuration = this.calculateAverageViewDuration(
      curTotals.estimatedMinutesWatchedSum,
      curTotals.viewsSum
    );
    const prevAvgDuration = this.calculateAverageViewDuration(
      prevTotals.estimatedMinutesWatchedSum,
      prevTotals.viewsSum
    );

    const curAvgPct =
      curTotals.averageViewPercentageCount > 0 &&
      curTotals.averageViewPercentageSum !== null
        ? Math.round(
            (curTotals.averageViewPercentageSum.toNumber() /
              curTotals.averageViewPercentageCount) *
              100
          ) / 100
        : null;

    const prevAvgPct =
      prevTotals.averageViewPercentageCount > 0 &&
      prevTotals.averageViewPercentageSum !== null
        ? Math.round(
            (prevTotals.averageViewPercentageSum.toNumber() /
              prevTotals.averageViewPercentageCount) *
              100
          ) / 100
        : null;

    const curEngRate = this.calculateEngagementRate(
      curTotals.viewsSum,
      curTotals.likesSum,
      curTotals.commentsSum,
      curTotals.sharesSum
    );
    const prevEngRate = this.calculateEngagementRate(
      prevTotals.viewsSum,
      prevTotals.likesSum,
      prevTotals.commentsSum,
      prevTotals.sharesSum
    );

    const curNetSubs =
      curTotals.hasMeasuredSubsGained && curTotals.hasMeasuredSubsLost
        ? (curTotals.subscribersGainedSum ?? 0n) -
          (curTotals.subscribersLostSum ?? 0n)
        : null;

    const prevNetSubs =
      prevTotals.hasMeasuredSubsGained && prevTotals.hasMeasuredSubsLost
        ? (prevTotals.subscribersGainedSum ?? 0n) -
          (prevTotals.subscribersLostSum ?? 0n)
        : null;

    const overview: DashboardOverviewData = {
      views: this.computeBigIntComparison(curTotals.viewsSum, prevTotals.viewsSum),
      estimatedMinutesWatched: this.computeBigIntComparison(
        curTotals.estimatedMinutesWatchedSum,
        prevTotals.estimatedMinutesWatchedSum
      ),
      averageViewDurationSeconds: this.computeNumberComparison(
        curAvgDuration,
        prevAvgDuration
      ),
      averageViewPercentage: this.computeNumberComparison(curAvgPct, prevAvgPct),
      likes: this.computeBigIntComparison(curTotals.likesSum, prevTotals.likesSum),
      comments: this.computeBigIntComparison(curTotals.commentsSum, prevTotals.commentsSum),
      shares: this.computeBigIntComparison(curTotals.sharesSum, prevTotals.sharesSum),
      subscribersGained: this.computeBigIntComparison(
        curTotals.subscribersGainedSum,
        prevTotals.subscribersGainedSum
      ),
      subscribersLost: this.computeBigIntComparison(
        curTotals.subscribersLostSum,
        prevTotals.subscribersLostSum
      ),
      netSubscribers: this.computeBigIntComparison(curNetSubs, prevNetSubs),
      engagementRate: this.computeNumberComparison(curEngRate, prevEngRate),
      lifetimeStats: lifetime,
    };

    // Format Trends
    const series: DailyTrendPoint[] = dailyObservations.map((obs) => ({
      date: obs.observationDate
        ? this.formatDateUTC(obs.observationDate)
        : obs.startDate.toISOString().substring(0, 10),
      views: obs.views !== null ? obs.views.toString() : null,
      estimatedMinutesWatched:
        obs.estimatedMinutesWatched !== null
          ? obs.estimatedMinutesWatched.toString()
          : null,
      averageViewDuration: obs.averageViewDuration,
      likes: obs.likes !== null ? obs.likes.toString() : null,
      comments: obs.comments !== null ? obs.comments.toString() : null,
      shares: obs.shares !== null ? obs.shares.toString() : null,
      subscribersGained:
        obs.subscribersGained !== null ? obs.subscribersGained.toString() : null,
      subscribersLost:
        obs.subscribersLost !== null ? obs.subscribersLost.toString() : null,
      engagementRate: this.calculateEngagementRate(
        obs.views,
        obs.likes,
        obs.comments,
        obs.shares
      ),
    }));

    // Format Top Videos
    const topVideos: TopVideoItem[] = topResult.items.map((item, idx) => ({
      videoId: item.videoId,
      title: item.title,
      description: item.description,
      publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
      externalUrl: item.externalUrl,
      rank: idx + 1,
      metrics: {
        views: item.views !== null ? item.views.toString() : null,
        estimatedMinutesWatched:
          item.estimatedMinutesWatched !== null
            ? item.estimatedMinutesWatched.toString()
            : null,
        averageViewDuration: item.averageViewDuration,
        averageViewPercentage: item.averageViewPercentage
          ? item.averageViewPercentage.toNumber()
          : null,
        likes: item.likes !== null ? item.likes.toString() : null,
        comments: item.comments !== null ? item.comments.toString() : null,
        shares: item.shares !== null ? item.shares.toString() : null,
        subscribersGained:
          item.subscribersGained !== null
            ? item.subscribersGained.toString()
            : null,
        engagementRate: item.engagementRate
          ? item.engagementRate.toNumber()
          : this.calculateEngagementRate(
              item.views,
              item.likes,
              item.comments,
              item.shares
            ),
      },
    }));

    const dataAvailability: DataAvailabilityState =
      curTotals.count > 0 ? "COMPLETE" : "NO_DATA";

    return {
      data: {
        overview,
        trends: { series },
        topVideos: {
          videos: topVideos,
          pagination: {
            total: topResult.total,
            limit: 5,
            offset: 0,
            hasMore: topResult.total > 5,
          },
        },
      },
      meta: {
        workspaceId,
        socialAccountId: account.id,
        platform: "YOUTUBE",
        period: {
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          days: dateRange.days,
        },
        comparison: {
          startDate: dateRange.prevStartDateStr,
          endDate: dateRange.prevEndDateStr,
          days: dateRange.days,
        },
        dataAvailability,
        freshness,
      },
    };
  }
}

export const youtubeDashboardService = new YouTubeDashboardService();
