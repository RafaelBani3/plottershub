import {
  YouTubeChannelListResponse,
  YouTubeChannelResource,
  YouTubePlaylistItemListResponse,
  YouTubeVideoListResponse,
  YouTubeVideoResource,
  YouTubeVideoUpdateResource,
} from "./youtube.types";
import {
  YouTubePlaylistInsertResource,
  YouTubePlaylistItemInsertResource,
  YouTubePlaylistItemResource,
  YouTubePlaylistItemUpdateResource,
  YouTubePlaylistListResponse,
  YouTubePlaylistResource,
  YouTubePlaylistUpdateResource,
} from "./youtube.playlist.types";
import {
  YouTubeCommentInsertResource,
  YouTubeCommentListResponse,
  YouTubeCommentResource,
  YouTubeCommentThreadInsertResource,
  YouTubeCommentThreadListResponse,
  YouTubeCommentThreadResource,
  YouTubeCommentUpdateResource,
} from "./youtube.comment.types";
import { mapYouTubeApiError } from "./youtube.errors";
import { SocialError } from "../../errors";

export class YouTubeDataApiClient {
  private baseUrl = "https://www.googleapis.com/youtube/v3";

  /**
   * Retrieves the primary YouTube Channel resource for the authenticated user.
   * Uses channels.list with mine=true (1 quota unit).
   */
  async getAuthenticatedChannel(accessToken: string): Promise<YouTubeChannelResource> {
    if (!accessToken) {
      throw new SocialError("Access token is required to query YouTube API.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/channels`);
    url.searchParams.set("part", "snippet,contentDetails,statistics,status");
    url.searchParams.set("mine", "true");

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const data: YouTubeChannelListResponse = await response.json();

      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }

      if (!data.items || data.items.length === 0) {
        throw new SocialError(
          "No YouTube channel found for this Google account. Please create a YouTube channel first.",
          "SOCIAL_ACCOUNT_RESTRICTED",
          {
            provider: "YOUTUBE",
            statusCode: 404,
            userActionRequired: true,
          }
        );
      }

      return data.items[0];
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Retrieves a page of playlist items from the specified playlist (1 quota unit).
   * Typically used with the channel's uploads playlist ("UU...").
   */
  async getUploadsPlaylistItems(
    accessToken: string,
    playlistId: string,
    pageToken?: string,
    maxResults = 50
  ): Promise<YouTubePlaylistItemListResponse> {
    if (!accessToken) {
      throw new SocialError("Access token is required to query YouTube API.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    if (!playlistId) {
      throw new SocialError("Playlist ID is required for playlistItems.list.", "SOCIAL_INVALID_REQUEST", {
        provider: "YOUTUBE",
      });
    }

    const url = new URL(`${this.baseUrl}/playlistItems`);
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", String(Math.min(maxResults, 50)));

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const data: YouTubePlaylistItemListResponse = await response.json();

      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }

      return data;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Retrieves full video metadata, statistics, status, and duration for a batch of up to 50 video IDs.
   * Costs exactly 1 quota unit for the entire batch of 50.
   */
  async getVideosBatch(accessToken: string, videoIds: string[]): Promise<YouTubeVideoResource[]> {
    if (!accessToken) {
      throw new SocialError("Access token is required to query YouTube API.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    if (videoIds.length === 0) {
      return [];
    }

    if (videoIds.length > 50) {
      throw new SocialError(
        "videos.list batch exceeds maximum limit of 50 video IDs per request.",
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE" }
      );
    }

    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set("part", "snippet,statistics,contentDetails,status");
    url.searchParams.set("id", videoIds.join(","));

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const data: YouTubeVideoListResponse = await response.json();

      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }

      return data.items || [];
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Retrieves full video resource for a single video ID (1 quota unit).
   * Used for authoritative pre-update fetch in read-modify-write workflow.
   */
  async getVideoById(
    accessToken: string,
    videoId: string,
    parts = "snippet,status"
  ): Promise<YouTubeVideoResource | null> {
    if (!accessToken) {
      throw new SocialError("Access token is required to query YouTube API.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    if (!videoId) {
      throw new SocialError("Video ID is required.", "SOCIAL_INVALID_REQUEST", {
        provider: "YOUTUBE",
      });
    }

    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set("part", parts);
    url.searchParams.set("id", videoId);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const data: YouTubeVideoListResponse = await response.json();

      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }

      if (!data.items || data.items.length === 0) {
        return null;
      }

      return data.items[0];
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Updates specified video parts using official HTTP PUT /videos?part={parts} (50 quota units).
   * Enforces strictly typed YouTubeVideoUpdateResource with ZERO `any`.
   */
  async updateVideo(
    accessToken: string,
    parts: string[],
    resource: YouTubeVideoUpdateResource
  ): Promise<YouTubeVideoResource> {
    if (!accessToken) {
      throw new SocialError("Access token is required to update video.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    if (!resource.id) {
      throw new SocialError("Video ID is required for update.", "SOCIAL_INVALID_REQUEST", {
        provider: "YOUTUBE",
      });
    }

    if (!parts || parts.length === 0) {
      throw new SocialError("At least one part must be specified for videos.update.", "SOCIAL_INVALID_REQUEST", {
        provider: "YOUTUBE",
      });
    }

    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set("part", parts.join(","));

    try {
      const response = await fetch(url.toString(), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(resource),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }

      return data as YouTubeVideoResource;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  // =========================================================================
  // Playlists API (Phase 3.4E)
  // =========================================================================

  /**
   * Lists playlists for a specified channel (1 quota unit).
   */
  async listPlaylists(
    accessToken: string,
    channelId: string,
    pageToken?: string,
    maxResults = 50
  ): Promise<YouTubePlaylistListResponse> {
    if (!accessToken) {
      throw new SocialError("Access token is required to query YouTube API.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/playlists`);
    url.searchParams.set("part", "snippet,status,contentDetails");
    url.searchParams.set("channelId", channelId);
    url.searchParams.set("maxResults", String(Math.min(maxResults, 50)));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const data: YouTubePlaylistListResponse = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Creates a new playlist on YouTube (50 quota units).
   */
  async insertPlaylist(
    accessToken: string,
    resource: YouTubePlaylistInsertResource
  ): Promise<YouTubePlaylistResource> {
    if (!accessToken) {
      throw new SocialError("Access token is required to insert playlist.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/playlists`);
    url.searchParams.set("part", "snippet,status");

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(resource),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data as YouTubePlaylistResource;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Updates an existing playlist (50 quota units).
   */
  async updatePlaylist(
    accessToken: string,
    resource: YouTubePlaylistUpdateResource
  ): Promise<YouTubePlaylistResource> {
    if (!accessToken) {
      throw new SocialError("Access token is required to update playlist.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/playlists`);
    url.searchParams.set("part", "snippet,status");

    try {
      const response = await fetch(url.toString(), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(resource),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data as YouTubePlaylistResource;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Deletes a playlist (50 quota units).
   */
  async deletePlaylist(accessToken: string, playlistId: string): Promise<boolean> {
    if (!accessToken) {
      throw new SocialError("Access token is required to delete playlist.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/playlists`);
    url.searchParams.set("id", playlistId);

    try {
      const response = await fetch(url.toString(), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (response.status === 204 || response.ok) {
        return true;
      }
      const data = await response.json().catch(() => ({}));
      throw mapYouTubeApiError(data);
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Lists playlist items for a specified playlist (1 quota unit).
   */
  async listPlaylistItems(
    accessToken: string,
    playlistId: string,
    pageToken?: string,
    maxResults = 50
  ): Promise<YouTubePlaylistItemListResponse> {
    if (!accessToken) {
      throw new SocialError("Access token is required to query playlist items.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/playlistItems`);
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", String(Math.min(maxResults, 50)));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const data: YouTubePlaylistItemListResponse = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Adds a video to a playlist (50 quota units).
   */
  async insertPlaylistItem(
    accessToken: string,
    resource: YouTubePlaylistItemInsertResource
  ): Promise<YouTubePlaylistItemResource> {
    if (!accessToken) {
      throw new SocialError("Access token is required to insert playlist item.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/playlistItems`);
    url.searchParams.set("part", "snippet,status");

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(resource),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data as YouTubePlaylistItemResource;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Updates/reorders a playlist item (50 quota units).
   */
  async updatePlaylistItem(
    accessToken: string,
    resource: YouTubePlaylistItemUpdateResource
  ): Promise<YouTubePlaylistItemResource> {
    if (!accessToken) {
      throw new SocialError("Access token is required to update playlist item.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/playlistItems`);
    url.searchParams.set("part", "snippet");

    try {
      const response = await fetch(url.toString(), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(resource),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data as YouTubePlaylistItemResource;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Deletes a playlist item using its playlistItemId (never videoId!) (50 quota units).
   */
  async deletePlaylistItem(accessToken: string, playlistItemId: string): Promise<boolean> {
    if (!accessToken) {
      throw new SocialError("Access token is required to delete playlist item.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/playlistItems`);
    url.searchParams.set("id", playlistItemId);

    try {
      const response = await fetch(url.toString(), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (response.status === 204 || response.ok) {
        return true;
      }
      const data = await response.json().catch(() => ({}));
      throw mapYouTubeApiError(data);
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  // =========================================================================
  // Comments API (Phase 3.4E)
  // =========================================================================

  /**
   * Lists comment threads for a video or channel (1 quota unit).
   */
  async listCommentThreads(
    accessToken: string,
    params: {
      videoId?: string;
      channelId?: string;
      allThreadsRelatedToChannelId?: string;
      pageToken?: string;
      maxResults?: number;
      order?: "time" | "relevance";
    }
  ): Promise<YouTubeCommentThreadListResponse> {
    if (!accessToken) {
      throw new SocialError("Access token is required to query comment threads.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/commentThreads`);
    url.searchParams.set("part", "snippet,replies");
    if (params.videoId) url.searchParams.set("videoId", params.videoId);
    if (params.channelId) url.searchParams.set("channelId", params.channelId);
    if (params.allThreadsRelatedToChannelId) {
      url.searchParams.set("allThreadsRelatedToChannelId", params.allThreadsRelatedToChannelId);
    }
    url.searchParams.set("maxResults", String(Math.min(params.maxResults ?? 20, 100)));
    if (params.order) url.searchParams.set("order", params.order);
    if (params.pageToken) url.searchParams.set("pageToken", params.pageToken);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const data: YouTubeCommentThreadListResponse = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Inserts a top-level comment thread on a video (50 quota units).
   */
  async insertCommentThread(
    accessToken: string,
    resource: YouTubeCommentThreadInsertResource
  ): Promise<YouTubeCommentThreadResource> {
    if (!accessToken) {
      throw new SocialError("Access token is required to insert comment thread.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/commentThreads`);
    url.searchParams.set("part", "snippet");

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(resource),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data as YouTubeCommentThreadResource;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Lists replies for a specified parent comment (1 quota unit).
   */
  async listComments(
    accessToken: string,
    parentId: string,
    pageToken?: string,
    maxResults = 50
  ): Promise<YouTubeCommentListResponse> {
    if (!accessToken) {
      throw new SocialError("Access token is required to list comment replies.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/comments`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("parentId", parentId);
    url.searchParams.set("maxResults", String(Math.min(maxResults, 100)));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const data: YouTubeCommentListResponse = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Inserts a reply to an existing comment (50 quota units).
   */
  async insertComment(
    accessToken: string,
    resource: YouTubeCommentInsertResource
  ): Promise<YouTubeCommentResource> {
    if (!accessToken) {
      throw new SocialError("Access token is required to reply to comment.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/comments`);
    url.searchParams.set("part", "snippet");

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(resource),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data as YouTubeCommentResource;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Updates an existing comment's text (50 quota units).
   */
  async updateComment(
    accessToken: string,
    resource: YouTubeCommentUpdateResource
  ): Promise<YouTubeCommentResource> {
    if (!accessToken) {
      throw new SocialError("Access token is required to update comment.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/comments`);
    url.searchParams.set("part", "snippet");

    try {
      const response = await fetch(url.toString(), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(resource),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw mapYouTubeApiError(data);
      }
      return data as YouTubeCommentResource;
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Deletes an existing comment (50 quota units).
   */
  async deleteComment(accessToken: string, commentId: string): Promise<boolean> {
    if (!accessToken) {
      throw new SocialError("Access token is required to delete comment.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const url = new URL(`${this.baseUrl}/comments`);
    url.searchParams.set("id", commentId);

    try {
      const response = await fetch(url.toString(), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (response.status === 204 || response.ok) {
        return true;
      }
      const data = await response.json().catch(() => ({}));
      throw mapYouTubeApiError(data);
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }

  /**
   * Sets the moderation status of one or more comments (50 quota units).
   */
  async setModerationStatus(
    accessToken: string,
    commentIds: string[],
    moderationStatus: "published" | "heldForReview" | "rejected",
    banAuthor = false
  ): Promise<boolean> {
    if (!accessToken) {
      throw new SocialError("Access token is required to set moderation status.", "SOCIAL_AUTH_REQUIRED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    if (!commentIds || commentIds.length === 0) {
      throw new SocialError("At least one comment ID must be specified.", "SOCIAL_INVALID_REQUEST", {
        provider: "YOUTUBE",
      });
    }

    const url = new URL(`${this.baseUrl}/comments/setModerationStatus`);
    url.searchParams.set("id", commentIds.join(","));
    url.searchParams.set("moderationStatus", moderationStatus);
    if (banAuthor) {
      url.searchParams.set("banAuthor", "true");
    }

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (response.status === 204 || response.ok) {
        return true;
      }
      const data = await response.json().catch(() => ({}));
      throw mapYouTubeApiError(data);
    } catch (error) {
      throw mapYouTubeApiError(error);
    }
  }
}

