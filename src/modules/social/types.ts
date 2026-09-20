import { SocialAccountStatus } from "@prisma/client";

export type PlatformCode = "YOUTUBE" | "TIKTOK" | "INSTAGRAM";

export interface PlatformCapabilities {
  // Read / Insights capabilities
  canReadProfile: boolean;
  canReadContent: boolean;
  canReadContentMetrics: boolean;
  canReadAccountMetrics: boolean;
  canReadAudienceMetrics: boolean;
  canReadComments: boolean;

  // Publishing / Write capabilities
  canPublishVideo: boolean;
  canPublishPhoto: boolean;
  canPublishCarousel: boolean;
  canSchedulePublish: boolean;
  canManageComments: boolean;
  canManageMessages: boolean;

  // Publishing / Content Upload Capabilities (Phase 3.4F)
  canUploadContent?: boolean;
  canPublishContent?: boolean;
  canUploadThumbnail?: boolean;

  // Granular Content Write Capabilities (Phase 3.4D)
  canUpdateContentMetadata?: boolean;
  canUpdateContentPrivacy?: boolean;
  canScheduleContentPublish?: boolean;
  canUpdateKidsSettings?: boolean;
  canUpdateSyntheticMedia?: boolean;

  // Playlist & Comment Capabilities (Phase 3.4E)
  canViewPlaylists?: boolean;
  canCreatePlaylist?: boolean;
  canUpdatePlaylist?: boolean;
  canDeletePlaylist?: boolean;
  canManagePlaylistItems?: boolean;

  canViewComments?: boolean;
  canCreateComment?: boolean;
  canReplyToComment?: boolean;
  canEditOwnComment?: boolean;
  canDeleteOwnComment?: boolean;
  canModerateComments?: boolean;

  // Metadata & Constraints
  maxVideoDurationSeconds?: number;
  supportedVideoFormats?: string[];
  supportedPhotoFormats?: string[];
  maxDailyPosts?: number;
  requiresMediaPublicUrl?: boolean;
  requiresCreatorAudit?: boolean;
}

export interface TokenBundle {
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scopes?: string[] | string | null;
  tokenType?: string;
  rawResponse?: Record<string, unknown>;
}

export interface NormalizedSocialAccount {
  externalAccountId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  isVerified?: boolean;
  followersCount?: number | bigint | null;
  followingCount?: number | bigint | null;
  totalPosts?: number | bigint | null;
  rawMetadata?: Record<string, unknown>;
}

export interface NormalizedMetrics {
  views: number | bigint | null;
  likes: number | bigint | null;
  comments: number | bigint | null;
  shares: number | bigint | null;
  saves: number | bigint | null;
  followersGained: number | bigint | null;
  engagementRate?: number | null;
  capturedAt: Date;
}

export interface NormalizedContent {
  externalContentId: string;
  title: string;
  description?: string | null;
  caption?: string | null;
  externalUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaType: "VIDEO" | "PHOTO" | "CAROUSEL" | "REEL" | "SHORT";
  durationSeconds?: number | null;
  publishedAt: Date;
  metrics?: NormalizedMetrics;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
  totalCount?: number;
}

/**
 * Public sanitized representation of a connected social account.
 * NEVER includes decrypted access tokens, refresh tokens, or secrets.
 */
export interface SanitizedSocialAccount {
  id: string;
  workspaceId: string;
  platformCode: PlatformCode;
  platformName: string;
  externalAccountId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: SocialAccountStatus;
  scopes: string[] | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  capabilities: PlatformCapabilities;
}

/**
 * Canonical Social Provider Adapter Contract.
 * Every provider module implements this contract.
 */
export interface SocialProvider {
  readonly platformCode: PlatformCode;
  readonly platformName: string;

  /**
   * Returns the static or dynamic capabilities supported by this provider.
   */
  getCapabilities(): PlatformCapabilities;

  /**
   * Generates the official provider OAuth 2.0 authorization URL.
   */
  getAuthorizationUrl(params: {
    state: string;
    redirectUri: string;
    codeChallenge?: string;
    scopes?: string[];
  }): Promise<string>;

  /**
   * Exchanges an authorization code for an encrypted TokenBundle.
   */
  exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<TokenBundle>;

  /**
   * Refreshes an expired access token using the stored refresh token.
   */
  refreshAccessToken(refreshToken: string): Promise<TokenBundle>;

  /**
   * Revokes user access token / application authorization on the provider.
   */
  revokeAccess?(token: string): Promise<boolean>;

  /**
   * Fetches the current authenticated account profile from the provider.
   */
  getAccountProfile(accessToken: string): Promise<NormalizedSocialAccount>;

  /**
   * Lists published content items from the provider.
   */
  listContent?(params: {
    accessToken: string;
    externalAccountId: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedResult<NormalizedContent>>;

  /**
   * Fetches the latest metrics for a specific content item.
   */
  getContentMetrics?(params: {
    accessToken: string;
    externalContentId: string;
  }): Promise<NormalizedMetrics>;
}

// -----------------------------------------------------------------------------
// Generic Analytics Observation Models (Phase 3.3B)
// -----------------------------------------------------------------------------

export type MetricGranularity = "DAILY" | "AGGREGATED";

export type MetricSource =
  | "DATA_API"
  | "ANALYTICS_API"
  | "REPORTING_API"
  | "ESTIMATED";

export type MetricValue = bigint | number | string | null;

/**
 * Normalized provider-agnostic analytics observation model.
 * Represents an individual multi-dimensional observation or time-series data point.
 */
export interface AnalyticsObservation {
  /** Canonical deterministic identity key for natural deduplication and idempotency */
  identityKey: string;
  /** Social platform code (e.g. "YOUTUBE", "TIKTOK", "INSTAGRAM") */
  provider: PlatformCode;
  /** Telemetry origin source (e.g. "ANALYTICS_API") */
  source: MetricSource;
  /** Internal Plottershub SocialAccount UUID if known */
  socialAccountId?: string;
  /** External platform Channel / Account ID (e.g. "UC...") if known */
  externalAccountId?: string;
  /** Product-level query pattern identifier (e.g. "CHANNEL_DAILY_OVERVIEW") */
  queryPattern: string;
  /** Observation temporal granularity ("DAILY" or "AGGREGATED") */
  granularity: MetricGranularity;
  /** Query interval start date (YYYY-MM-DD) */
  startDate: string;
  /** Query interval end date (YYYY-MM-DD) */
  endDate: string;
  /** Specific observation calendar day (YYYY-MM-DD) for DAILY granularity; null for AGGREGATED */
  observationDate?: string | null;
  /** Multi-dimensional attributes (e.g. { country: "ID", deviceType: "MOBILE" }, { video: "xyz" }) */
  dimensions?: Record<string, string | null>;
  /** Precision-preserving metric dictionary */
  metrics: Record<string, MetricValue>;
  /** Wall-clock timestamp when this observation was mapped */
  capturedAt: Date;
}
