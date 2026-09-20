import { SocialError } from "@/modules/social/errors";
import { StagedMediaDescriptor } from "@/modules/storage/media-storage";
import {
  SocialPublisher,
  GenericPublishingPayload,
  PublishingSession,
  ChunkUploadResult,
  SessionStatusResult,
  ReconciliationResult,
} from "../publisher.types";
import { YOUTUBE_CHUNK_UNIT_BYTES } from "@/modules/publishing/publishing.types";

interface YouTubeVideoInsertPayload {
  snippet: {
    title: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
  };
  status: {
    privacyStatus: "public" | "private" | "unlisted";
    publishAt?: string;
    selfDeclaredMadeForKids?: boolean;
  };
}

interface YouTubeVideoResponse {
  id: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
  };
  status?: {
    privacyStatus?: string;
    publishAt?: string;
    uploadStatus?: string;
  };
}

interface YouTubeVideoListResponse {
  items?: YouTubeVideoResponse[];
}

export class YouTubePublisher implements SocialPublisher {
  readonly platformCode = "YOUTUBE";

  /**
   * Initializes a YouTube resumable upload session.
   * Returns a PublishingSession containing the secret upload URL.
   */
  async initPublishingSession(
    socialAccountId: string,
    payload: GenericPublishingPayload,
    mediaInfo: StagedMediaDescriptor,
    accessToken: string
  ): Promise<PublishingSession> {
    const insertPayload: YouTubeVideoInsertPayload = {
      snippet: {
        title: payload.title,
        description: payload.description || "",
        tags: payload.tags || [],
        categoryId: payload.categoryId || "22", // Default: People & Blogs
      },
      status: {
        privacyStatus: payload.privacyStatus.toLowerCase() as "public" | "private" | "unlisted",
        selfDeclaredMadeForKids: payload.madeForKids ?? false,
      },
    };

    // YouTube Rule: Scheduled publish requires privacyStatus = "private" and ISO 8601 UTC timestamp
    if (payload.scheduledAtUtc) {
      insertPayload.status.privacyStatus = "private";
      insertPayload.status.publishAt = payload.scheduledAtUtc.toISOString();
    }

    const initUrl =
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

    const response = await fetch(initUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": mediaInfo.fileSizeBytes.toString(),
        "X-Upload-Content-Type": mediaInfo.mimeType,
      },
      body: JSON.stringify(insertPayload),
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      if (response.status === 401) {
        throw new SocialError("YouTube access token expired", "SOCIAL_TOKEN_EXPIRED", {
          statusCode: 401,
          retryable: true,
          provider: "YOUTUBE",
        });
      }

      if (response.status === 403) {
        const errorStr = JSON.stringify(errorBody);
        if (errorStr.includes("uploadRateLimitExceeded")) {
          throw new SocialError(
            "YouTube daily channel upload limit exceeded. Please try again in 24 hours.",
            "UPLOAD_RATE_LIMIT_EXCEEDED",
            { statusCode: 403, retryable: false, provider: "YOUTUBE" }
          );
        }
        if (errorStr.includes("quotaExceeded")) {
          throw new SocialError("YouTube API quota exceeded for today.", "QUOTA_EXCEEDED", {
            statusCode: 403,
            retryable: false,
            provider: "YOUTUBE",
          });
        }
      }

      throw new SocialError(
        `Failed to initialize YouTube upload session: HTTP ${response.status}`,
        "SOCIAL_API_ERROR",
        {
          statusCode: response.status,
          retryable: response.status >= 500,
          provider: "YOUTUBE",
          cause: errorBody,
        }
      );
    }

    const sessionUrl = response.headers.get("Location") || response.headers.get("location");
    if (!sessionUrl) {
      throw new SocialError(
        "YouTube did not return a session Location header for resumable upload",
        "SOCIAL_API_ERROR",
        { statusCode: 502, retryable: true, provider: "YOUTUBE" }
      );
    }

