import {
  YouTubeContentType,
  ClassificationConfidence,
  ClassificationSource,
} from "../social/providers/youtube/youtube.types";

export type ContentTypeFilter = "ALL" | "LONG_FORM" | "SHORTS" | "LIVE_STREAM" | "UNKNOWN";
export type ContentStatusFilter = "ALL" | "DRAFT" | "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "ARCHIVED";
export type ContentPrivacyFilter = "ALL" | "PUBLIC" | "UNLISTED" | "PRIVATE";
export type ContentSortField = "publishedAt" | "views" | "likes" | "comments" | "duration" | "title";
export type SortOrder = "asc" | "desc";

// Type aliases for UI compatibility
export type ContentFilterType = ContentTypeFilter;
export type ContentFilterStatus = ContentStatusFilter;
export type ContentFilterPrivacy = ContentPrivacyFilter;

export interface ListContentQuery {
  workspaceId: string;
  socialAccountId?: string;
  contentType?: ContentTypeFilter;
  status?: ContentStatusFilter;
  privacy?: ContentPrivacyFilter;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  sortBy?: ContentSortField;
  sortOrder?: SortOrder;
  limit?: number; // bounded: default 20, min 1, max 100
  offset?: number; // bounded: default 0, min 0
}

export interface ContentThumbnailInfo {
  url?: string;
  width?: number;
  height?: number;
}

export interface ContentThumbnailsMap {
  default?: ContentThumbnailInfo;
  medium?: ContentThumbnailInfo;
  high?: ContentThumbnailInfo;
  standard?: ContentThumbnailInfo;
  maxres?: ContentThumbnailInfo;
}

export interface ContentMetadataDTO {
  durationSeconds: number | null;
  durationFormatted: string;
  contentType: YouTubeContentType | string;
  classificationConfidence: ClassificationConfidence | string;
  classificationSource: ClassificationSource | string;
  classificationRationale: string;
  privacyStatus: string;
  uploadStatus: string;
  license: string;
  embeddable: boolean;
  madeForKids: boolean;
  publishAt?: string;
  thumbnails: ContentThumbnailsMap;
  tags: string[];
  categoryId: string;
  liveBroadcastContent?: string;
}

export interface ContentMetricsDTO {
  views: string | null;
  likes: string | null;
  comments: string | null;
  engagementRate: number | null;
  capturedAt: string | null;
}

export interface ContentSocialAccountDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  platformCode: string;
}

export interface ContentListItemDTO {
  id: string; // ContentPlatform cuid
  contentId: string; // Root Content cuid
  title: string;
  description: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  externalContentId: string | null;
  externalUrl: string | null;
  socialAccountId: string;
  socialAccountName?: string;
  contentType: YouTubeContentType;
  classificationConfidence: ClassificationConfidence;
  classificationSource: ClassificationSource;
  classificationRationale?: string;
  privacyStatus?: string;
  formattedDuration?: string;
  durationSeconds?: number | null;
  thumbnails?: ContentThumbnailsMap;
  socialAccount: ContentSocialAccountDTO;
  metadata: ContentMetadataDTO | null;
  metrics: ContentMetricsDTO | null;
}

export interface ContentSummaryDTO {
  total: number;
  totalVideos: number;
  totalViews: string;
  shorts: number;
  shortsCount: number;
  longForm: number;
  longFormCount: number;
  unknown: number;
  unknownCount: number;
  liveStream: number;
  liveCount: number;
  lastSyncedAt: string | null;
}

