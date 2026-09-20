export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export interface YouTubeThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YouTubeThumbnailsCollection {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
  standard?: YouTubeThumbnail;
  maxres?: YouTubeThumbnail;
}

// -----------------------------------------------------------------------------
// Channel Types
// -----------------------------------------------------------------------------

export interface YouTubeChannelSnippet {
  title: string;
  description?: string;
  customUrl?: string;
  publishedAt?: string;
  thumbnails?: YouTubeThumbnailsCollection;
  country?: string;
}

export interface YouTubeChannelContentDetails {
  relatedPlaylists?: {
    likes?: string;
    uploads?: string;
  };
}

export interface YouTubeChannelStatistics {
  viewCount?: string;
  subscriberCount?: string;
  hiddenSubscriberCount?: boolean;
  videoCount?: string;
}

export interface YouTubeChannelStatus {
  privacyStatus?: string;
  isLinked?: boolean;
  longUploadsStatus?: string;
  madeForKids?: boolean;
}

export interface YouTubeChannelResource {
  kind: string;
  etag?: string;
  id: string; // Canonical Channel ID (UC...)
  snippet: YouTubeChannelSnippet;
  contentDetails?: YouTubeChannelContentDetails;
  statistics?: YouTubeChannelStatistics;
  status?: YouTubeChannelStatus;
}

export interface YouTubeChannelListResponse {
  kind: string;
  etag?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
  items?: YouTubeChannelResource[];
  error?: {
    code: number;
    message: string;
    errors?: Array<{
      message: string;
      domain: string;
      reason: string;
    }>;
  };
}

// -----------------------------------------------------------------------------
// Playlist Item Types (for Uploads Playlist Discovery)
// -----------------------------------------------------------------------------

export interface YouTubePlaylistItemSnippet {
  publishedAt?: string;
  channelId?: string;
  title: string;
  description?: string;
  thumbnails?: YouTubeThumbnailsCollection;
  channelTitle?: string;
  playlistId: string;
  position?: number;
  resourceId?: {
    kind: string;
    videoId: string;
  };
}

export interface YouTubePlaylistItemContentDetails {
  videoId: string;
  startAt?: string;
  endAt?: string;
  note?: string;
  videoPublishedAt?: string;
}

export interface YouTubePlaylistItemStatus {
  privacyStatus?: string;
}

export interface YouTubePlaylistItemResource {
  kind: string;
  etag?: string;
  id: string;
  snippet: YouTubePlaylistItemSnippet;
  contentDetails?: YouTubePlaylistItemContentDetails;
  status?: YouTubePlaylistItemStatus;
}

export interface YouTubePlaylistItemListResponse {
  kind: string;
  etag?: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
  items?: YouTubePlaylistItemResource[];
  error?: {
    code: number;
    message: string;
    errors?: Array<{
      message: string;
      domain: string;
      reason: string;
    }>;
  };
}

// -----------------------------------------------------------------------------
// Video Resource Types (videos.list)
// -----------------------------------------------------------------------------

export interface YouTubeVideoSnippet {
  publishedAt: string;
  channelId: string;
  title: string;
  description: string;
  thumbnails?: YouTubeThumbnailsCollection;
  channelTitle?: string;
  tags?: string[];
  categoryId?: string;
  liveBroadcastContent?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
}

export interface YouTubeVideoContentDetails {
  duration: string; // ISO 8601 duration e.g. "PT15M33S"
  dimension?: string; // "2d" | "3d"
  definition?: string; // "hd" | "sd"
  caption?: string; // "true" | "false"
  licensedContent?: boolean;
  projection?: string;
}

export interface YouTubeVideoStatus {
  uploadStatus?: string; // "uploaded" | "processed" | "failed" | "rejected" | "deleted"
  privacyStatus?: string; // "public" | "unlisted" | "private"
  license?: string; // "youtube" | "creativeCommon"
  embeddable?: boolean;
  publicStatsViewable?: boolean;
  madeForKids?: boolean;
  selfDeclaredMadeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  publishAt?: string;
}

// -----------------------------------------------------------------------------
// Video Update Contracts (videos.update - Zero `any` boundary)
// -----------------------------------------------------------------------------

export interface YouTubeVideoUpdateSnippet {
  title: string;
  categoryId: string;
  description?: string;
  tags?: string[];
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
}