    return {
      provider: "YOUTUBE",
      sessionUrl,
      bytesUploaded: 0,
      totalBytes: mediaInfo.fileSizeBytes,
    };
  }

  /**
   * Transmits a single chunk of video bytes to the secret session URL.
   */
  async uploadNextChunk(
    session: PublishingSession,
    chunkBuffer: Buffer,
    range: { start: number; end: number; total: number },
    _accessToken: string
  ): Promise<ChunkUploadResult> {
    const isFinalChunk = range.end === range.total - 1;

    // YouTube constraint: Non-final chunks MUST be exact multiples of 256 KiB
    if (!isFinalChunk && chunkBuffer.length % YOUTUBE_CHUNK_UNIT_BYTES !== 0) {
      throw new SocialError(
        `Non-final chunk size (${chunkBuffer.length}) must be an exact multiple of 256 KiB (${YOUTUBE_CHUNK_UNIT_BYTES})`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 400, retryable: false, provider: "YOUTUBE" }
      );
    }

    const contentRangeHeader = `bytes ${range.start}-${range.end}/${range.total}`;

    let response: Response;
    try {
      response = await fetch(session.sessionUrl, {
        method: "PUT",
        headers: {
          "Content-Length": chunkBuffer.length.toString(),
          "Content-Range": contentRangeHeader,
        },
        body: new Uint8Array(chunkBuffer),
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      const isTimeout =
        (networkErr instanceof Error && networkErr.name === "AbortError") ||
        msg.toLowerCase().includes("timeout") ||
        msg.toLowerCase().includes("aborted");
      const isConnReset =
        msg.includes("ECONNRESET") || msg.toLowerCase().includes("connection reset");

      if (isTimeout) {
        throw new SocialError(`YouTube chunk upload timed out: ${msg}`, "NETWORK_TIMEOUT", {
          statusCode: 504,
          retryable: true,
          provider: "YOUTUBE",
          cause: networkErr,
        });
      }
      if (isConnReset) {
        throw new SocialError(`Connection reset during chunk upload: ${msg}`, "CONNECTION_RESET", {
          statusCode: 503,
          retryable: true,
          provider: "YOUTUBE",
          cause: networkErr,
        });
      }
      throw new SocialError(`Network failure during chunk upload: ${msg}`, "NETWORK_ERROR", {
        statusCode: 500,
        retryable: true,
        provider: "YOUTUBE",
        cause: networkErr,
      });
    }

    // Case 1: Incomplete chunk successfully received (HTTP 308)
    if (response.status === 308) {
      const rangeHeader = response.headers.get("Range") || response.headers.get("range");
      let lastAcknowledgedByte = range.end;

      if (rangeHeader && rangeHeader.startsWith("bytes=0-")) {
        const parsed = parseInt(rangeHeader.replace("bytes=0-", ""), 10);
        if (!isNaN(parsed)) {
          lastAcknowledgedByte = parsed;
        }
      }

      return {
        completed: false,
        bytesUploaded: lastAcknowledgedByte + 1,
      };
    }

    // Case 2: Final chunk accepted (HTTP 200 or 201)
    if (response.status === 200 || response.status === 201) {
      const videoData = (await response.json()) as YouTubeVideoResponse;
      if (!videoData.id) {
        throw new SocialError(
          "YouTube upload succeeded but response did not contain video ID",
          "SOCIAL_API_ERROR",
          { statusCode: 502, retryable: true, provider: "YOUTUBE" }
        );
      }

      return {
        completed: true,
        bytesUploaded: range.total,
        externalContentId: videoData.id,
      };
    }

    // Case 3: Error response
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }

    if (response.status === 401) {
      throw new SocialError(
        "YouTube credentials expired or invalid during upload",
        "SOCIAL_AUTH_REQUIRED",
        { statusCode: 401, retryable: true, provider: "YOUTUBE", cause: errorBody }
      );
    }

    if (response.status === 429) {
      throw new SocialError(
        "YouTube upload rate limit exceeded",
        "UPLOAD_RATE_LIMIT_EXCEEDED",
        { statusCode: 429, retryable: true, provider: "YOUTUBE", cause: errorBody }
      );
    }

    if (response.status === 403) {
      const errorStr = typeof errorBody === "string" ? errorBody : JSON.stringify(errorBody || {});
      if (errorStr.includes("quotaExceeded")) {
        throw new SocialError(
          "YouTube upload quota exceeded",
          "QUOTA_EXCEEDED",
          { statusCode: 403, retryable: false, provider: "YOUTUBE", cause: errorBody }
        );
      }
      throw new SocialError(
        "YouTube authorization failed during chunk upload",
        "SOCIAL_PERMISSION_MISSING",
        { statusCode: 403, retryable: false, provider: "YOUTUBE", cause: errorBody }
      );
    }

    if (response.status === 404 || response.status === 410) {
      throw new SocialError(
        "YouTube resumable upload session has expired or is invalid",
        "RESUMABLE_SESSION_EXPIRED",
        { statusCode: response.status, retryable: false, provider: "YOUTUBE", cause: errorBody }
      );
    }

    throw new SocialError(
      `YouTube chunk upload failed: HTTP ${response.status}`,
      "SOCIAL_API_ERROR",
      {
        statusCode: response.status,
        retryable: response.status >= 500,
        provider: "YOUTUBE",
        cause: errorBody,
      }
    );
  }

  /**
   * Queries the status of an ongoing or interrupted upload session.
   */
  async checkSessionStatus(
    session: PublishingSession,
    totalBytes: number,
    _accessToken: string
  ): Promise<SessionStatusResult> {
    const response = await fetch(session.sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Length": "0",
        "Content-Range": `bytes */${totalBytes}`,
      },
    });

    if (response.status === 308) {
      const rangeHeader = response.headers.get("Range") || response.headers.get("range");
      let bytesReceived = 0;
      if (rangeHeader && rangeHeader.startsWith("bytes=0-")) {
        const parsed = parseInt(rangeHeader.replace("bytes=0-", ""), 10);
        if (!isNaN(parsed)) {
          bytesReceived = parsed + 1;
        }
      }

      return {
        status: "IN_PROGRESS",
        bytesReceived,
      };
    }

    if (response.status === 200 || response.status === 201) {
      const videoData = (await response.json()) as YouTubeVideoResponse;
      return {
        status: "COMPLETED",
        bytesReceived: totalBytes,
        externalContentId: videoData.id,
      };
    }

    if (response.status === 404 || response.status === 410) {
      return {
        status: "EXPIRED",
        bytesReceived: 0,
      };
    }

    throw new SocialError(
      `Failed to check YouTube upload status: HTTP ${response.status}`,
      "SOCIAL_API_ERROR",
      { statusCode: response.status, retryable: response.status >= 500, provider: "YOUTUBE" }
    );
  }

  /**
   * Uploads a custom thumbnail image via thumbnails.set.
   */
  async uploadThumbnail(
    externalContentId: string,
    thumbnailBuffer: Buffer,
    mimeType: string,
    accessToken: string
  ): Promise<void> {
    const validMimes = ["image/jpeg", "image/png"];
    if (!validMimes.includes(mimeType.toLowerCase())) {
      throw new SocialError(
        `Unsupported thumbnail MIME type '${mimeType}'. YouTube officially requires image/jpeg or image/png.`,
        "THUMBNAIL_UPLOAD_FAILED",
        { statusCode: 400, retryable: false, provider: "YOUTUBE" }
      );
    }

    if (thumbnailBuffer.length > 2 * 1024 * 1024) {
      throw new SocialError(
        `Thumbnail file size (${thumbnailBuffer.length} bytes) exceeds YouTube 2MB limit`,
        "THUMBNAIL_UPLOAD_FAILED",
        { statusCode: 400, retryable: false, provider: "YOUTUBE" }
      );
    }

    const url = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(
      externalContentId
    )}&uploadType=media`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType,
        "Content-Length": thumbnailBuffer.length.toString(),
      },
      body: new Uint8Array(thumbnailBuffer),
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      throw new SocialError(
        `Failed to upload YouTube thumbnail: HTTP ${response.status}`,
        "THUMBNAIL_UPLOAD_FAILED",
        {
          statusCode: response.status,
          retryable: response.status >= 500,
          provider: "YOUTUBE",
          cause: errorBody,
        }
      );
    }
  }

  /**
   * Deterministic channel reconciliation when session outcome is ambiguous.
   */
  async reconcileRecentUpload(
    _socialAccountId: string,
    payload: GenericPublishingPayload,
    windowMinutes: number,
    accessToken: string
  ): Promise<ReconciliationResult> {
    const url =
      "https://www.googleapis.com/youtube/v3/videos?part=snippet,status&mine=true&maxResults=10";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return { matched: false, confidence: "NONE" };
    }

    const data = (await response.json()) as YouTubeVideoListResponse;
    const items = data.items || [];
    const windowThreshold = new Date(Date.now() - windowMinutes * 60 * 1000);

    for (const item of items) {
      const publishedAtStr = item.snippet?.publishedAt;
      const publishedAt = publishedAtStr ? new Date(publishedAtStr) : null;

      const titleMatches = item.snippet?.title === payload.title;
      const timeMatches = publishedAt ? publishedAt.getTime() >= windowThreshold.getTime() : false;

      if (titleMatches && timeMatches) {
        return {
          matched: true,
          externalContentId: item.id,
          confidence: "HIGH",
        };
      }
    }

    return { matched: false, confidence: "NONE" };
  }
}
