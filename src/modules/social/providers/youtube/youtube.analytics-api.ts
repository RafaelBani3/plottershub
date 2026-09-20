import {
  YouTubeAnalyticsQueryOptions,
  YouTubeAnalyticsResultTable,
  YouTubeAnalyticsRetryConfig,
} from "./youtube.types";
import { mapYouTubeAnalyticsApiError } from "./youtube.errors";
import { SocialError } from "../../errors";

export const YOUTUBE_ANALYTICS_METHOD_REPORTS_QUERY = "reports.query";
export const YOUTUBE_ANALYTICS_QUOTA_COST_REPORTS_QUERY = 1;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class YouTubeAnalyticsApiClient {
  private baseUrl: string;
  private defaultRetryConfig: Required<YouTubeAnalyticsRetryConfig>;
  private fetchFn: typeof fetch;

  constructor(
    baseUrl = "https://youtubeanalytics.googleapis.com/v2",
    defaultRetryConfig: YouTubeAnalyticsRetryConfig = {},
    fetchFn: typeof fetch = globalThis.fetch
  ) {
    this.baseUrl = baseUrl;
    this.defaultRetryConfig = {
      maxRetries: defaultRetryConfig.maxRetries ?? 3,
      initialDelayMs: defaultRetryConfig.initialDelayMs ?? 500,
      maxDelayMs: defaultRetryConfig.maxDelayMs ?? 4000,
      timeoutMs: defaultRetryConfig.timeoutMs ?? 15000,
    };
    this.fetchFn = fetchFn;
  }

  /**
   * Validates query options prior to HTTP request dispatch.
   */
  private validateQuery(query: YouTubeAnalyticsQueryOptions): void {
    if (!query.ids || typeof query.ids !== "string" || query.ids.trim().length === 0) {
      throw new SocialError(
        "Missing or invalid 'ids' parameter for YouTube Analytics query (e.g., 'channel==MINE').",
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    if (!query.startDate || !DATE_REGEX.test(query.startDate)) {
      throw new SocialError(
        `Invalid 'startDate': '${query.startDate}'. Must be formatted as YYYY-MM-DD.`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    if (!query.endDate || !DATE_REGEX.test(query.endDate)) {
      throw new SocialError(
        `Invalid 'endDate': '${query.endDate}'. Must be formatted as YYYY-MM-DD.`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    const start = new Date(query.startDate);
    const end = new Date(query.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || query.startDate > query.endDate) {
      throw new SocialError(
        `Invalid date interval: 'startDate' (${query.startDate}) must not be after 'endDate' (${query.endDate}).`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    const metricsStr = Array.isArray(query.metrics)
      ? query.metrics.filter(Boolean).join(",")
      : query.metrics?.trim();

    if (!metricsStr || metricsStr.length === 0) {
      throw new SocialError(
        "Missing required 'metrics' parameter for YouTube Analytics query.",
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    if (query.maxResults !== undefined) {
      if (!Number.isInteger(query.maxResults) || query.maxResults < 1 || query.maxResults > 200) {
        throw new SocialError(
          `Invalid 'maxResults': ${query.maxResults}. Must be an integer between 1 and 200.`,
          "SOCIAL_INVALID_REQUEST",
          { provider: "YOUTUBE", statusCode: 400 }
        );
      }
    }

    if (query.startIndex !== undefined) {
      if (!Number.isInteger(query.startIndex) || query.startIndex < 1) {
        throw new SocialError(
          `Invalid 'startIndex': ${query.startIndex}. Must be an integer greater than or equal to 1.`,
          "SOCIAL_INVALID_REQUEST",
          { provider: "YOUTUBE", statusCode: 400 }
        );
      }
    }
  }

  /**
   * Constructs search parameters safely using URLSearchParams without exposing credentials.
   */
  private buildUrl(query: YouTubeAnalyticsQueryOptions): URL {
    const url = new URL(`${this.baseUrl}/reports`);

    url.searchParams.set("ids", query.ids);
    url.searchParams.set("startDate", query.startDate);
    url.searchParams.set("endDate", query.endDate);

    const metricsStr = Array.isArray(query.metrics)
      ? query.metrics.filter(Boolean).join(",")
      : query.metrics;
    url.searchParams.set("metrics", metricsStr);

    if (query.dimensions) {
      const dimensionsStr = Array.isArray(query.dimensions)
        ? query.dimensions.filter(Boolean).join(",")
        : query.dimensions;
      if (dimensionsStr.trim().length > 0) {
        url.searchParams.set("dimensions", dimensionsStr);
      }
    }

    if (query.filters && query.filters.trim().length > 0) {
      url.searchParams.set("filters", query.filters.trim());
    }

    if (query.sort) {
      const sortStr = Array.isArray(query.sort)
        ? query.sort.filter(Boolean).join(",")
        : query.sort;
      if (sortStr.trim().length > 0) {
        url.searchParams.set("sort", sortStr);
      }
    }

    if (query.maxResults !== undefined) {
      url.searchParams.set("maxResults", String(query.maxResults));
    }

    if (query.startIndex !== undefined) {
      url.searchParams.set("startIndex", String(query.startIndex));
    }

    if (query.includeHistoricalChannelData !== undefined) {
      url.searchParams.set("includeHistoricalChannelData", String(query.includeHistoricalChannelData));
    }

    return url;
  }

  /**
   * Queries the YouTube Analytics API v2 reports.query endpoint with OAuth Bearer token,
   * request validation, error mapping, and bounded exponential backoff.
   */
  async queryReport(
    accessToken: string,
    query: YouTubeAnalyticsQueryOptions,
    customRetryConfig?: YouTubeAnalyticsRetryConfig
  ): Promise<YouTubeAnalyticsResultTable> {
    if (!accessToken || typeof accessToken !== "string" || accessToken.trim().length === 0) {
      throw new SocialError(
        "Access token is required to query YouTube Analytics API.",
        "SOCIAL_AUTH_REQUIRED",
        {
          provider: "YOUTUBE",
          statusCode: 401,
          userActionRequired: true,
        }
      );
    }

    this.validateQuery(query);

    const url = this.buildUrl(query);
    const retryConfig = {
      maxRetries: customRetryConfig?.maxRetries ?? this.defaultRetryConfig.maxRetries,
      initialDelayMs: customRetryConfig?.initialDelayMs ?? this.defaultRetryConfig.initialDelayMs,
      maxDelayMs: customRetryConfig?.maxDelayMs ?? this.defaultRetryConfig.maxDelayMs,
      timeoutMs: customRetryConfig?.timeoutMs ?? this.defaultRetryConfig.timeoutMs,
    };

    let attempt = 0;

    while (attempt <= retryConfig.maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), retryConfig.timeoutMs);

      try {
        const response = await this.fetchFn(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data: YouTubeAnalyticsResultTable = await response.json();
          if (data.error) {
            throw mapYouTubeAnalyticsApiError(data);
          }
          return {
            kind: data.kind || "youtubeAnalytics#resultTable",
            columnHeaders: data.columnHeaders || [],
            rows: data.rows || [],
          };
        }

        // Parse error payload safely
        let errorData: any = null;
        try {
          errorData = await response.json();
        } catch {
          errorData = { code: response.status, message: response.statusText };
        }

        const isRetryable =
          response.status === 429 ||
          (response.status >= 500 && response.status <= 504);

        if (isRetryable && attempt < retryConfig.maxRetries) {
          attempt++;
          const jitter = Math.floor(Math.random() * 100);
          const delay = Math.min(
            retryConfig.maxDelayMs,
            retryConfig.initialDelayMs * Math.pow(2, attempt - 1) + jitter
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw mapYouTubeAnalyticsApiError({
          ...errorData,
          status: response.status,
        });
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err instanceof SocialError) {
          throw err;
        }

        const isAbortError = err?.name === "AbortError" || err?.name === "TimeoutError";

        if (attempt < retryConfig.maxRetries) {
          attempt++;
          const jitter = Math.floor(Math.random() * 100);
          const delay = Math.min(
            retryConfig.maxDelayMs,
            retryConfig.initialDelayMs * Math.pow(2, attempt - 1) + jitter
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (isAbortError) {
          throw new SocialError(
            "YouTube Analytics API request timed out.",
            "SOCIAL_API_ERROR",
            {
              provider: "YOUTUBE",
              statusCode: 504,
              retryable: true,
              cause: err,
            }
          );
        }

        throw mapYouTubeAnalyticsApiError(err);
      }
    }

    throw new SocialError(
      "YouTube Analytics API request failed after retry exhaustion.",
      "SOCIAL_API_ERROR",
      {
        provider: "YOUTUBE",
        statusCode: 500,
        retryable: true,
      }
    );
  }
}
