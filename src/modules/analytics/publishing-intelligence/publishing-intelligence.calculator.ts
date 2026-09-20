/**
 * Phase 3.4G: Publishing Intelligence Calculation & Evidence Logic
 *
 * Implements statistical medians, IQR calculation, evidence strength evaluation,
 * descriptive quadrant classification, and structured narrative generation.
 *
 * All formulas adhere strictly to the non-causal guidelines in
 * docs/YOUTUBE_PUBLISHING_INTELLIGENCE_IMPLEMENTATION_SPEC.md.
 */

import {
  ConsumptionRelativeLevel,
  EvidenceStrength,
  PerformanceRelativeLevel,
  QuadrantId,
} from "./publishing-intelligence.types";

/**
 * Calculates the median of an array of numbers.
 * Returns 0 if array is empty.
 */
export function calculateMedian(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Calculates Interquartile Range (IQR) for dispersion/consistency analysis.
 */
export function calculateIQR(values: number[]): {
  q1: number;
  median: number;
  q3: number;
  iqr: number;
} {
  if (!values || values.length === 0) {
    return { q1: 0, median: 0, q3: 0, iqr: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const median = calculateMedian(sorted);
  const mid = Math.floor(sorted.length / 2);

  const lowerHalf = sorted.length % 2 === 0 ? sorted.slice(0, mid) : sorted.slice(0, mid);
  const upperHalf = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);

  const q1 = calculateMedian(lowerHalf);
  const q3 = calculateMedian(upperHalf);
  const iqr = Math.max(0, q3 - q1);

  return { q1, median, q3, iqr };
}

/**
 * Evaluates the Evidence Strength of a specific window's observations.
 *
 * Criteria:
 * - INSUFFICIENT: sample size < 3
 * - LOW: 3 <= sample size < 5
 * - MODERATE: 5 <= sample size < 15 (lookback >= 60d)
 * - HIGH: sample size >= 15 (lookback >= 90d, consistent IQR)
 */
export function evaluateEvidenceStrength(
  sampleSize: number,
  lookbackDays: number,
  values: number[]
): { strength: EvidenceStrength; reason: string } {
  if (sampleSize < 3) {
    return {
      strength: "INSUFFICIENT",
      reason: `Insufficient sample size (${sampleSize} upload${sampleSize === 1 ? "" : "s"} in this window). Minimum 3 uploads required for window observation.`,
    };
  }

  if (sampleSize < 5) {
    return {
      strength: "LOW",
      reason: `Preliminary sample size (${sampleSize} uploads). High susceptibility to individual video outliers.`,
    };
  }

  if (sampleSize >= 15 && lookbackDays >= 90) {
    const { median, iqr } = calculateIQR(values);
    const iqrRatio = median > 0 ? iqr / median : 1.0;

    if (iqrRatio <= 0.8) {
      return {
        strength: "HIGH",
        reason: `Substantial historical sample size (${sampleSize} uploads over ${lookbackDays} days) with consistent Day 1 viewing velocity.`,
      };
    }

    return {
      strength: "MODERATE",
      reason: `Large sample size (${sampleSize} uploads), but with moderate performance variance across individual uploads.`,
    };
  }

  return {
    strength: "MODERATE",
    reason: `Meaningful historical sample size (${sampleSize} uploads over ${lookbackDays} days). Solid directional observation.`,
  };
}

/**
 * Classifies window into descriptive quadrant without prescriptive language.
 */
export function classifyQuadrant(
  consumptionLevel: ConsumptionRelativeLevel,
  deltaPercent: number | null,
  sampleSize: number
): { quadrant: QuadrantId; label: string; performanceLevel: PerformanceRelativeLevel } {
  if (sampleSize < 3 || deltaPercent === null) {
    return {
      quadrant: "UNCLASSIFIED",
      label: "Insufficient observation depth",
      performanceLevel: "INSUFFICIENT_DATA",
    };
  }

  const isHighVelocity = deltaPercent >= 5.0;
  const isLowVelocity = deltaPercent <= -5.0;

  const performanceLevel: PerformanceRelativeLevel = isHighVelocity
    ? "ABOVE_BASELINE"
    : isLowVelocity
    ? "BELOW_BASELINE"
    : "BASELINE";

  if (consumptionLevel === "ABOVE_AVERAGE" && isHighVelocity) {
    return {
      quadrant: "Q1_HIGH_CONSUMPTION_HIGH_VELOCITY",
      label: "Relatively higher consumption / relatively higher early performance",
      performanceLevel,
    };
  }

  if (consumptionLevel === "ABOVE_AVERAGE" && isLowVelocity) {
    return {
      quadrant: "Q2_HIGH_CONSUMPTION_LOW_VELOCITY",
      label: "Relatively higher consumption / relatively lower early performance",
      performanceLevel,
    };
  }

  if (consumptionLevel === "BELOW_AVERAGE" && isHighVelocity) {
    return {
      quadrant: "Q3_LOW_CONSUMPTION_HIGH_VELOCITY",
      label: "Relatively lower consumption / relatively higher early performance",
      performanceLevel,
    };
  }

  if (consumptionLevel === "BELOW_AVERAGE" && isLowVelocity) {
    return {
      quadrant: "Q4_LOW_CONSUMPTION_LOW_VELOCITY",
      label: "Relatively lower consumption / relatively lower early performance",
      performanceLevel,
    };
  }

  return {
    quadrant: "UNCLASSIFIED",
    label: "Within baseline variance range",
    performanceLevel,
  };
}
