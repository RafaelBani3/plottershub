import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { AnalyticsObservation, MetricValue } from "../types";
import { AnalyticsObservationProjection } from "./analytics.types";

/**
 * Computes a fixed-width SHA-256 hex digest for a canonical identity key.
 * SHA-256 provides a fixed-width deterministic identity hash with negligible collision probability for this application.
 */
export function calculateIdentityHash(identityKey: string): string {
  return crypto.createHash("sha256").update(identityKey, "utf8").digest("hex");
}

/**
 * Safely parses a MetricValue into a BigInt while strictly preserving NULL != 0 semantics.
 * If val is explicit 0, 0n, or "0" -> returns 0n.
 * If val is null or undefined -> returns null.
 */
export function parseBigIntValue(val: MetricValue | undefined): bigint | null {
  if (val === undefined || val === null || val === "") {
    return null;
  }
  if (typeof val === "bigint") {
    return val;
  }
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return null;
    return BigInt(Math.floor(val));
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "" || !/^-?\d+$/.test(trimmed)) {
      return null;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Safely parses a MetricValue into an integer number (e.g. duration seconds).
 * Strictly preserves NULL vs 0 semantics.
 */
export function parseIntValue(val: MetricValue | undefined): number | null {
  if (val === undefined || val === null || val === "") {
    return null;
  }
  if (typeof val === "number") {
    return Number.isFinite(val) ? Math.floor(val) : null;
  }
  if (typeof val === "string") {
    const parsed = parseInt(val.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof val === "bigint") {
    return Number(val);
  }
  return null;
}

/**
 * Safely parses a MetricValue into a Prisma Decimal (e.g. percentages, rates).
 * Strictly preserves NULL vs 0 semantics without floating-point precision loss.
 */
export function parseDecimalValue(val: MetricValue | undefined): Prisma.Decimal | null {
  if (val === undefined || val === null || val === "") {
    return null;
  }
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return null;
    return new Prisma.Decimal(val.toString());
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return null;
    try {
      return new Prisma.Decimal(trimmed);
    } catch {
      return null;
    }
  }
  if (typeof val === "bigint") {
    return new Prisma.Decimal(val.toString());
  }
  return null;
}

/**
 * Converts a MetricValue dictionary into a lossless JSON-serializable dictionary.
 * BigInt counts are preserved as string integers to prevent IEEE 754 precision loss.
 */
export function buildLosslessJsonMetrics(
  metrics: Record<string, MetricValue>
): Record<string, string | number | null> {
  const jsonMetrics: Record<string, string | number | null> = {};

  for (const [key, val] of Object.entries(metrics)) {
    if (val === null || val === undefined) {
      jsonMetrics[key] = null;
    } else if (typeof val === "bigint") {
      jsonMetrics[key] = val.toString();
    } else if (typeof val === "number") {
      jsonMetrics[key] = val;
    } else if (typeof val === "string") {
      jsonMetrics[key] = val;
    } else {
      jsonMetrics[key] = String(val);
    }
  }

  return jsonMetrics;
}

/**
 * Parses a YYYY-MM-DD date string into a UTC Date object at 00:00:00.000Z.
 */
export function parseIsoDateToUtc(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map((part) => parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Transforms a normalized AnalyticsObservation domain object into the persistence projection.
 * Follows the invariant:
 *   Domain AnalyticsObservation -> [metrics JSONB projection + promoted relational columns projection]
 * Both projections are generated simultaneously in a single normalization step.
 */
export function buildAnalyticsProjections(
  observation: AnalyticsObservation,
  options: {
    workspaceId: string;
    socialAccountId: string;
    syncJobId?: string | null;
    dataLagDays?: number | null;
  }
): AnalyticsObservationProjection {
  const identityHash = calculateIdentityHash(observation.identityKey);

  // Extract external content identifier from dimensions if present
  let externalContentId: string | null = null;
  if (observation.dimensions?.video) {
    externalContentId = String(observation.dimensions.video);
  } else if (observation.dimensions?.externalContentId) {
    externalContentId = String(observation.dimensions.externalContentId);
  }

  const startDate = parseIsoDateToUtc(observation.startDate);
  const endDate = parseIsoDateToUtc(observation.endDate);
  const observationDate = observation.observationDate
    ? parseIsoDateToUtc(observation.observationDate)
    : null;

  // Lossless JSONB projection
  const jsonMetrics = buildLosslessJsonMetrics(observation.metrics);

  // Promoted relational columns projection
  const views = parseBigIntValue(observation.metrics.views);
  const estimatedMinutesWatched = parseBigIntValue(observation.metrics.estimatedMinutesWatched);
  const averageViewDuration = parseIntValue(observation.metrics.averageViewDuration);
  const averageViewPercentage = parseDecimalValue(observation.metrics.averageViewPercentage);
  const likes = parseBigIntValue(observation.metrics.likes);
  const comments = parseBigIntValue(observation.metrics.comments);
  const shares = parseBigIntValue(observation.metrics.shares);
  const saves = parseBigIntValue(observation.metrics.saves);
  const subscribersGained = parseBigIntValue(observation.metrics.subscribersGained);
  const subscribersLost = parseBigIntValue(observation.metrics.subscribersLost);
  const engagementRate = parseDecimalValue(observation.metrics.engagementRate);

  return {
    workspaceId: options.workspaceId,
    socialAccountId: options.socialAccountId,
    externalAccountId: observation.externalAccountId || null,
    externalContentId,
    provider: observation.provider,
    source: observation.source,
    queryPattern: observation.queryPattern,
    granularity: observation.granularity,
    startDate,
    endDate,
    observationDate,
    identityKey: observation.identityKey,
    identityHash,
    dimensions: observation.dimensions || null,
    metrics: jsonMetrics,
    views,
    estimatedMinutesWatched,
    averageViewDuration,
    averageViewPercentage,
    likes,
    comments,
    shares,
    saves,
    subscribersGained,
    subscribersLost,
    engagementRate,
    capturedAt: observation.capturedAt || new Date(),
    syncJobId: options.syncJobId || null,
    dataLagDays: options.dataLagDays || null,
  };
}
