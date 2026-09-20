/**
 * Phase 3.4G: Publishing Intelligence Types
 *
 * Source of Truth: docs/YOUTUBE_PUBLISHING_INTELLIGENCE_IMPLEMENTATION_SPEC.md
 *
 * Strictly observational, non-causal data structures for:
 * 1. Historical Consumption Pattern (Signal A)
 * 2. Content Supply (Signal B)
 * 3. Publishing Performance & Velocity (Signal C)
 * 4. Observed Publishing Windows
 * 5. Evidence Strength Framework
 * 6. Descriptive Quadrant Model
 */

export type PublishingIntelligenceFormat = "LONG_FORM" | "SHORTS";

export type EvidenceStrength = "INSUFFICIENT" | "LOW" | "MODERATE" | "HIGH";

export type ConsumptionRelativeLevel = "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE";

export type PerformanceRelativeLevel =
  | "ABOVE_BASELINE"
  | "BASELINE"
  | "BELOW_BASELINE"
  | "INSUFFICIENT_DATA";

export type QuadrantId =
  | "Q1_HIGH_CONSUMPTION_HIGH_VELOCITY"
  | "Q2_HIGH_CONSUMPTION_LOW_VELOCITY"
  | "Q3_LOW_CONSUMPTION_HIGH_VELOCITY"
  | "Q4_LOW_CONSUMPTION_LOW_VELOCITY"
  | "UNCLASSIFIED";

export interface PublishingIntelligenceQueryInput {
  socialAccountId: string;
  format?: PublishingIntelligenceFormat;
  lookbackDays?: number;
  publishingTimezone?: string;
  startDate?: string;
  endDate?: string;
}

export interface ConsumptionPatternDay {
  dayOfWeek: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  dayIndex: number; // 1 = Monday ... 7 = Sunday
  totalViews: number;
  totalWatchTimeMinutes: number;
  averageDailyViews: number;
  averageDailyWatchTimeMinutes: number;
  consumptionIndex: number; // Ratio vs channel daily mean (e.g., 1.24 = 24% above mean)
  relativeLevel: ConsumptionRelativeLevel;
  observationCount: number;
}

export interface ContentSupplyBucket {
  dayOfWeek: string;
  hourBucket: number; // 0..23
  windowLabel: string; // e.g. "18:00–19:00"
  uploadCount: number;
  percentageOfTotal: number;
}

export interface WindowPerformance {
  day1ViewsMedian: number | null;
  day2CumulativeViewsMedian: number | null;
  day3CumulativeViewsMedian: number | null;
  day1WatchTimeMinutesMedian: number | null;
  channelBaselineDay1ViewsMedian: number;
  relativeDeltaPercent: number | null; // e.g. +44.9%
  sampleSize: number;
}

export interface ObservedPublishingWindow {
  id: string; // e.g. "Friday-18"
  dayOfWeek: string;
  hourBucket: number; // 0..23
  windowLabel: string; // e.g. "18:00–19:00"
  uploadCount: number;
  performance: WindowPerformance;
  consumptionLevel: ConsumptionRelativeLevel;
  performanceLevel: PerformanceRelativeLevel;
  quadrant: QuadrantId;
  quadrantLabel: string;
  evidenceStrength: EvidenceStrength;
  evidenceReason: string;
}

export interface NarrativeObservation {
  type: "OBSERVED" | "DERIVED" | "CONTEXT";
  title: string;
  text: string;
}

export interface PublishingIntelligenceMeta {
  socialAccountId: string;
  workspaceId: string;
  channelTitle: string;
  format: PublishingIntelligenceFormat;
  lookbackDays: number;
  startDate: string; // ISO 8601 Date
  endDate: string; // ISO 8601 Date
  publishingTimezone: string; // IANA identifier
  analyticsLagDays: number;
  dataCutoffDate: string; // Cutoff for finalized data
  totalVideosInCatalog: number;
  totalEligibleVideos: number;
  channelBaselineDay1ViewsMedian: number;
  generatedAt: string; // ISO 8601 UTC
}

export interface PublishingIntelligenceFreshness {
  lastObservationDate: string | null;
  lagBoundaryDate: string;
  maturingVideosCount: number;
  isLagRespected: boolean;
  disclaimer: string;
}

export interface PublishingIntelligenceDTO {
  meta: PublishingIntelligenceMeta;
  freshness: PublishingIntelligenceFreshness;
  consumptionPattern: {
    daysOfWeek: ConsumptionPatternDay[];
    channelDailyMeanViews: number;
    channelDailyMeanWatchTimeMinutes: number;
    peakConsumptionDay: string | null;
    lowestConsumptionDay: string | null;
  };
  contentSupply: {
    totalUploads: number;
    buckets: ContentSupplyBucket[];
    mostActivePublishingDay: string | null;
  };
  observedWindows: ObservedPublishingWindow[];
  quadrants: {
    q1: ObservedPublishingWindow[];
    q2: ObservedPublishingWindow[];
    q3: ObservedPublishingWindow[];
    q4: ObservedPublishingWindow[];
    unclassified: ObservedPublishingWindow[];
  };
  evidenceSummary: {
    overallEvidenceStrength: EvidenceStrength;
    highEvidenceWindowsCount: number;
    moderateEvidenceWindowsCount: number;
    lowEvidenceWindowsCount: number;
    insufficientWindowsCount: number;
    minimumObservationThreshold: number;
  };
  narrativeObservations: NarrativeObservation[];
  methodologyNotes: string[];
}
