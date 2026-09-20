import { PlatformCode, PlatformCapabilities, SocialProvider, TokenBundle, NormalizedSocialAccount } from "./types";
import { SocialError } from "./errors";

/**
 * Baseline capabilities matrix by platform (configured from 01-SOCIAL_API_CAPABILITIES.md).
 *
 * ARCHITECTURAL NOTE:
 * Capabilities are:
 * - Provider-specific and API-version dependent
 * - Account-type dependent (e.g., Creator vs Business vs Standard)
 * - Scope-dependent (runtime granted OAuth permissions)
 * - Subject to dynamic provider policy and rate limit variations
 *
 * These baseline definitions serve as initial structural defaults;
 * provider adapters refine them dynamically based on granted scopes and creator capabilities.
 */
export const PLATFORM_BASELINE_CAPABILITIES: Record<PlatformCode, PlatformCapabilities> = {
  YOUTUBE: {
    canReadProfile: true,
    canReadContent: true,
    canReadContentMetrics: true,
    canReadAccountMetrics: true,
    canReadAudienceMetrics: true,
    canReadComments: true,
    canPublishVideo: true,
    canPublishPhoto: false,
    canPublishCarousel: false,
    canSchedulePublish: true,
    canManageComments: true,
    canManageMessages: false,
    // Phase 3.4F Publishing & Upload
    canUploadContent: true,
    canPublishContent: true,
    canUploadThumbnail: true,
    canUpdateContentMetadata: true,
    canUpdateContentPrivacy: true,
    canScheduleContentPublish: true,
    canUpdateKidsSettings: true,
    canUpdateSyntheticMedia: true,
    // Phase 3.4E Playlist & Comments
    canViewPlaylists: true,
    canCreatePlaylist: true,
    canUpdatePlaylist: true,
    canDeletePlaylist: true,
    canManagePlaylistItems: true,
    canViewComments: true,
    canCreateComment: true,
    canReplyToComment: true,
    canEditOwnComment: true,
    canDeleteOwnComment: true,
    canModerateComments: true,
    maxVideoDurationSeconds: 43200, // 12 hours
    supportedVideoFormats: ["mp4", "mov", "avi", "wmv", "flv", "webm"],
    requiresMediaPublicUrl: false, // Direct resumable upload supported
    requiresCreatorAudit: true,
  },
  TIKTOK: {
    canReadProfile: true,
    canReadContent: true,
    canReadContentMetrics: true,
    canReadAccountMetrics: true,
    canReadAudienceMetrics: false,
    canReadComments: true,
    canPublishVideo: true,
    canPublishPhoto: true,
    canPublishCarousel: true,
    canSchedulePublish: false, // Application-controlled scheduling
    canManageComments: false,
    canManageMessages: false,
    canViewPlaylists: false,
    canCreatePlaylist: false,
    canUpdatePlaylist: false,
    canDeletePlaylist: false,
    canManagePlaylistItems: false,
    canViewComments: true,
    canCreateComment: false,
    canReplyToComment: false,
    canEditOwnComment: false,
    canDeleteOwnComment: false,
    canModerateComments: false,
    maxVideoDurationSeconds: 600, // 10 mins (creator tier dependent)
    supportedVideoFormats: ["mp4", "mov", "webm"],
    supportedPhotoFormats: ["jpeg", "jpg", "webp"],
    maxDailyPosts: 100,
    requiresMediaPublicUrl: true,
    requiresCreatorAudit: true,
  },
  INSTAGRAM: {
    canReadProfile: true,
    canReadContent: true,
    canReadContentMetrics: true,
    canReadAccountMetrics: true,
    canReadAudienceMetrics: true,
    canReadComments: true,
    canPublishVideo: true,
    canPublishPhoto: true,
    canPublishCarousel: true,
    canSchedulePublish: false, // Application-controlled scheduling
    canManageComments: true,
    canManageMessages: true,
    canViewPlaylists: false,
    canCreatePlaylist: false,
    canUpdatePlaylist: false,
    canDeletePlaylist: false,
    canManagePlaylistItems: false,
    canViewComments: true,
    canCreateComment: true,
    canReplyToComment: true,
    canEditOwnComment: false,
    canDeleteOwnComment: true,
    canModerateComments: false,
    maxVideoDurationSeconds: 900, // 15 mins for Reels
    supportedVideoFormats: ["mp4", "mov"],
    supportedPhotoFormats: ["jpeg", "jpg"],
    maxDailyPosts: 50,
    requiresMediaPublicUrl: true,
    requiresCreatorAudit: false, // Requires Meta App Review for Advanced Access
  },
};

