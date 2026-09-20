/**
 * Strictly-typed YouTube Data API v3 CommentThread and Comment resources.
 * ZERO `any` allowed.
 */

export interface YouTubeAuthorChannelId {
  value: string;
}

export interface YouTubeCommentSnippet {
  authorDisplayName: string;
  authorProfileImageUrl?: string;
  authorChannelUrl?: string;
  authorChannelId?: YouTubeAuthorChannelId;
  channelId?: string;
  videoId?: string;
  textDisplay: string;
  textOriginal: string;
  parentId?: string;
  canRate?: boolean;
  viewerRating?: string;
  likeCount?: number;
  moderationStatus?: "published" | "heldForReview" | "likelySpam" | "rejected";
  publishedAt: string;
  updatedAt?: string;
}

export interface YouTubeCommentResource {
  kind: "youtube#comment";
  etag?: string;
  id: string;
  snippet: YouTubeCommentSnippet;
}

export interface YouTubeCommentThreadSnippet {
  channelId?: string;
  videoId?: string;
  topLevelComment: YouTubeCommentResource;
  canReply?: boolean;
  totalReplyCount?: number;
  isPublic?: boolean;
}

export interface YouTubeCommentThreadReplies {
  comments?: YouTubeCommentResource[];
}

export interface YouTubeCommentThreadResource {
  kind: "youtube#commentThread";
  etag?: string;
  id: string;
  snippet: YouTubeCommentThreadSnippet;
  replies?: YouTubeCommentThreadReplies;
}

export interface YouTubeCommentThreadListResponse {
  kind: "youtube#commentThreadListResponse";
  etag?: string;
  nextPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
  items?: YouTubeCommentThreadResource[];
  error?: {
    code: number;
    message: string;
    errors?: Array<{ message: string; domain?: string; reason?: string }>;
  };
}

export interface YouTubeCommentListResponse {
  kind: "youtube#commentListResponse";
  etag?: string;
  nextPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
  items?: YouTubeCommentResource[];
  error?: {
    code: number;
    message: string;
    errors?: Array<{ message: string; domain?: string; reason?: string }>;
  };
}

export interface YouTubeCommentThreadInsertResource {
  snippet: {
    channelId?: string;
    videoId: string;
    topLevelComment: {
      snippet: {
        textOriginal: string;
      };
    };
  };
}

export interface YouTubeCommentInsertResource {
  snippet: {
    parentId: string;
    textOriginal: string;
  };
}

export interface YouTubeCommentUpdateResource {
  id: string;
  snippet: {
    textOriginal: string;
  };
}
