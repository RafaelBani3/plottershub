/**
 * YouTube Analytics Dashboard Date & Metric Formatting Helpers
 * Strict UTC-only arithmetic to avoid off-by-one calendar dates.
 */

export interface DateRangePreset {
  id: "7d" | "28d" | "90d" | "custom";
  label: string;
}

/**
 * Format a Date object to YYYY-MM-DD using UTC date components.
 */
export function formatUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Add or subtract days using UTC epoch math.
 */
export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Calculate inclusive day count between two YYYY-MM-DD strings.
 */
export function getInclusiveDaysCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Compute presets matching official YouTube Analytics batch lag (2 days behind UTC now).
 * 
 * Presets:
 * Last 7 days:  [today UTC - 8 days,  today UTC - 2 days] (7 inclusive days)
 * Last 28 days: [today UTC - 29 days, today UTC - 2 days] (28 inclusive days)
 * Last 90 days: [today UTC - 91 days, today UTC - 2 days] (90 inclusive days)
 */
export function getPresetDateRange(
  preset: "7d" | "28d" | "90d",
  referenceUtcDate: Date = new Date()
): { startDate: string; endDate: string; days: number } {
  // End date is 2 days prior to reference UTC today
  const end = addUtcDays(referenceUtcDate, -2);
  let startOffset = -8;
  let targetDays = 7;

  if (preset === "28d") {
    startOffset = -29;
    targetDays = 28;
  } else if (preset === "90d") {
    startOffset = -91;
    targetDays = 90;
  }

  const start = addUtcDays(referenceUtcDate, startOffset);
  const startDate = formatUtcDateString(start);
  const endDate = formatUtcDateString(end);
  const days = getInclusiveDaysCount(startDate, endDate);

  return { startDate, endDate, days: days > 0 ? days : targetDays };
}

/**
 * Validate date ranges against Phase 3.3E backend limits.
 * Daily series limit: max 90 days
 * Aggregate limit: max 365 days
 */
export function validateDateRange(
  startDate: string,
  endDate: string
): { isValid: boolean; error?: string; warning?: string } {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return { isValid: false, error: "Dates must be in YYYY-MM-DD format." };
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { isValid: false, error: "Invalid calendar date provided." };
  }

  if (start.getTime() > end.getTime()) {
    return { isValid: false, error: "Start date cannot be after end date." };
  }

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (end.getTime() > todayUtc.getTime()) {
    return { isValid: false, error: "End date cannot be in the future." };
  }

  const days = getInclusiveDaysCount(startDate, endDate);

  if (days > 365) {
    return {
      isValid: false,
      error: "Date range cannot exceed 365 days (backend aggregate limit).",
    };
  }

  let warning: string | undefined;
  if (days > 90) {
    warning = "Selected range exceeds 90 days. Daily trends will be limited or unavailable for periods over 90 days.";
  }

  return { isValid: true, warning };
}

/**
 * Strict NULL vs ZERO presentation formatting.
 * If value is null or undefined -> return "—"
 * If value is 0 or "0" -> return "0"
 */
export function formatMetricValue(
  value: string | number | null | undefined,
  format: "integer" | "duration" | "percent" | "decimal" | "compact" = "integer"
): string {
  if (value === null || value === undefined) {
    return "—";
  }

  const num = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(num)) {
    return "—";
  }

  switch (format) {
    case "percent":
      return `${num.toFixed(1)}%`;
    case "decimal":
      return num.toFixed(2);
    case "duration": {
      // duration in seconds -> mm:ss or hh:mm:ss
      const totalSec = Math.round(num);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;
      if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      }
      return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }
    case "compact": {
      if (Math.abs(num) >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
      }
      if (Math.abs(num) >= 1_000) {
        return `${(num / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
      }
      return num.toLocaleString();
    }
    case "integer":
    default:
      return Math.round(num).toLocaleString();
  }
}

/**
 * Format minutes watched into friendly hours & minutes or compact string
 */
export function formatWatchTime(minutes: string | number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return "—";
  }
  const totalMin = typeof minutes === "string" ? parseFloat(minutes) : minutes;
  if (isNaN(totalMin)) return "—";

  const hours = totalMin / 60;
  if (hours >= 1000) {
    return `${(hours / 1000).toFixed(1)}K hrs`;
  }
  if (hours >= 1) {
    return `${hours.toFixed(1)} hrs`;
  }
  return `${Math.round(totalMin)} mins`;
}