// Backwards compatibility alias
export const PLATFORM_BASE_CAPABILITIES = PLATFORM_BASELINE_CAPABILITIES;

/**
 * Foundational / Placeholder Provider Implementation for Phase 2 Framework.
 * Concrete API clients are injected in Phase 3 (YouTube) and Phase 7 (TikTok/Instagram).
 */
export class BaseSocialProvider implements SocialProvider {
  readonly platformCode: PlatformCode;
  readonly platformName: string;
  protected capabilities: PlatformCapabilities;

  constructor(platformCode: PlatformCode, platformName: string, capabilities?: PlatformCapabilities) {
    this.platformCode = platformCode;
    this.platformName = platformName;
    this.capabilities = capabilities ?? PLATFORM_BASELINE_CAPABILITIES[platformCode];
  }

  getCapabilities(): PlatformCapabilities {
    return { ...this.capabilities };
  }

  async getAuthorizationUrl(params: {
    state: string;
    redirectUri: string;
    codeChallenge?: string;
    scopes?: string[];
  }): Promise<string> {
    const scopesStr = (params.scopes || []).join(" ");
    return `https://auth.placeholder.local/${this.platformCode.toLowerCase()}?state=${encodeURIComponent(
      params.state
    )}&redirect_uri=${encodeURIComponent(params.redirectUri)}&scope=${encodeURIComponent(scopesStr)}`;
  }

  async exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<TokenBundle> {
    if (!params.code) {
      throw new SocialError("Authorization code is required.", "SOCIAL_INVALID_REQUEST", {
        provider: this.platformCode,
      });
    }

    // Framework simulation bundle
    return {
      accessToken: `mock_access_token_${this.platformCode.toLowerCase()}_${Date.now()}`,
      refreshToken: `mock_refresh_token_${this.platformCode.toLowerCase()}_${Date.now()}`,
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30 days
      scopes: ["profile", "read", "publish"],
      tokenType: "Bearer",
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
    if (!refreshToken) {
      throw new SocialError("Refresh token is required.", "SOCIAL_TOKEN_REVOKED", {
        provider: this.platformCode,
        userActionRequired: true,
      });
    }

    return {
      accessToken: `mock_refreshed_access_token_${this.platformCode.toLowerCase()}_${Date.now()}`,
      refreshToken: refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      scopes: ["profile", "read", "publish"],
    };
  }

  async revokeAccess(_token: string): Promise<boolean> {
    return true;
  }

  async getAccountProfile(_accessToken: string): Promise<NormalizedSocialAccount> {
    return {
      externalAccountId: `mock_ext_id_${this.platformCode.toLowerCase()}`,
      username: `creator_${this.platformCode.toLowerCase()}`,
      displayName: `${this.platformName} Creator`,
      avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100`,
      followersCount: 15400n,
      followingCount: 320n,
      totalPosts: 48n,
    };
  }
}

import { youtubeSocialProvider } from "./providers/youtube/youtube.provider";

/**
 * Provider Registry & Factory
 */
export class SocialProviderRegistry {
  private static providers: Map<PlatformCode, SocialProvider> = new Map<PlatformCode, SocialProvider>([
    ["YOUTUBE", youtubeSocialProvider],
    ["TIKTOK", new BaseSocialProvider("TIKTOK", "TikTok")],
    ["INSTAGRAM", new BaseSocialProvider("INSTAGRAM", "Instagram")],
  ]);

  /**
   * Registers or overrides a provider adapter (useful for mocks in test environments).
   */
  static registerProvider(platform: PlatformCode, provider: SocialProvider): void {
    this.providers.set(platform, provider);
  }

  /**
   * Retrieves the registered provider adapter for a platform code.
   */
  static getProvider(platform: PlatformCode | string): SocialProvider {
    const normalized = platform.toUpperCase() as PlatformCode;
    const provider = this.providers.get(normalized);
    if (!provider) {
      throw new SocialError(
        `No social provider adapter registered for platform: '${platform}'.`,
        "SOCIAL_UNSUPPORTED_OPERATION"
      );
    }
    return provider;
  }

  /**
   * Lists all registered platform codes.
   */
  static getSupportedPlatforms(): PlatformCode[] {
    return Array.from(this.providers.keys());
  }
}
