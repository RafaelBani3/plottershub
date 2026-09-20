import {
  MetricGranularity,
  MetricSource,
  MetricValue,
  PlatformCode,
} from "../types";
import { Prisma } from "@prisma/client";

export type { MetricGranularity, MetricSource };

/**
 * Database-level projection structure for persisting an AnalyticsObservation.
 * Guarantees synchronized JSONB metrics and promoted relational column projections.
 */
export interface AnalyticsObservationProjection {
  workspaceId: string;
  socialAccountId: string;
  externalAccountId?: string | null;
  externalContentId?: string | null;
  provider: PlatformCode;
  source: MetricSource;
  queryPattern: string;
  granularity: MetricGranularity;
  startDate: Date;
  endDate: Date;
  observationDate?: Date | null;
  identityKey: string;
  identityHash: string;
  dimensions?: Record<string, string | null> | null;
  metrics: Record<string, string | number | null>;
  views?: bigint | null;
  estimatedMinutesWatched?: bigint | null;
  averageViewDuration?: number | null;
  averageViewPercentage?: Prisma.Decimal | null;
  likes?: bigint | null;
  comments?: bigint | null;
  shares?: bigint | null;
  saves?: bigint | null;
  subscribersGained?: bigint | null;
  subscribersLost?: bigint | null;
  engagementRate?: Prisma.Decimal | null;
  capturedAt: Date;
  syncJobId?: string | null;
  dataLagDays?: number | null;
}

/**
 * Filter criteria for querying persisted analytics observations.
 * Every query MUST be scoped to a specific workspaceId for tenant isolation.
 */
export interface AnalyticsQueryFilters {
  workspaceId: string;
  socialAccountId?: string;
  externalContentId?: string;
  provider?: PlatformCode;
  source?: MetricSource;
  queryPattern?: string;
  granularity?: MetricGranularity;
  startDate?: string | Date;
  endDate?: string | Date;
  observationStartDate?: string | Date;
  observationEndDate?: string | Date;
  limit?: number;
  offset?: number;
}

/**
 * JSON-serializable representation of a persisted AnalyticsObservation.
 * Safely converts BigInt and Decimal fields to string/number for API responses.
 */
export interface SerializedAnalyticsObservation {
  id: string;
  workspaceId: string;
  socialAccountId: string;
  externalAccountId: string | null;
  externalContentId: string | null;
  provider: string;
  source: string;
  queryPattern: string;
  granularity: string;
  startDate: string;
  endDate: string;
  observationDate: string | null;
  identityKey: string;
  identityHash: string;
  dimensions: Record<string, string | null> | null;
  metrics: Record<string, MetricValue>;
  views: string | null;
  estimatedMinutesWatched: string | null;
  averageViewDuration: number | null;
  averageViewPercentage: string | null;
  likes: string | null;
  comments: string | null;
  shares: string | null;
  saves: string | null;
  subscribersGained: string | null;
  subscribersLost: string | null;
  engagementRate: string | null;
  capturedAt: string;
  syncJobId: string | null;
  dataLagDays: number | null;
}