export interface YouTubeVideoUpdateStatus {
  privacyStatus?: string;
  publishAt?: string;
  selfDeclaredMadeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  embeddable?: boolean;
  license?: string;
  publicStatsViewable?: boolean;
}

export interface YouTubeVideoUpdateResource {
  id: string;
  snippet?: YouTubeVideoUpdateSnippet;
  status?: YouTubeVideoUpdateStatus;
}

export interface YouTubeVideoStatistics {
  viewCount?: string;
  likeCount?: string;
  dislikeCount?: string;
  favoriteCount?: string;
  commentCount?: string;
}

export interface YouTubeVideoResource {
  kind: string;
  etag?: string;
  id: string; // Video ID e.g. "dQw4w9WgXcQ"
  snippet: YouTubeVideoSnippet;
  contentDetails?: YouTubeVideoContentDetails;
  status?: YouTubeVideoStatus;
  statistics?: YouTubeVideoStatistics;
}

export interface YouTubeVideoListResponse {
  kind: string;
  etag?: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
  items?: YouTubeVideoResource[];
  error?: {
    code: number;
    message: string;
    errors?: Array<{
      message: string;
      domain: string;
      reason: string;
    }>;
  };
}

// -----------------------------------------------------------------------------
// YouTube Content Classification & Platform Metadata Types (Phase 3.4C)
// -----------------------------------------------------------------------------

export type YouTubeContentType = "LONG_FORM" | "SHORTS" | "LIVE_STREAM" | "UNKNOWN";
export type ClassificationSource = "AUTHORITATIVE" | "HEURISTIC" | "UNRESOLVED";
export type ClassificationConfidence = "HIGH" | "MODERATE" | "LOW";

export interface ClassificationResult {
  contentType: YouTubeContentType;
  classificationSource: ClassificationSource;
  classificationConfidence: ClassificationConfidence;
  rationale: string;
}

export interface ClassificationConfig {
  maxShortsDurationSeconds?: number;
  legacyShortsDurationSeconds?: number;
  shortsExpansionDate?: Date;
}

export interface YouTubeVideoMetadata {
  channelId: string;
  channelTitle: string;
  tags: string[];
  categoryId: string;
  durationSeconds: number | null;
  durationISO: string;
  contentType: YouTubeContentType;
  classificationSource: ClassificationSource;
  classificationConfidence: ClassificationConfidence;
  classificationRationale: string;
  dimension: string;
  definition: string;
  caption: boolean;
  licensedContent: boolean;
  privacyStatus: string;
  uploadStatus: string;
  license: string;
  embeddable: boolean;
  madeForKids: boolean;
  publishAt?: string;
  thumbnails: {
    default?: string;
    medium?: string;
    high?: string;
    standard?: string;
    maxres?: string;
  };
  liveBroadcastContent?: string;
  actualStartTime?: string;
  actualEndTime?: string;
}

// -----------------------------------------------------------------------------
// YouTube Analytics API v2 Types (reports.query)
// -----------------------------------------------------------------------------

export interface YouTubeAnalyticsColumnHeader {
  name: string;
  columnType: "DIMENSION" | "METRIC" | "HEADER" | string;
  dataType: "STRING" | "INTEGER" | "FLOAT" | string;
}

export interface YouTubeAnalyticsResultTable {
  kind: string;
  columnHeaders: YouTubeAnalyticsColumnHeader[];
  rows: Array<Array<string | number | null>>;
  error?: {
    code: number;
    message: string;
    errors?: Array<{
      message: string;
      domain: string;
      reason: string;
    }>;
  };
}

export interface YouTubeAnalyticsQueryOptions {
  ids: string; // e.g. "channel==MINE" or "channel==UC..."
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  metrics: string[] | string;
  dimensions?: string[] | string;
  filters?: string;
  sort?: string[] | string;
  maxResults?: number;
  startIndex?: number;
  includeHistoricalChannelData?: boolean;
}

export interface YouTubeAnalyticsRetryConfig {
  maxRetries?: number; // Default: 3
  initialDelayMs?: number; // Default: 500ms
  maxDelayMs?: number; // Default: 4000ms
  timeoutMs?: number; // Default: 15000ms
}

export * from "./youtube.analytics.types";

