import {
  MetricGranularity,
  MetricSource,
  PlatformCode,
} from "../../types";
import { YouTubeAnalyticsQueryOptions } from "./youtube.types";

/**
 * Verified product-level YouTube Analytics Query Patterns.
 * All patterns map to GET https://youtubeanalytics.googleapis.com/v2/reports (reports.query).
 */
export type YouTubeAnalyticsQueryPattern =
  | "CHANNEL_DAILY_OVERVIEW"
  | "TOP_VIDEOS_PERFORMANCE"
  | "VIDEO_DAILY_TIME_SERIES"
  | "VIEWER_DEMOGRAPHICS"
  | "GEOGRAPHIC_DISTRIBUTION"
  | "TRAFFIC_SOURCE_DISTRIBUTION"
  | "DEVICE_DISTRIBUTION";

export type LagPolicy = "CLAMP" | "REJECT";

export interface YouTubeQueryPatternDefinition {
  readonly pattern: YouTubeAnalyticsQueryPattern;
  readonly description: string;
  readonly granularity: MetricGranularity;
  readonly allowedMetrics: readonly string[];
  readonly defaultMetrics: readonly string[];
  readonly allowedDimensions: readonly string[];
  readonly defaultDimensions: readonly string[];
  readonly defaultSort?: readonly string[];
  readonly allowedFilters?: readonly string[];
  readonly requiresFilter?: readonly string[];
  readonly maxResultsLimit?: number;
  readonly defaultMaxResults?: number;
}

/**
 * Official YouTube Analytics API v2 Query Pattern Definitions.
 * Based on Google developer documentation and verified channel reports.
 */
export const YOUTUBE_QUERY_PATTERN_DEFINITIONS: Record<
  YouTubeAnalyticsQueryPattern,
  YouTubeQueryPatternDefinition
