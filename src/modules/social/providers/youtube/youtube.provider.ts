import {
  SocialProvider,
  PlatformCapabilities,
  TokenBundle,
  NormalizedSocialAccount,
  NormalizedContent,
  NormalizedMetrics,
  PaginatedResult,
} from "../../types";
import { PLATFORM_BASELINE_CAPABILITIES } from "../../registry";
import { YouTubeOAuthClient } from "./youtube.oauth";
import { YouTubeDataApiClient } from "./youtube.data-api";
import { YouTubeAnalyticsApiClient } from "./youtube.analytics-api";
import { YouTubeAnalyticsReportPlanner } from "./youtube.analytics-planner";
import { YouTubeAnalyticsMapper } from "./youtube.analytics-mapper";
import { YouTubeMapper } from "./youtube.mapper";
import { SocialError } from "../../errors";

export class YouTubeSocialProvider implements SocialProvider {
  readonly platformCode = "YOUTUBE" as const;
  readonly platformName = "YouTube";

  readonly oauthClient: YouTubeOAuthClient;
  readonly dataApiClient: YouTubeDataApiClient;
  readonly analyticsApiClient: YouTubeAnalyticsApiClient;
  readonly analyticsPlanner: YouTubeAnalyticsReportPlanner;
  readonly analyticsMapper: typeof YouTubeAnalyticsMapper;

  constructor(
    oauthClient: YouTubeOAuthClient = new YouTubeOAuthClient(),
    dataApiClient: YouTubeDataApiClient = new YouTubeDataApiClient(),
    analyticsApiClient: YouTubeAnalyticsApiClient = new YouTubeAnalyticsApiClient(),
    analyticsPlanner: YouTubeAnalyticsReportPlanner = new YouTubeAnalyticsReportPlanner()
  ) {
    this.oauthClient = oauthClient;
    this.dataApiClient = dataApiClient;
    this.analyticsApiClient = analyticsApiClient;
    this.analyticsPlanner = analyticsPlanner;
    this.analyticsMapper = YouTubeAnalyticsMapper;
  }

  getCapabilities(): PlatformCapabilities {
    return { ...PLATFORM_BASELINE_CAPABILITIES.YOUTUBE };
  }

  async getAuthorizationUrl(params: {
    state: string;
    redirectUri: string;
    codeChallenge?: string;
    scopes?: string[];
  }): Promise<string> {
    return this.oauthClient.getAuthorizationUrl(params);
  }

  async exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<TokenBundle> {
    return this.oauthClient.exchangeAuthorizationCode(params);
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
    return this.oauthClient.refreshAccessToken(refreshToken);
  }

  async revokeAccess(token: string): Promise<boolean> {
    return this.oauthClient.revokeAccess(token);
  }

  async getAccountProfile(accessToken: string): Promise<NormalizedSocialAccount> {
    const channel = await this.dataApiClient.getAuthenticatedChannel(accessToken);
    return YouTubeMapper.mapChannelToNormalizedAccount(channel);
  }

  /**
   * Lists uploaded content items for the channel using quota-efficient uploads playlist traversal (Phase 3.2).
   */
  async listContent(params: {
    accessToken: string;
    externalAccountId: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedResult<NormalizedContent>> {
    // 1. Fetch channel to obtain uploads playlist ID
    const channel = await this.dataApiClient.getAuthenticatedChannel(params.accessToken);
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      return { items: [], hasMore: false };
    }

    // 2. Fetch page of playlist items (up to 50)
    const playlistResponse = await this.dataApiClient.getUploadsPlaylistItems(
      params.accessToken,
      uploadsPlaylistId,
      params.cursor,
      params.limit || 50
    );

    const rawItems = playlistResponse.items || [];
    const videoIds = rawItems
      .map((item) => item.contentDetails?.videoId || item.snippet.resourceId?.videoId)
      .filter((id): id is string => Boolean(id));

    if (videoIds.length === 0) {
      return {
        items: [],
        nextCursor: playlistResponse.nextPageToken || null,
        hasMore: Boolean(playlistResponse.nextPageToken),
        totalCount: playlistResponse.pageInfo?.totalResults,
      };
    }

    // 3. Batch fetch video details & statistics (1 quota unit for up to 50 videos)
    const videos = await this.dataApiClient.getVideosBatch(params.accessToken, videoIds);
    const normalizedItems = videos.map((v) => YouTubeMapper.mapVideoToNormalizedContent(v));

    return {
      items: normalizedItems,
      nextCursor: playlistResponse.nextPageToken || null,
      hasMore: Boolean(playlistResponse.nextPageToken),
      totalCount: playlistResponse.pageInfo?.totalResults,
    };
  }

  /**
   * Retrieves latest metric snapshot for a single video.
   */
  async getContentMetrics(params: {
    accessToken: string;
    externalContentId: string;
  }): Promise<NormalizedMetrics> {
    const videos = await this.dataApiClient.getVideosBatch(params.accessToken, [params.externalContentId]);
    if (videos.length === 0) {
      throw new SocialError(`YouTube video not found: ${params.externalContentId}`, "SOCIAL_ACCOUNT_RESTRICTED", {
        provider: "YOUTUBE",
        statusCode: 404,
      });
    }

    return YouTubeMapper.mapVideoToNormalizedMetrics(videos[0]);
  }
}

export const youtubeSocialProvider = new YouTubeSocialProvider();
