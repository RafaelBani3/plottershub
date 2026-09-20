import {
  AnalyticsObservation,
  MetricGranularity,
  MetricSource,
  MetricValue,
  PlatformCode,
} from "../../types";
import { SocialError } from "../../errors";
import { YouTubeAnalyticsResultTable } from "./youtube.types";
import { ObservationMappingContext } from "./youtube.analytics.types";
import { YouTubeMapper } from "./youtube.mapper";

/**
 * Builds a deterministic canonical observation identity key.
 * Formats multi-dimensional attributes into an alphabetically sorted, order-independent token.
 */
export function buildObservationIdentityKey(params: {
  provider: PlatformCode;
  source: MetricSource;
  socialAccountId?: string;
  externalAccountId?: string;
  queryPattern: string;
  granularity: MetricGranularity;
  startDate: string;
  endDate: string;
  observationDate?: string | null;
  dimensions?: Record<string, string | null>;
}): string {
  const accountToken = params.socialAccountId || params.externalAccountId || "account";
  const obsDateToken = params.observationDate || "agg";

  let canonicalDimensions = "none";
  if (params.dimensions && Object.keys(params.dimensions).length > 0) {
    const nonDayKeys = Object.keys(params.dimensions)
      .filter((k) => k !== "day")
      .sort();

    if (nonDayKeys.length > 0) {
      canonicalDimensions = nonDayKeys
        .map((k) => `${k}=${params.dimensions![k] ?? "null"}`)
        .join(",");
    }
  }

  return `${params.provider}:${params.source}:${accountToken}:${params.queryPattern}:${params.granularity}:${params.startDate}:${params.endDate}:${obsDateToken}:${canonicalDimensions}`;
}

export class YouTubeAnalyticsMapper {
  /**
   * Safely parses a float/decimal number preserving strict NULL vs 0 semantics.
   */
  static parseFloatOrNull(val: unknown): number | null {
    if (val === undefined || val === null || val === "") {
      return null;
    }

    if (typeof val === "number") {
      return Number.isFinite(val) ? val : null;
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return null;
      const parsed = parseFloat(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  /**
   * Safely parses an integer number (e.g. duration in seconds) preserving strict NULL vs 0 semantics.
   */
  static parseIntOrNull(val: unknown): number | null {
    if (val === undefined || val === null || val === "") {
      return null;
    }

    if (typeof val === "number") {
      return Number.isFinite(val) ? Math.floor(val) : null;
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return null;
      const parsed = parseInt(trimmed, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  /**
   * Maps a raw YouTube Analytics ResultTable dynamically using columnHeaders.
   * Handles arbitrary column positions, multi-dimensional attributes, BigInt counts,
   * floating point percentages, and strict NULL != 0 precision.
   */
  static mapResultTableToObservations(
    resultTable: YouTubeAnalyticsResultTable,
    context: ObservationMappingContext
  ): AnalyticsObservation[] {
    if (!resultTable || !Array.isArray(resultTable.columnHeaders)) {
      throw new SocialError(
        "Invalid or missing columnHeaders in YouTube Analytics result table.",
        "SOCIAL_API_ERROR",
        { provider: "YOUTUBE", statusCode: 500 }
      );
    }

    const rows = resultTable.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const headers = resultTable.columnHeaders;
    const provider: PlatformCode = context.provider || "YOUTUBE";
    const source: MetricSource = context.source || "ANALYTICS_API";
    const capturedAt = context.capturedAt || new Date();

    const observations: AnalyticsObservation[] = [];

    for (const row of rows) {
      if (!Array.isArray(row)) {
        continue;
      }

      const dimensions: Record<string, string | null> = {};
      const metrics: Record<string, MetricValue> = {};
      let observationDate: string | null = null;

      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const rawValue = row[i];

        if (header.columnType === "DIMENSION") {
          const stringVal = rawValue !== null && rawValue !== undefined ? String(rawValue) : null;
          dimensions[header.name] = stringVal;

          if (header.name === "day" && stringVal) {
            observationDate = stringVal;
          }
        } else if (header.columnType === "METRIC") {
          // Identify appropriate type conversion based on header name and dataType
          if (
            header.name === "averageViewDuration"
          ) {
            metrics[header.name] = YouTubeAnalyticsMapper.parseIntOrNull(rawValue);
          } else if (
            header.name === "averageViewPercentage" ||
            header.name === "viewerPercentage" ||
            header.dataType === "FLOAT"
          ) {
            metrics[header.name] = YouTubeAnalyticsMapper.parseFloatOrNull(rawValue);
          } else {
            // Default count metrics: views, likes, comments, shares, subscribersGained, subscribersLost, estimatedMinutesWatched
            metrics[header.name] = YouTubeMapper.parseBigIntOrNull(
              rawValue as string | number | bigint | undefined | null
            );
          }
        }
      }

      const identityKey = buildObservationIdentityKey({
        provider,
        source,
        socialAccountId: context.socialAccountId,
        externalAccountId: context.externalAccountId,
        queryPattern: context.queryPattern,
        granularity: context.granularity,
        startDate: context.startDate,
        endDate: context.endDate,
        observationDate,
        dimensions: Object.keys(dimensions).length > 0 ? dimensions : undefined,
      });

      observations.push({
        identityKey,
        provider,
        source,
        socialAccountId: context.socialAccountId,
        externalAccountId: context.externalAccountId,
        queryPattern: context.queryPattern,
        granularity: context.granularity,
        startDate: context.startDate,
        endDate: context.endDate,
        observationDate,
        dimensions: Object.keys(dimensions).length > 0 ? dimensions : undefined,
        metrics,
        capturedAt,
      });
    }

    return observations;
  }
}
