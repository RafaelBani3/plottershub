import { SocialError } from "../../errors";
import {
  YouTubeAnalyticsPlanRequest,
  YouTubeAnalyticsPlanResult,
  YOUTUBE_QUERY_PATTERN_DEFINITIONS,
  YOUTUBE_DEFERRED_OR_UNSUPPORTED_METRICS,
} from "./youtube.analytics.types";
import { YouTubeAnalyticsQueryOptions } from "./youtube.types";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_.-]+$/;

export class YouTubeAnalyticsReportPlanner {
  /**
   * Helper to format a Date instance as YYYY-MM-DD in UTC.
   */
  private static formatDateUTC(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Helper to parse a YYYY-MM-DD string into a UTC Date.
   */
  private static parseDateUTC(dateStr: string): Date {
    const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
    return new Date(Date.UTC(year, month - 1, day));
  }

  /**
   * Plans and validates a YouTube Analytics reports.query execution for a given product Query Pattern.
   * Enforces official Google API compatibility, date validation, and configurable lag policies.
   */
  planReport(request: YouTubeAnalyticsPlanRequest): YouTubeAnalyticsPlanResult {
    // 1. Validate Date Formats
    if (!request.startDate || !ISO_DATE_REGEX.test(request.startDate)) {
      throw new SocialError(
        `Invalid startDate: '${request.startDate}'. Must be formatted as YYYY-MM-DD.`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    if (!request.endDate || !ISO_DATE_REGEX.test(request.endDate)) {
      throw new SocialError(
        `Invalid endDate: '${request.endDate}'. Must be formatted as YYYY-MM-DD.`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    if (request.startDate > request.endDate) {
      throw new SocialError(
        `Invalid date interval: startDate (${request.startDate}) must not be after endDate (${request.endDate}).`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    // 2. Validate & Apply Configurable Data Lag Policy
    const lagDays = request.analyticsDataLagDays ?? 2;
    if (lagDays < 0 || !Number.isInteger(lagDays)) {
      throw new SocialError(
        `Invalid analyticsDataLagDays: ${lagDays}. Must be a non-negative integer.`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    const clockDate = request.currentDate
      ? typeof request.currentDate === "string"
        ? YouTubeAnalyticsReportPlanner.parseDateUTC(request.currentDate)
        : request.currentDate
      : new Date();

    const effectiveMaxDateObj = new Date(clockDate.getTime());
    effectiveMaxDateObj.setUTCDate(effectiveMaxDateObj.getUTCDate() - lagDays);
    const effectiveMaxDate = YouTubeAnalyticsReportPlanner.formatDateUTC(effectiveMaxDateObj);

    let effectiveEndDate = request.endDate;
    const lagPolicy = request.lagPolicy ?? "CLAMP";

    if (request.endDate > effectiveMaxDate) {
      if (lagPolicy === "REJECT") {
        throw new SocialError(
          `Analytics data for requested end date '${request.endDate}' is not yet available due to provider data lag (latest available: '${effectiveMaxDate}').`,
          "SOCIAL_INVALID_REQUEST",
          { provider: "YOUTUBE", statusCode: 400 }
        );
      } else {
        // CLAMP policy: automatically clamp to latest available date
        effectiveEndDate = effectiveMaxDate;
        if (request.startDate > effectiveEndDate) {
          throw new SocialError(
            `Requested startDate '${request.startDate}' is after the effective lag-clamped endDate '${effectiveEndDate}' (lag: ${lagDays} days).`,
            "SOCIAL_INVALID_REQUEST",
            { provider: "YOUTUBE", statusCode: 400 }
          );
        }
      }
    }

    // 3. Resolve & Validate Query Pattern Definition
    if (!request.queryPattern || !YOUTUBE_QUERY_PATTERN_DEFINITIONS[request.queryPattern]) {
      throw new SocialError(
        `Unknown or unsupported YouTube analytics query pattern: '${request.queryPattern}'.`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    const definition = YOUTUBE_QUERY_PATTERN_DEFINITIONS[request.queryPattern];

    // 4. Validate Metrics & Guard Against Deferred Metrics
    const rawMetrics = request.metrics
      ? Array.isArray(request.metrics)
        ? request.metrics
        : request.metrics.split(",").map((m) => m.trim()).filter(Boolean)
      : [...definition.defaultMetrics];

    if (rawMetrics.length === 0) {
      throw new SocialError(
        `Metrics list cannot be empty for query pattern '${request.queryPattern}'.`,
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE", statusCode: 400 }
      );
    }

    for (const metric of rawMetrics) {
      if (YOUTUBE_DEFERRED_OR_UNSUPPORTED_METRICS.includes(metric)) {
        throw new SocialError(
          `Metric '${metric}' is not supported via YouTube Analytics reports.query (deferred to YouTube Reporting API / future phase).`,
          "SOCIAL_INVALID_REQUEST",
          { provider: "YOUTUBE", statusCode: 400 }
        );
      }

      if (!definition.allowedMetrics.includes(metric)) {
        throw new SocialError(
          `Metric '${metric}' is not supported for query pattern '${request.queryPattern}'. Allowed metrics: ${definition.allowedMetrics.join(", ")}.`,
          "SOCIAL_INVALID_REQUEST",
          { provider: "YOUTUBE", statusCode: 400 }
        );
      }
    }

    // 5. Validate Dimensions
    const rawDimensions = request.dimensions
      ? Array.isArray(request.dimensions)
        ? request.dimensions
        : request.dimensions.split(",").map((d) => d.trim()).filter(Boolean)
      : [...definition.defaultDimensions];

    for (const dim of rawDimensions) {
      if (!definition.allowedDimensions.includes(dim)) {
        throw new SocialError(
          `Dimension '${dim}' is not supported for query pattern '${request.queryPattern}'. Allowed dimensions: ${definition.allowedDimensions.join(", ")}.`,
          "SOCIAL_INVALID_REQUEST",
          { provider: "YOUTUBE", statusCode: 400 }
        );
      }
    }

    // 6. Validate & Normalize Filters
    let normalizedFilters: string | undefined = undefined;
    const parsedFilters: Record<string, string> = {};

    if (request.filters) {
      if (typeof request.filters === "string") {
        const filterStr = request.filters.trim();
        if (filterStr.length > 0) {
          const tokens = filterStr.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
          for (const token of tokens) {
            const match = token.match(/^([a-zA-Z0-9_]+)==([a-zA-Z0-9_.-]+)$/);
            if (!match) {
              throw new SocialError(
                `Invalid or malformed filter expression: '${token}'. Expected format 'dimension==value'.`,
                "SOCIAL_INVALID_REQUEST",
                { provider: "YOUTUBE", statusCode: 400 }
              );
            }
            const [, key, val] = match;
            parsedFilters[key] = val;
          }
        }
      } else if (typeof request.filters === "object") {
        for (const [key, val] of Object.entries(request.filters)) {
          if (!key || typeof val !== "string" || !SAFE_ID_REGEX.test(val.trim())) {
            throw new SocialError(
              `Invalid filter value for '${key}': '${val}'. Must contain only safe alphanumeric characters.`,
              "SOCIAL_INVALID_REQUEST",
              { provider: "YOUTUBE", statusCode: 400 }
            );
          }
          parsedFilters[key.trim()] = val.trim();
        }
      }
    }

    // Validate parsed filter keys against allowedFilters
    const allowedFilters = definition.allowedFilters || [];
    for (const filterKey of Object.keys(parsedFilters)) {
      if (!allowedFilters.includes(filterKey)) {
        throw new SocialError(
          `Filter '${filterKey}' is not supported for query pattern '${request.queryPattern}'. Allowed filters: ${allowedFilters.length ? allowedFilters.join(", ") : "none"}.`,
          "SOCIAL_INVALID_REQUEST",
          { provider: "YOUTUBE", statusCode: 400 }
        );
      }
    }

    // Validate required filters
    if (definition.requiresFilter) {
      for (const requiredKey of definition.requiresFilter) {
        if (!parsedFilters[requiredKey]) {
          throw new SocialError(
            `Query pattern '${request.queryPattern}' requires a filter for '${requiredKey}' (e.g. '${requiredKey}==<VALUE>').`,
            "SOCIAL_INVALID_REQUEST",
            { provider: "YOUTUBE", statusCode: 400 }
          );
        }
      }
    }

    if (Object.keys(parsedFilters).length > 0) {
      normalizedFilters = Object.entries(parsedFilters)
        .map(([k, v]) => `${k}==${v}`)
        .join(";");
    }

    // 7. Validate Sort
    let normalizedSort: string[] | undefined = undefined;
    if (request.sort) {
      const sortList = Array.isArray(request.sort)
        ? request.sort
        : request.sort.split(",").map((s) => s.trim()).filter(Boolean);

      for (const s of sortList) {
        const cleanField = s.startsWith("-") ? s.substring(1) : s;
        const isValid =
          rawMetrics.includes(cleanField) ||
          rawDimensions.includes(cleanField) ||
          definition.allowedMetrics.includes(cleanField) ||
          definition.allowedDimensions.includes(cleanField);

        if (!isValid) {
          throw new SocialError(
            `Invalid sort field '${s}' for query pattern '${request.queryPattern}'. Must match a valid metric or dimension.`,
            "SOCIAL_INVALID_REQUEST",
            { provider: "YOUTUBE", statusCode: 400 }
          );
        }
      }
      normalizedSort = sortList;
    } else if (definition.defaultSort) {
      normalizedSort = [...definition.defaultSort];
    }

    // 8. Validate maxResults & startIndex
    let effectiveMaxResults: number | undefined = request.maxResults ?? definition.defaultMaxResults;
    if (effectiveMaxResults !== undefined) {
      if (!Number.isInteger(effectiveMaxResults) || effectiveMaxResults < 1 || effectiveMaxResults > 200) {
        throw new SocialError(
          `Invalid maxResults: ${effectiveMaxResults}. Must be an integer between 1 and 200.`,
          "SOCIAL_INVALID_REQUEST",
          { provider: "YOUTUBE", statusCode: 400 }
        );
      }
      if (definition.maxResultsLimit && effectiveMaxResults > definition.maxResultsLimit) {
        effectiveMaxResults = definition.maxResultsLimit;
      }
    }

    if (request.startIndex !== undefined) {
      if (!Number.isInteger(request.startIndex) || request.startIndex < 1) {
        throw new SocialError(
          `Invalid startIndex: ${request.startIndex}. Must be an integer >= 1.`,
          "SOCIAL_INVALID_REQUEST",
          { provider: "YOUTUBE", statusCode: 400 }
        );
      }
    }

    // 9. Build Strongly-Typed QueryOptions
    const queryOptions: YouTubeAnalyticsQueryOptions = {
      ids: request.ids || "channel==MINE",
      startDate: request.startDate,
      endDate: effectiveEndDate,
      metrics: rawMetrics.join(","),
      dimensions: rawDimensions.length > 0 ? rawDimensions.join(",") : undefined,
      filters: normalizedFilters,
      sort: normalizedSort && normalizedSort.length > 0 ? normalizedSort.join(",") : undefined,
      maxResults: effectiveMaxResults,
      startIndex: request.startIndex,
      includeHistoricalChannelData: request.includeHistoricalChannelData,
    };

    return {
      queryOptions,
      queryPattern: request.queryPattern,
      granularity: definition.granularity,
      effectiveStartDate: request.startDate,
      effectiveEndDate,
      method: "reports.query",
    };
  }
}
