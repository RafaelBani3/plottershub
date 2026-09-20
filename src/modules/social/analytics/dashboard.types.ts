import { Prisma } from "@prisma/client";

export type DataAvailabilityState =
  | "COMPLETE"
  | "PARTIAL_DATA"
  | "INSUFFICIENT_DATA"
  | "NO_DATA";

export type FreshnessStatus = "FRESH" | "STALE" | "NO_DATA";

export const ALLOWED_DASHBOARD_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
  "engagementRate",
] as const;

export type DashboardMetric = (typeof ALLOWED_DASHBOARD_METRICS)[number];

export const ALLOWED_TOP_VIDEO_SORT_FIELDS = [
  "views",
  "estimatedMinutesWatched",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "engagementRate",
] as const;

export type TopVideoSortField = (typeof ALLOWED_TOP_VIDEO_SORT_FIELDS)[number];

export const ALLOWED_SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof ALLOWED_SORT_ORDERS)[number];

export interface DashboardResponseMeta {
  workspaceId: string;
  socialAccountId: string;
  platform: "YOUTUBE";
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  comparison?: {
    startDate: string;
    endDate: string;
    days: number;
  };
  dataAvailability: DataAvailabilityState;
  freshness: {
    latestObservationDate: string | null;
    dataAsOf: string | null;
    analyticsDataLagDays: number;
    status: FreshnessStatus;
  };
}

export interface DashboardResponseEnvelope<T> {
  data: T;
  meta: DashboardResponseMeta;
}

export interface MetricComparison<T = number | string | null> {
  current: T;
  previous: T;
  delta: T;
  percentageChange: number | null;
}

export interface DashboardOverviewData {
  views: MetricComparison<string | null>;
  estimatedMinutesWatched: MetricComparison<string | null>;
  averageViewDurationSeconds: MetricComparison<number | null>;
  averageViewPercentage: MetricComparison<number | null>;
  likes: MetricComparison<string | null>;
  comments: MetricComparison<string | null>;
  shares: MetricComparison<string | null>;
  subscribersGained: MetricComparison<string | null>;
  subscribersLost: MetricComparison<string | null>;
  netSubscribers: MetricComparison<string | null>;
  engagementRate: MetricComparison<number | null>;
  lifetimeStats?: {
    totalSubscribers: string | null;
    totalViews: string | null;
    totalVideos: string | null;
  };
}

export interface DailyTrendPoint {
  date: string; // YYYY-MM-DD
  views: string | null;
  estimatedMinutesWatched: string | null;
  averageViewDuration: number | null;
  likes: string | null;
  comments: string | null;
  shares: string | null;
  subscribersGained: string | null;
  subscribersLost: string | null;
  engagementRate: number | null;
}

export interface DashboardTrendsData {
  series: DailyTrendPoint[];
}

export interface TopVideoItem {
  videoId: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  rank: number;
  metrics: {
    views: string | null;
    estimatedMinutesWatched: string | null;
    averageViewDuration: number | null;
    averageViewPercentage: number | null;
    likes: string | null;
    comments: string | null;
    shares: string | null;
    subscribersGained: string | null;
    engagementRate: number | null;
  };
}

export interface DashboardTopVideosData {
  videos: TopVideoItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface VideoDetailData {
  video: {
    videoId: string;
    title: string;
    description: string | null;
    publishedAt: string | null;
    externalUrl: string | null;
  };
  periodTotals: {
    views: string | null;
    estimatedMinutesWatched: string | null;
    averageViewDuration: number | null;
    averageViewPercentage: number | null;
    likes: string | null;
    comments: string | null;
    shares: string | null;
    subscribersGained: string | null;
    engagementRate: number | null;
  };
  dailySeries: DailyTrendPoint[];
}

export interface DemographicGroup {
  ageGroup: string;
  gender: "female" | "male" | "user_specified";
  viewerPercentage: number;
}

export interface DashboardAudienceData {
  demographics: DemographicGroup[];
  genderTotals: {
    male: number;
    female: number;
    userSpecified: number;
  };
  ageTotals: Record<string, number>;
}

export interface CountryDistributionItem {
  countryCode: string;
  countryName: string;
  views: string | null;
  estimatedMinutesWatched: string | null;
  subscribersGained: string | null;
  percentageShare: number | null;
}

export interface DashboardGeographyData {
  countries: CountryDistributionItem[];
  totalPeriodViews: string | null;
}

export interface TrafficSourceItem {
  sourceType: string;
  displayName: string;
  views: string | null;
  estimatedMinutesWatched: string | null;
  percentageShare: number | null;
}

export interface DashboardTrafficSourcesData {
  sources: TrafficSourceItem[];
}

export interface DeviceDistributionItem {
  deviceType: string;
  displayName: string;
  views: string | null;
  estimatedMinutesWatched: string | null;
  percentageShare: number | null;
}

export interface DashboardDevicesData {
  devices: DeviceDistributionItem[];
}

export interface DashboardSummaryData {
  overview: DashboardOverviewData;
  trends: DashboardTrendsData;
  topVideos: DashboardTopVideosData;
}

export interface AccountOption {
  id: string;
  externalAccountId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface OverviewDbTotals {
  count: number;
  hasMeasuredViews: boolean;
  viewsSum: bigint | null;
  hasMeasuredMinutes: boolean;
  estimatedMinutesWatchedSum: bigint | null;
  hasMeasuredLikes: boolean;
  likesSum: bigint | null;
  hasMeasuredComments: boolean;
  commentsSum: bigint | null;
  hasMeasuredShares: boolean;
  sharesSum: bigint | null;
  hasMeasuredSubsGained: boolean;
  subscribersGainedSum: bigint | null;
  hasMeasuredSubsLost: boolean;
  subscribersLostSum: bigint | null;
  averageViewPercentageSum: Prisma.Decimal | null;
  averageViewPercentageCount: number;
}

export interface TopVideoWithContent {
  videoId: string;
  title: string;
  description: string | null;
  publishedAt: Date | null;
  externalUrl: string | null;
  views: bigint | null;
  estimatedMinutesWatched: bigint | null;
  averageViewDuration: number | null;
  averageViewPercentage: Prisma.Decimal | null;
  likes: bigint | null;
  comments: bigint | null;
  shares: bigint | null;
  subscribersGained: bigint | null;
  engagementRate: Prisma.Decimal | null;
}