export interface ContentListResult {
  items: ContentListItemDTO[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  summary: ContentSummaryDTO;
}

// -----------------------------------------------------------------------------
// Content Write Contracts (Phase 3.4D)
// -----------------------------------------------------------------------------

export interface UpdateContentInput {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: "public" | "unlisted" | "private";
  publishAt?: string | null;
  selfDeclaredMadeForKids?: boolean;
  containsSyntheticMedia?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateUpdateContentInput(input: UpdateContentInput): ValidationResult {
  if (!input || typeof input !== "object") {
    return { valid: false, error: "Request payload must be a non-empty object." };
  }

  const {
    title,
    description,
    tags,
    categoryId,
    privacyStatus,
    publishAt,
    selfDeclaredMadeForKids,
    containsSyntheticMedia,
  } = input;

  const hasAtLeastOneField =
    title !== undefined ||
    description !== undefined ||
    tags !== undefined ||
    categoryId !== undefined ||
    privacyStatus !== undefined ||
    publishAt !== undefined ||
    selfDeclaredMadeForKids !== undefined ||
    containsSyntheticMedia !== undefined;

  if (!hasAtLeastOneField) {
    return { valid: false, error: "At least one mutable field must be provided in update request." };
  }

  // 1. Title validation
  if (title !== undefined) {
    if (typeof title !== "string") {
      return { valid: false, error: "Title must be a string." };
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 1 || trimmedTitle.length > 100) {
      return { valid: false, error: "Title must be between 1 and 100 characters." };
    }
    if (title.includes("<") || title.includes(">")) {
      return { valid: false, error: "Title cannot contain '<' or '>' characters." };
    }
  }

  // 2. Description validation
  if (description !== undefined) {
    if (typeof description !== "string") {
      return { valid: false, error: "Description must be a string." };
    }
    if (description.length > 5000) {
      return { valid: false, error: "Description exceeds maximum allowed limit of 5,000 characters." };
    }
    if (description.includes("<") || description.includes(">")) {
      return { valid: false, error: "Description cannot contain '<' or '>' characters." };
    }
  }

  // 3. Tags validation
  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      return { valid: false, error: "Tags must be an array of strings." };
    }
    let totalTagsLength = 0;
    for (const tag of tags) {
      if (typeof tag !== "string") {
        return { valid: false, error: "Every tag item must be a string." };
      }
      if (tag.includes("<") || tag.includes(">")) {
        return { valid: false, error: "Tags cannot contain '<' or '>' characters." };
      }
      totalTagsLength += tag.length;
    }
    if (totalTagsLength > 500) {
      return { valid: false, error: `Total length of all tags (${totalTagsLength}) exceeds maximum limit of 500 characters.` };
    }
  }

  // 4. Category ID validation
  if (categoryId !== undefined) {
    if (typeof categoryId !== "string" || !/^\d+$/.test(categoryId.trim())) {
      return { valid: false, error: "Category ID must be a valid numeric string identifier." };
    }
  }

  // 5. Privacy status validation
  if (privacyStatus !== undefined) {
    const validPrivacy = ["public", "unlisted", "private"];
    if (!validPrivacy.includes(privacyStatus)) {
      return { valid: false, error: `Invalid privacy status: '${privacyStatus}'. Must be one of: public, unlisted, private.` };
    }
  }

  // 6. publishAt validation
  if (publishAt !== undefined && publishAt !== null) {
    if (typeof publishAt !== "string") {
      return { valid: false, error: "publishAt must be a valid ISO 8601 date string or null." };
    }
    const date = new Date(publishAt);
    if (isNaN(date.getTime())) {
      return { valid: false, error: "publishAt must be a valid ISO 8601 date string." };
    }
    if (privacyStatus && privacyStatus !== "private") {
      return { valid: false, error: "publishAt scheduling requires privacyStatus to be 'private'." };
    }
  }

  // 7. selfDeclaredMadeForKids validation
  if (selfDeclaredMadeForKids !== undefined) {
    if (typeof selfDeclaredMadeForKids !== "boolean") {
      return { valid: false, error: "selfDeclaredMadeForKids must be a boolean." };
    }
  }

  // 8. containsSyntheticMedia validation
  if (containsSyntheticMedia !== undefined) {
    if (typeof containsSyntheticMedia !== "boolean") {
      return { valid: false, error: "containsSyntheticMedia must be a boolean." };
    }
  }

  return { valid: true };
}
