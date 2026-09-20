/**
 * Strictly-typed YouTube Data API v3 Playlist and PlaylistItem resources.
 * ZERO `any` allowed.
 */

export type YouTubePlaylistPrivacyStatus = "public" | "unlisted" | "private";

export interface YouTubePlaylistThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YouTubePlaylistThumbnails {
  default?: YouTubePlaylistThumbnail;
  medium?: YouTubePlaylistThumbnail;
  high?: YouTubePlaylistThumbnail;
  standard?: YouTubePlaylistThumbnail;
  maxres?: YouTubePlaylistThumbnail;
}

export interface YouTubePlaylistSnippet {
  publishedAt?: string;
  channelId?: string;
  title: string;
  description?: string;
  thumbnails?: YouTubePlaylistThumbnails;
  channelTitle?: string;
  defaultLanguage?: string;
  localized?: {
    title: string;
    description: string;
  };
}

export interface YouTubePlaylistStatus {
  privacyStatus: YouTubePlaylistPrivacyStatus;
}

export interface YouTubePlaylistContentDetails {
  itemCount: number;
}

export interface YouTubePlaylistResource {
  kind: "youtube#playlist";
  etag?: string;
  id: string;
  snippet: YouTubePlaylistSnippet;
  status?: YouTubePlaylistStatus;
  contentDetails?: YouTubePlaylistContentDetails;
}

export interface YouTubePlaylistListResponse {
  kind: "youtube#playlistListResponse";
  etag?: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
  items?: YouTubePlaylistResource[];
  error?: {
    code: number;
    message: string;
    errors?: Array<{ message: string; domain?: string; reason?: string }>;
  };
}

export interface YouTubePlaylistInsertResource {
  snippet: {
    title: string;
    description?: string;
    defaultLanguage?: string;
  };
  status?: {
    privacyStatus: YouTubePlaylistPrivacyStatus;
  };
}

export interface YouTubePlaylistUpdateResource {
  id: string;
  snippet: {
    title: string;
    description?: string;
    defaultLanguage?: string;
  };
  status?: {
    privacyStatus: YouTubePlaylistPrivacyStatus;
  };
}

export interface YouTubePlaylistItemSnippet {
  publishedAt?: string;
  channelId?: string;
  title: string;
  description?: string;
  thumbnails?: YouTubePlaylistThumbnails;
  channelTitle?: string;
  playlistId: string;
  position?: number;
  resourceId: {
    kind: string;
    videoId: string;
  };
  videoOwnerChannelTitle?: string;
  videoOwnerChannelId?: string;
}

export interface YouTubePlaylistItemContentDetails {
  videoId: string;
  startAt?: string;
  endAt?: string;
  note?: string;
  videoPublishedAt?: string;
}

export interface YouTubePlaylistItemStatus {
  privacyStatus: string;
}

export interface YouTubePlaylistItemResource {
  kind: "youtube#playlistItem";
  etag?: string;
  id: string;
  snippet: YouTubePlaylistItemSnippet;
  contentDetails?: YouTubePlaylistItemContentDetails;
  status?: YouTubePlaylistItemStatus;
}

export interface YouTubePlaylistItemListResponse {
  kind: "youtube#playlistItemListResponse";
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
    errors?: Array<{ message: string; domain?: string; reason?: string }>;
  };
}

export interface YouTubePlaylistItemInsertResource {
  snippet: {
    playlistId: string;
    position?: number;
    resourceId: {
      kind: "youtube#video";
      videoId: string;
    };
  };
}

export interface YouTubePlaylistItemUpdateResource {
  id: string;
  snippet: {
    playlistId: string;
    position: number;
    resourceId: {
      kind: "youtube#video";
      videoId: string;
    };
  };
}
