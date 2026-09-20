import { SocialError, SocialErrorCode } from "../../errors";

/**
 * Maps Google OAuth token exchange and revocation errors to sanitized SocialError.
 */
export function mapGoogleOAuthError(error: unknown): SocialError {
  if (error instanceof SocialError) return error;

  const errObj = error as any;
  const errorCodeStr = (errObj?.error || errObj?.code || "").toLowerCase();
  const description = errObj?.error_description || errObj?.message || "Google OAuth operation failed.";

  if (errorCodeStr === "invalid_grant" || description.includes("invalid_grant")) {
    return new SocialError(
      "Google authorization grant expired or revoked. Please re-authenticate your YouTube channel.",
      "SOCIAL_TOKEN_REVOKED",
      {
        provider: "YOUTUBE",
        statusCode: 400,
        userActionRequired: true,
        cause: error,
      }
    );
  }

  if (errorCodeStr === "access_denied" || description.includes("access_denied")) {
    return new SocialError(
      "User denied access to Google/YouTube permissions.",
      "SOCIAL_AUTH_REQUIRED",
      {
        provider: "YOUTUBE",
        statusCode: 403,
        userActionRequired: true,
        cause: error,
      }
    );
  }

  if (errorCodeStr === "invalid_client") {
    return new SocialError(
      "Google OAuth client configuration is invalid or missing.",
      "SOCIAL_INVALID_REQUEST",
      {
        provider: "YOUTUBE",
        statusCode: 500,
        cause: error,
      }
    );
  }

  return new SocialError(
    `Google authorization failed: ${description}`,
    "SOCIAL_API_ERROR",
    {
      provider: "YOUTUBE",
      statusCode: 400,
      cause: error,
    }
  );
}

/**
 * Sanitizes error messages by stripping potential OAuth tokens or authorization strings.
 */
function sanitizeErrorMessage(rawMessage: string): string {
  return rawMessage
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, "Bearer [REDACTED]")
    .replace(/ya29\.[A-Za-z0-9_.-]+/gi, "[REDACTED_TOKEN]");
}

/**
 * Maps YouTube Data API error responses to sanitized SocialError.
 */
export function mapYouTubeApiError(error: unknown): SocialError {
  if (error instanceof SocialError) return error;

  const errObj = error as any;
  const errorData = errObj?.error || errObj;
  const status =
    errObj?.status ||
    errObj?.statusCode ||
    errorData?.code ||
    (typeof errObj?.code === "number" ? errObj.code : 500);
  const reason = errorData?.errors?.[0]?.reason || "";
  const rawMessage = errorData?.message || errObj?.message || "YouTube API error.";
  const message = sanitizeErrorMessage(rawMessage);

  let code: SocialErrorCode = "SOCIAL_API_ERROR";
  let userActionRequired = false;
  let retryable = false;

  if (status === 400 || reason === "badRequest" || reason === "invalidArgument") {
    code = "SOCIAL_INVALID_REQUEST";
  } else if (status === 401 || reason === "authError" || reason === "unauthorized") {
    code = "SOCIAL_AUTH_REQUIRED";
    userActionRequired = true;
  } else if (
    status === 403 ||
    reason === "quotaExceeded" ||
    reason === "dailyLimitExceeded" ||
    reason === "rateLimitExceeded" ||
    message.toLowerCase().includes("quota") ||
    message.toLowerCase().includes("rate limit")
  ) {
    if (
      reason === "quotaExceeded" ||
      reason === "dailyLimitExceeded" ||
      reason === "rateLimitExceeded" ||
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("rate limit")
    ) {
      code = "SOCIAL_RATE_LIMITED";
      retryable = true;
    } else {
      code = "SOCIAL_PERMISSION_MISSING";
      userActionRequired = true;
    }
  } else if (status === 404 || reason === "channelNotFound") {
    code = "SOCIAL_ACCOUNT_RESTRICTED";
  } else if (status === 429) {
    code = "SOCIAL_RATE_LIMITED";
    retryable = true;
  } else if (status >= 500 || reason === "backendError") {
    code = "SOCIAL_API_ERROR";
    retryable = true;
  }

  let finalMessage = message;
  if (message.toLowerCase().includes("insufficient authentication scopes")) {
    finalMessage =
      "Request had insufficient authentication scopes. Please reconnect your YouTube channel to grant comment permissions.";
  }

  return new SocialError(finalMessage, code, {
    provider: "YOUTUBE",
    statusCode: typeof status === "number" ? status : 500,
    userActionRequired,
    retryable,
    cause: error,
  });
}

/**
 * Maps YouTube Analytics API v2 error responses to sanitized SocialError.
 */
export function mapYouTubeAnalyticsApiError(error: unknown): SocialError {
  if (error instanceof SocialError) return error;

  const errObj = error as any;
  const errorData = errObj?.error || errObj;
  const status =
    errObj?.status ||
    errObj?.statusCode ||
    errorData?.code ||
    (typeof errObj?.code === "number" ? errObj.code : 500);
  const reason = errorData?.errors?.[0]?.reason || "";
  const rawMessage = errorData?.message || errObj?.message || "YouTube Analytics API error.";
  const message = sanitizeErrorMessage(rawMessage);

  let code: SocialErrorCode = "SOCIAL_API_ERROR";
  let userActionRequired = false;
  let retryable = false;

  if (
    status === 400 ||
    reason === "invalidCombination" ||
    reason === "badRequest" ||
    reason === "invalidArgument" ||
    message.toLowerCase().includes("combination") ||
    message.toLowerCase().includes("invalid query")
  ) {
    code = "SOCIAL_INVALID_REQUEST";
  } else if (status === 401 || reason === "authError" || reason === "unauthorized") {
    code = "SOCIAL_AUTH_REQUIRED";
    userActionRequired = true;
  } else if (status === 403) {
    if (
      reason === "quotaExceeded" ||
      reason === "rateLimitExceeded" ||
      reason === "userRateLimitExceeded" ||
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("rate limit")
    ) {
      code = "SOCIAL_RATE_LIMITED";
      retryable = true;
    } else {
      code = "SOCIAL_PERMISSION_MISSING";
      userActionRequired = true;
    }
  } else if (status === 404 || reason === "channelNotFound") {
    code = "SOCIAL_ACCOUNT_RESTRICTED";
  } else if (status === 429) {
    code = "SOCIAL_RATE_LIMITED";
    retryable = true;
  } else if (status >= 500 || reason === "backendError") {
    code = "SOCIAL_API_ERROR";
    retryable = true;
  }

  return new SocialError(message, code, {
    provider: "YOUTUBE",
    statusCode: typeof status === "number" ? status : 500,
    userActionRequired,
    retryable,
    cause: error,
  });
}

