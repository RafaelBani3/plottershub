import { PublishingStatus } from "@prisma/client";
import { SocialError } from "@/modules/social/errors";

export { PublishingStatus };

/**
 * YouTube API chunk sizing constraints and Plottershub implementation policies.
 */
export const YOUTUBE_CHUNK_UNIT_BYTES = 256 * 1024; // 256 KiB (YouTube API requirement: chunks must be multiples of this)
export const DEFAULT_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB (Plottershub default policy for optimal throughput)

/**
 * Logical Quota Buckets
 */
export enum QuotaBucket {
  VIDEO_UPLOAD = "VIDEO_UPLOAD", // Dedicated videos.insert bucket (100 calls/day default in 2026)
  THUMBNAIL_UPLOAD = "THUMBNAIL_UPLOAD", // thumbnails.set (50 units in shared/thumbnail pool)
  DEFAULT_API = "DEFAULT_API", // General metadata API pool
}

export const PUBLISHING_QUOTA_COSTS = {
  VIDEO_INSERT_DEDICATED: 1, // 1 call in VIDEO_UPLOAD bucket
  VIDEO_INSERT_LEGACY: 1600, // 1600 units for legacy shared pools
  THUMBNAILS_SET: 50, // 50 units
  VIDEOS_UPDATE: 50, // 50 units
  VIDEOS_LIST: 1, // 1 unit
} as const;

/**
 * Formal State Transition Table
 */
export const ALLOWED_PUBLISHING_TRANSITIONS: Record<PublishingStatus, PublishingStatus[]> = {
  DRAFT: [PublishingStatus.QUEUED, PublishingStatus.CANCELLED],
  QUEUED: [
    PublishingStatus.UPLOADING,
    PublishingStatus.CANCELLED,
    PublishingStatus.FAILED,
  ],
  UPLOADING: [
    PublishingStatus.UPLOADING, // Intermediate chunk acknowledged (308)
    PublishingStatus.UPLOADED, // Final chunk accepted (200/201)
    PublishingStatus.RECONCILING, // Timeout / connection drop
    PublishingStatus.FAILED, // Fatal error (400, 403 quota)
  ],
  UPLOADED: [
    PublishingStatus.PROCESSING, // Enters YouTube transcoding
    PublishingStatus.SCHEDULED, // Scheduled publish with status.publishAt
    PublishingStatus.PUBLISHING, // Immediate publish confirmation
  ],
  PROCESSING: [
    PublishingStatus.PUBLISHED, // Transcoding complete & live
    PublishingStatus.SCHEDULED, // Transcoding complete for scheduled video
    PublishingStatus.PUBLISHING, // Transcoding complete, transition to publishing
    PublishingStatus.FAILED, // YouTube rejected video processing
  ],
  SCHEDULED: [
    PublishingStatus.PUBLISHING, // Reached scheduled time
    PublishingStatus.CANCELLED, // Cancelled by creator before release
  ],
  PUBLISHING: [
    PublishingStatus.PUBLISHED, // Live visibility confirmed
    PublishingStatus.FAILED, // Visibility transition failed
    PublishingStatus.RECONCILING, // Verification ambiguous
  ],
  PUBLISHED: [], // Terminal success state
  CANCELLED: [], // Terminal cancelled state
  RECONCILING: [
    PublishingStatus.UPLOADING, // Session alive; resumed
    PublishingStatus.UPLOADED, // Video was already created
    PublishingStatus.PUBLISHED, // Video confirmed live on channel
    PublishingStatus.FAILED, // Session lost & cannot reconcile with confidence
  ],
  FAILED: [
    PublishingStatus.QUEUED, // Manual/automatic retry for retryable failure
    PublishingStatus.UPLOADING, // Direct resume into upload
    PublishingStatus.RECONCILING, // Reconciling ambiguous failure
  ],
};

/**
 * Validates whether a state transition is permitted by the formal transition matrix.
 * Throws SocialError with code INVALID_PUBLISHING_TRANSITION if disallowed.
 */
export function transitionPublishingJob(
  currentStatus: PublishingStatus,
  nextStatus: PublishingStatus
): void {
  if (currentStatus === nextStatus && currentStatus === PublishingStatus.UPLOADING) {
    // Permitted: self-transition during chunk streaming
    return;
  }

  const allowed = ALLOWED_PUBLISHING_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new SocialError(
      `Invalid publishing job state transition from ${currentStatus} to ${nextStatus}`,
      "INVALID_PUBLISHING_TRANSITION",
      {
        statusCode: 400,
        retryable: false,
      }
    );
  }
}

