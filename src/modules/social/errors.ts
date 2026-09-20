export type SocialErrorCode =
  | "SOCIAL_AUTH_REQUIRED"
  | "SOCIAL_TOKEN_EXPIRED"
  | "SOCIAL_TOKEN_REVOKED"
  | "SOCIAL_PERMISSION_MISSING"
  | "SOCIAL_RATE_LIMITED"
  | "SOCIAL_API_ERROR"
  | "SOCIAL_UNSUPPORTED_OPERATION"
  | "SOCIAL_ACCOUNT_RESTRICTED"
  | "SOCIAL_INVALID_REQUEST"
  | "SOCIAL_STATE_INVALID"
  | "SOCIAL_STATE_EXPIRED"
  | "SOCIAL_STATE_REPLAYED"
  | "SOCIAL_REFRESH_LOCKED"
  | "SOCIAL_LOCK_ACQUISITION_FAILED"
  | "SOCIAL_INSUFFICIENT_SCOPE"
  | "CONTENT_VALIDATION_ERROR"
  | "CONTENT_NOT_FOUND"
  | "CONTENT_NOT_OWNED"
  | "CONTENT_INVALID_SCHEDULE"
  | "CONTENT_RECONCILIATION_REQUIRED"
  | "DATE_RANGE_EXCEEDED"
  | "MULTIPLE_ACCOUNTS_FOUND"
  | "PLAYLIST_NOT_FOUND"
  | "PLAYLIST_VALIDATION_ERROR"
  | "COMMENT_NOT_FOUND"
  | "COMMENT_NOT_OWNED"
  | "COMMENT_VALIDATION_ERROR"
  | "PUBLISHING_JOB_NOT_FOUND"
  | "INVALID_PUBLISHING_TRANSITION"
  | "UPLOAD_RATE_LIMIT_EXCEEDED"
  | "UNVERIFIED_PROJECT_RESTRICTION"
  | "RESUMABLE_SESSION_EXPIRED"
  | "THUMBNAIL_UPLOAD_FAILED"
  | "QUOTA_EXCEEDED"
  | "NETWORK_TIMEOUT"
  | "CONNECTION_RESET"
  | "NETWORK_ERROR";

export interface SocialErrorOptions {
  provider?: string;
  statusCode?: number;
  retryable?: boolean;
  userActionRequired?: boolean;
  cause?: unknown;
}

export class SocialError extends Error {
  readonly code: SocialErrorCode;
  readonly provider?: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly userActionRequired: boolean;

  constructor(message: string, code: SocialErrorCode, options: SocialErrorOptions = {}) {
    super(message);
    this.name = "SocialError";
    this.code = code;
    this.provider = options.provider;
    this.statusCode = options.statusCode ?? 400;
    this.retryable = options.retryable ?? false;
    this.userActionRequired = options.userActionRequired ?? false;

    if (options.cause) {
      this.cause = options.cause;
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      provider: this.provider,
      retryable: this.retryable,
      userActionRequired: this.userActionRequired,
    };
  }
}
