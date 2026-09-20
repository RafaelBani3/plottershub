import {
  NormalizedSocialAccount,
  NormalizedContent,
  NormalizedMetrics,
} from "../../types";
import {
  YouTubeChannelResource,
  YouTubeVideoResource,
  ClassificationConfig,
  ClassificationResult,
  YouTubeVideoMetadata,
} from "./youtube.types";

export class YouTubeMapper {
  /**
   * Safely converts a raw numeric or string value to BigInt while preserving strict NULL vs 0 semantics.
   * If val is missing, undefined, null, or non-numeric -> returns null.
   * If val is "0" or 0 -> returns 0n.
   */
  static parseBigIntOrNull(val: string | number | bigint | undefined | null): bigint | null {
    if (val === undefined || val === null || val === "") {
      return null;
    }

    if (typeof val === "bigint") {
      return val;
    }

    if (typeof val === "number") {
      if (Number.isNaN(val) || !Number.isFinite(val)) {
        return null;
      }
      return BigInt(Math.floor(val));
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "" || !/^-?\d+$/.test(trimmed)) {
        return null;
      }
      try {
        return BigInt(trimmed);
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Parses an ISO 8601 duration string (e.g. "PT15M33S", "PT1H2M3S", "P1DT2H") into total seconds.
   */
  static parseISO8601Duration(durationStr?: string | null): number | null {
    if (!durationStr) return null;

    const regex = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
    const matches = durationStr.match(regex);

    if (!matches) return null;

    const days = parseInt(matches[1] || "0", 10);
    const hours = parseInt(matches[2] || "0", 10);
    const minutes = parseInt(matches[3] || "0", 10);
    const seconds = parseInt(matches[4] || "0", 10);

    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Maps YouTube Channel resource to NormalizedSocialAccount.
   * Uses Channel ID (UC...) as the canonical externalAccountId.
   */
  static mapChannelToNormalizedAccount(channel: YouTubeChannelResource): NormalizedSocialAccount {
    const customUrl = channel.snippet.customUrl;
    const cleanUsername = customUrl ? customUrl.replace(/^@/, "") : channel.snippet.title || channel.id;

    const avatarUrl =
      channel.snippet.thumbnails?.high?.url ||
      channel.snippet.thumbnails?.medium?.url ||
      channel.snippet.thumbnails?.default?.url ||
      null;

    const profileUrl = customUrl
      ? `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : `@${customUrl}`}`
      : `https://www.youtube.com/channel/${channel.id}`;

    const followersCount = YouTubeMapper.parseBigIntOrNull(channel.statistics?.subscriberCount);
    const totalPosts = YouTubeMapper.parseBigIntOrNull(channel.statistics?.videoCount);

    return {
      externalAccountId: channel.id,
      username: cleanUsername,
      displayName: channel.snippet.title || null,
      avatarUrl,
      profileUrl,
      isVerified: false,
      followersCount,
      totalPosts,
      rawMetadata: {
        channelId: channel.id,
        uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || null,
        customUrl: channel.snippet.customUrl || null,
        viewCount: channel.statistics?.viewCount || null,
        hiddenSubscriberCount: channel.statistics?.hiddenSubscriberCount || false,
        country: channel.snippet.country || null,
      },
    };
  }

  /**
   * Alias for mapChannelToNormalizedAccount.
   */
  static toNormalizedAccount = YouTubeMapper.mapChannelToNormalizedAccount;

  /**
   * Maps a YouTubeVideoResource into NormalizedContent with public statistics and duration.
   */
  static mapVideoToNormalizedContent(video: YouTubeVideoResource): NormalizedContent {
    const avatarUrl =
      video.snippet.thumbnails?.maxres?.url ||
      video.snippet.thumbnails?.high?.url ||
      video.snippet.thumbnails?.medium?.url ||
      video.snippet.thumbnails?.default?.url ||
      null;

    const durationSeconds = YouTubeMapper.parseISO8601Duration(video.contentDetails?.duration);

    return {
      externalContentId: video.id,
      title: video.snippet.title || "Untitled Video",
      description: video.snippet.description || null,
      caption: null,
      externalUrl: `https://www.youtube.com/watch?v=${video.id}`,
      thumbnailUrl: avatarUrl,
      mediaType: "VIDEO",
      durationSeconds,
      publishedAt: new Date(video.snippet.publishedAt),
      metrics: YouTubeMapper.mapVideoToNormalizedMetrics(video),
    };
  }

  /**
   * Extracts normalized public metric snapshots from a YouTubeVideoResource.
   * Strictly preserves NULL for unsupported metrics (shares, saves).
   */
  static mapVideoToNormalizedMetrics(video: YouTubeVideoResource, capturedAt: Date = new Date()): NormalizedMetrics {
    const views = YouTubeMapper.parseBigIntOrNull(video.statistics?.viewCount);
    const likes = YouTubeMapper.parseBigIntOrNull(video.statistics?.likeCount);
    const comments = YouTubeMapper.parseBigIntOrNull(video.statistics?.commentCount);

    let engagementRate: number | null = null;
    if (views && views > 0n && (likes !== null || comments !== null)) {
      const interactionCount = (likes || 0n) + (comments || 0n);
      engagementRate = Number((interactionCount * 10000n) / views) / 100;
    }

    return {
      views,
      likes,
      comments,
      shares: null, // YouTube Data API v3 does not expose public video share counters
      saves: null,  // YouTube Data API v3 does not expose public video bookmark/save counters
      followersGained: null, // Requires YouTube Analytics API (Phase 3.2+ / Phase 4)
      engagementRate,
      capturedAt,
    };
  }

  /**
   * Maps channel statistics from channels.list to initial AccountMetricSnapshot data.
   */
  static mapChannelToAccountMetrics(channel: YouTubeChannelResource, capturedAt: Date = new Date()) {
    return {
      capturedAt,
      followersCount: YouTubeMapper.parseBigIntOrNull(channel.statistics?.subscriberCount),
      totalVideos: YouTubeMapper.parseBigIntOrNull(channel.statistics?.videoCount),
      totalViews: YouTubeMapper.parseBigIntOrNull(channel.statistics?.viewCount),
      followingCount: null,
      totalLikes: null,
      subscribersGained: null,
      subscribersLost: null,
    };
  }

  /**
   * Extracts rich, provider-specific metadata for persistence in ContentPlatform.metadata (Phase 3.4C).
   */
  static mapVideoToPlatformMetadata(video: YouTubeVideoResource): YouTubeVideoMetadata {
    const classification = classifyYouTubeVideo(video);
    const durationSeconds = YouTubeMapper.parseISO8601Duration(video.contentDetails?.duration);

    return {
      channelId: video.snippet?.channelId || "",
      channelTitle: video.snippet?.channelTitle || "",
      tags: video.snippet?.tags || [],
      categoryId: video.snippet?.categoryId || "",
      durationSeconds,
      durationISO: video.contentDetails?.duration || "",
      contentType: classification.contentType,
      classificationSource: classification.classificationSource,
      classificationConfidence: classification.confidence,
      classificationRationale: classification.rationale,
      dimension: video.contentDetails?.dimension || "2d",
      definition: video.contentDetails?.definition || "hd",
      caption: video.contentDetails?.caption === "true",
      licensedContent: Boolean(video.contentDetails?.licensedContent),
      privacyStatus: video.status?.privacyStatus || "public",
      uploadStatus: video.status?.uploadStatus || "uploaded",
      license: video.status?.license || "youtube",
      embeddable: video.status?.embeddable ?? true,
      madeForKids: Boolean(video.status?.madeForKids),
      publishAt: video.status?.publishAt,
      thumbnails: {
        default: video.snippet?.thumbnails?.default?.url,
        medium: video.snippet?.thumbnails?.medium?.url,
        high: video.snippet?.thumbnails?.high?.url,
        standard: video.snippet?.thumbnails?.standard?.url,
        maxres: video.snippet?.thumbnails?.maxres?.url,
      },
      liveBroadcastContent: video.snippet?.liveBroadcastContent,
    };
  }
}

export const DEFAULT_CLASSIFICATION_CONFIG: Required<ClassificationConfig> = {
  maxShortsDurationSeconds: 180,
  legacyShortsDurationSeconds: 60,
  shortsExpansionDate: new Date("2024-10-15T00:00:00Z"),
};

/**
 * Classifies a YouTube video into LONG_FORM, SHORTS, LIVE_STREAM, or UNKNOWN.
 *
 * Rules:
 * - live or upcoming/premiere -> LIVE_STREAM (upcoming metadata does NOT create an unsupported new enum)
 * - >180 seconds -> LONG_FORM (Authoritative: HIGH)
 * - pre-Oct-15-2024 and >60 seconds -> LONG_FORM (Authoritative: HIGH)
 * - <=180 seconds with explicit #shorts signal in title/tags/description -> SHORTS (Heuristic: MODERATE)
 * - insufficient evidence (no aspect ratio, no #shorts signal) -> UNKNOWN (Unresolved: LOW)
 *
 * Never silently classifies uncertain videos.
 */
export function classifyYouTubeVideo(
  video: Partial<YouTubeVideoResource>,
  config: ClassificationConfig = {}
): ClassificationResult & { confidence: ClassificationResult["classificationConfidence"] } {
  const mergedConfig = { ...DEFAULT_CLASSIFICATION_CONFIG, ...config };
  const liveContent = video.snippet?.liveBroadcastContent;

  // 1. Live stream or upcoming premiere/broadcast -> LIVE_STREAM
  // Per requirement: upcoming/premiere metadata must NOT create an unsupported new enum!
  if (liveContent === "live" || liveContent === "upcoming") {
    return {
      contentType: "LIVE_STREAM",
      classificationSource: "AUTHORITATIVE",
      classificationConfidence: "HIGH",
      confidence: "HIGH",
      rationale: `snippet.liveBroadcastContent is ${liveContent}`,
    };
  }

  const durationSec = YouTubeMapper.parseISO8601Duration(video.contentDetails?.duration);
  const publishedAtStr = video.snippet?.publishedAt;
  const publishedAt = publishedAtStr ? new Date(publishedAtStr) : null;

  // Missing critical metadata (duration or publish date) -> UNKNOWN
  if (durationSec === null || !publishedAt || isNaN(publishedAt.getTime())) {
    return {
      contentType: "UNKNOWN",
      classificationSource: "UNRESOLVED",
      classificationConfidence: "LOW",
      confidence: "LOW",
      rationale: "Missing valid duration or publication date",
    };
  }

  // 2. Definitive Long-form (> 180 seconds under any YouTube policy)
  if (durationSec > mergedConfig.maxShortsDurationSeconds) {
    return {
      contentType: "LONG_FORM",
      classificationSource: "AUTHORITATIVE",
      classificationConfidence: "HIGH",
      confidence: "HIGH",
      rationale: `Duration (${durationSec}s) exceeds maximum Shorts threshold (${mergedConfig.maxShortsDurationSeconds}s)`,
    };
  }

  // 3. Pre-Expansion Definitive Long-form (> 60s published before Oct 15, 2024)
  if (publishedAt < mergedConfig.shortsExpansionDate && durationSec > mergedConfig.legacyShortsDurationSeconds) {
    return {
      contentType: "LONG_FORM",
      classificationSource: "AUTHORITATIVE",
      classificationConfidence: "HIGH",
      confidence: "HIGH",
      rationale: `Uploaded before expansion date (${mergedConfig.shortsExpansionDate.toISOString()}) and duration (${durationSec}s) exceeds legacy threshold (${mergedConfig.legacyShortsDurationSeconds}s)`,
    };
  }

  // 4. Eligible duration (<=60s pre-expansion or <=180s post-expansion) with explicit #shorts tag signal
  const title = (video.snippet?.title || "").toLowerCase();
  const description = (video.snippet?.description || "").toLowerCase();
  const tags = (video.snippet?.tags || []).map((t) => t.toLowerCase());

  const hasShortsSignal =
    title.includes("#shorts") ||
    description.includes("#shorts") ||
    tags.includes("shorts") ||
    tags.includes("#shorts");

  if (hasShortsSignal) {
    return {
      contentType: "SHORTS",
      classificationSource: "HEURISTIC",
      classificationConfidence: "MODERATE",
      confidence: "MODERATE",
      rationale: `Duration (${durationSec}s) is within Shorts window and explicit #shorts signal is present`,
    };
  }

  // 5. Eligible duration without orientation or explicit signal -> UNKNOWN
  // Never silently classify uncertain videos as SHORTS or LONG_FORM!
  return {
    contentType: "UNKNOWN",
    classificationSource: "UNRESOLVED",
    classificationConfidence: "LOW",
    confidence: "LOW",
    rationale: `Duration (${durationSec}s) is within Shorts eligibility window but video stream orientation is unavailable in Data API v3`,
  };
}

export { YouTubeAnalyticsMapper, buildObservationIdentityKey } from "./youtube.analytics-mapper";