/**
 * Structured Failure Metadata for FAILED states
 */
export interface PublishingFailureMetadata {
  retryable: boolean;
  failureCode:
    | "NETWORK_TIMEOUT"
    | "CONNECTION_RESET"
    | "RATE_LIMIT_EXCEEDED"
    | "AUTH_EXPIRED"
    | "SCOPE_INSUFFICIENT"
    | "QUOTA_EXCEEDED"
    | "SESSION_EXPIRED"
    | "VALIDATION_FAILED"
    | "UNKNOWN_PROVIDER_RESULT"
    | "RECONCILIATION_UNCONFIRMED"
    | "THUMBNAIL_FAILED"
    | "INTERNAL_ERROR";
  failureSource: "CLIENT" | "PLOTTERSHUB_STAGING" | "YOUTUBE_API" | "NETWORK";
  httpStatus?: number;
  retryCount: number;
  maxRetries: number;
  requiresManualReview?: boolean;
  message?: string;
  details?: unknown;
}

export type VideoPrivacyStatus = "PUBLIC" | "PRIVATE" | "UNLISTED" | "public" | "private" | "unlisted";

export interface PublishVideoInput {
  workspaceId: string;
  contentId: string;
  socialAccountId: string;
  storageKey?: string;
  videoStorageKey?: string;
  privacyStatus?: VideoPrivacyStatus;
  scheduledAtUtc?: Date | string | null;
  publishAt?: Date | string | null;
  publishingTimezone?: string;
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  madeForKids?: boolean;
  thumbnailStorageKey?: string;
  idempotencyKey?: string;
}

export interface PublishingJobDTO {
  id: string;
  contentPlatformId: string;
  idempotencyKey: string;
  publishingStatus: PublishingStatus;
  bytesUploaded: number;
  totalBytes: number | null;
  thumbnailStatus: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: PublishingFailureMetadata | Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Input validation for video publishing requests.
 */
export function validatePublishVideoInput(input: PublishVideoInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input.workspaceId?.trim()) {
    errors.push("Workspace ID is required");
  }
  if (!input.contentId?.trim()) {
    errors.push("Content ID is required");
  }
  if (!input.socialAccountId?.trim()) {
    errors.push("Social Account ID is required");
  }

  const effectiveStorageKey = input.storageKey || input.videoStorageKey;
  if (!effectiveStorageKey?.trim()) {
    errors.push("Staged video storage key is required");
  }

  const privacy = (input.privacyStatus || "PUBLIC").toUpperCase();
  const validPrivacy = ["PUBLIC", "PRIVATE", "UNLISTED"];
  if (!validPrivacy.includes(privacy)) {
    errors.push(`Privacy status must be one of: ${validPrivacy.join(", ")}`);
  }

  if (input.title !== undefined) {
    if (!input.title.trim()) {
      errors.push("Video title must not be empty if provided");
    } else if (input.title.length > 100) {
      errors.push("Video title exceeds 100 characters maximum limit");
    }
  }

  if (input.description !== undefined && input.description.length > 5000) {
    errors.push("Video description exceeds 5,000 characters limit");
  }

  if (input.tags && input.tags.join(",").length > 500) {
    errors.push("Combined tags length exceeds 500 characters limit");
  }

  // Scheduling rules
  const effectiveSchedule = input.publishAt || input.scheduledAtUtc;
  if (effectiveSchedule) {
    const scheduledDate =
      typeof effectiveSchedule === "string"
        ? new Date(effectiveSchedule)
        : effectiveSchedule;

    if (isNaN(scheduledDate.getTime())) {
      errors.push("Scheduled publishAt timestamp is invalid");
    } else {
      const now = new Date();
      if (scheduledDate.getTime() <= now.getTime()) {
        errors.push("Scheduled publishAt timestamp must be in the future");
      }
      // Mandatory YouTube rule: Scheduled videos MUST be private
      if (privacy !== "PRIVATE") {
        errors.push("YouTube scheduled publishing requires privacyStatus to be 'private' until release");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
