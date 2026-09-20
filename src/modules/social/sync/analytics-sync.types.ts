/**
 * Phase 3.3D — YouTube Analytics Sync Service Type Definitions
 */

export type AnalyticsSyncMode = "DAILY" | "BACKFILL";

export type PatternExecutionStatus =
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED_BUDGET"
  | "SKIPPED_NOT_SUPPORTED"
  | "EMPTY"
  | "REAUTH_REQUIRED";

export interface AnalyticsPatternResult {
  pattern: string;
  status: PatternExecutionStatus;
  requests: number;
  observations: number;
  errorCode?: string;
  warning?: string;
  durationMs: number;
}

export interface AnalyticsSyncOptions {
  workspaceId: string;
  socialAccountId: string;
  actorUserId?: string | null;
  mode?: AnalyticsSyncMode;
  triggerMode?: "MANUAL" | "SCHEDULED";
  startDate?: string;
  endDate?: string;
  videoIds?: string[];
  maxRequestsBudget?: number; // Application request safety budget (default: 100)
  topVideosLimit?: number; // default: 10
  recentVideoDays?: number; // default: 14
  analyticsDataLagDays?: number; // default: 2
  lagPolicy?: "CLAMP" | "REJECT"; // default: "CLAMP"
  currentDate?: Date | string; // Injectable clock for deterministic tests
  resumeFromSliceIndex?: number; // For resumable 90-day backfills
}

export interface AnalyticsSyncResult {
  success: boolean;
  accountId: string;
  workspaceId: string;
  syncJobId: string;
  mode: AnalyticsSyncMode;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  requestedDateRange: { startDate: string; endDate: string };
  effectiveDateRange: { startDate: string; endDate: string };
  patternResults: AnalyticsPatternResult[];
  requestCount: number;
  observationCount: number;
  selectedVideoIds: string[];
  warnings: string[];
  overallStatus: "COMPLETED" | "FAILED";
  retryable?: boolean;
  error?: string;
}

export interface BackfillSlice {
  sliceIndex: number;
  startDate: string;
  endDate: string;
}

export interface Clock {
  now(): Date;
}

export const defaultSystemClock: Clock = {
  now: () => new Date(),
};