> = {
  CHANNEL_DAILY_OVERVIEW: {
    pattern: "CHANNEL_DAILY_OVERVIEW",
    description: "Channel-level daily performance time series",
    granularity: "DAILY",
    allowedMetrics: [
      "views",
      "estimatedMinutesWatched",
      "averageViewDuration",
      "likes",
      "comments",
      "shares",
      "subscribersGained",
      "subscribersLost",
    ],
    defaultMetrics: [
      "views",
      "estimatedMinutesWatched",
      "averageViewDuration",
      "likes",
      "comments",
      "shares",
      "subscribersGained",
      "subscribersLost",
    ],
    allowedDimensions: ["day"],
    defaultDimensions: ["day"],
    defaultSort: ["day"],
    allowedFilters: [],
  },
  TOP_VIDEOS_PERFORMANCE: {
    pattern: "TOP_VIDEOS_PERFORMANCE",
    description: "Aggregated top video performance metrics",
    granularity: "AGGREGATED",
    allowedMetrics: [
      "views",
      "estimatedMinutesWatched",
      "averageViewDuration",
      "averageViewPercentage",
      "likes",
      "comments",
      "shares",
      "subscribersGained",
      "subscribersLost",
    ],
    defaultMetrics: [
      "views",
      "estimatedMinutesWatched",
      "averageViewDuration",
      "averageViewPercentage",
      "likes",
      "comments",
      "shares",
      "subscribersGained",
      "subscribersLost",
    ],
    allowedDimensions: ["video"],
    defaultDimensions: ["video"],
    defaultSort: ["-views"],
    allowedFilters: ["video"],
    maxResultsLimit: 200,
    defaultMaxResults: 200,
  },
  VIDEO_DAILY_TIME_SERIES: {
    pattern: "VIDEO_DAILY_TIME_SERIES",
    description: "Daily performance time series for a single specific video",
    granularity: "DAILY",
    allowedMetrics: [
      "views",
      "estimatedMinutesWatched",
      "averageViewDuration",
      "likes",
      "comments",
      "shares",
      "subscribersGained",
      "subscribersLost",
    ],
    defaultMetrics: [
      "views",
      "estimatedMinutesWatched",
      "averageViewDuration",
      "likes",
      "comments",
      "shares",
      "subscribersGained",
      "subscribersLost",
    ],
    allowedDimensions: ["day"],
    defaultDimensions: ["day"],
    defaultSort: ["day"],
    allowedFilters: ["video"],
    requiresFilter: ["video"],
  },
  VIEWER_DEMOGRAPHICS: {
    pattern: "VIEWER_DEMOGRAPHICS",
    description: "Audience demographic distribution (age group and gender)",
    granularity: "AGGREGATED",
    allowedMetrics: ["viewerPercentage"],
    defaultMetrics: ["viewerPercentage"],
    allowedDimensions: ["ageGroup", "gender"],
    defaultDimensions: ["ageGroup", "gender"],
    defaultSort: ["gender", "ageGroup"],
    allowedFilters: ["video", "country"],
  },
  GEOGRAPHIC_DISTRIBUTION: {
    pattern: "GEOGRAPHIC_DISTRIBUTION",
    description: "Geographic audience distribution by country",
    granularity: "AGGREGATED",
    allowedMetrics: [
      "views",
      "estimatedMinutesWatched",
      "averageViewDuration",
      "subscribersGained",
    ],
    defaultMetrics: [
      "views",
      "estimatedMinutesWatched",
      "averageViewDuration",
      "subscribersGained",
    ],
    allowedDimensions: ["country"],
    defaultDimensions: ["country"],
    defaultSort: ["-views"],
    allowedFilters: ["video"],
    maxResultsLimit: 200,
    defaultMaxResults: 50,
  },
  TRAFFIC_SOURCE_DISTRIBUTION: {
    pattern: "TRAFFIC_SOURCE_DISTRIBUTION",
    description: "Audience discovery breakdown by traffic source type",
    granularity: "AGGREGATED",
    allowedMetrics: ["views", "estimatedMinutesWatched"],
    defaultMetrics: ["views", "estimatedMinutesWatched"],
    allowedDimensions: ["insightTrafficSourceType"],
    defaultDimensions: ["insightTrafficSourceType"],
    defaultSort: ["-views"],
    allowedFilters: ["video"],
  },
  DEVICE_DISTRIBUTION: {
    pattern: "DEVICE_DISTRIBUTION",
    description: "Audience playback distribution by device type",
    granularity: "AGGREGATED",
    allowedMetrics: ["views", "estimatedMinutesWatched"],
    defaultMetrics: ["views", "estimatedMinutesWatched"],
    allowedDimensions: ["deviceType"],
    defaultDimensions: ["deviceType"],
    defaultSort: ["-views"],
    allowedFilters: ["video"],
  },
};

/**
 * Metrics that are either unsupported on YouTube Analytics reports.query
 * or deferred to the bulk YouTube Reporting API (Phase 4).
 */
export const YOUTUBE_DEFERRED_OR_UNSUPPORTED_METRICS: readonly string[] = [
  "impressions",
  "impressionClickThroughRate",
  "saves",
  "bookmarks",
];

export interface YouTubeAnalyticsPlanRequest {
  queryPattern: YouTubeAnalyticsQueryPattern;
  startDate: string; // ISO format: YYYY-MM-DD
  endDate: string; // ISO format: YYYY-MM-DD
  metrics?: string[] | string;
  dimensions?: string[] | string;
  filters?: Record<string, string> | string;
  sort?: string[] | string;
  maxResults?: number;
  startIndex?: number;
  ids?: string; // Default: "channel==MINE"
  includeHistoricalChannelData?: boolean;
  analyticsDataLagDays?: number; // Default: 2
  lagPolicy?: LagPolicy; // Default: "CLAMP"
  currentDate?: string | Date; // Injectable clock for deterministic tests
}

export interface YouTubeAnalyticsPlanResult {
  queryOptions: YouTubeAnalyticsQueryOptions;
  queryPattern: YouTubeAnalyticsQueryPattern;
  granularity: MetricGranularity;
  effectiveStartDate: string;
  effectiveEndDate: string;
  method: string; // "reports.query"
}

export interface ObservationMappingContext {
  queryPattern: string;
  granularity: MetricGranularity;
  startDate: string;
  endDate: string;
  provider?: PlatformCode;
  source?: MetricSource;
  socialAccountId?: string;
  externalAccountId?: string;
  capturedAt?: Date;
}
