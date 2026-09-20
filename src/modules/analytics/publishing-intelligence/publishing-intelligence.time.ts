/**
 * Phase 3.4G: Publishing Intelligence Time & Timezone Utilities
 *
 * Implements strict IANA timezone conversions without external dependencies.
 * Uses native Intl.DateTimeFormat for reliable, DST-aware, and platform-independent
 * calendar calculations.
 */

export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type DayOfWeekName = (typeof DAYS_OF_WEEK)[number];

export interface LocalPublishingTime {
  dayOfWeek: DayOfWeekName;
  dayIndex: number; // 1 = Monday ... 7 = Sunday
  hourBucket: number; // 0..23
  windowLabel: string; // e.g. "18:00–19:00"
  formattedLocalDate: string; // "YYYY-MM-DD"
}

/**
 * Validates whether a provided string is a valid IANA timezone identifier.
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string" || tz.trim().length === 0) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats a 1-hour window label given the start hour (0..23).
 * Example: 18 -> "18:00–19:00", 23 -> "23:00–00:00"
 */
export function formatOneHourWindowLabel(hour: number): string {
  const startH = hour.toString().padStart(2, "0");
  const endH = ((hour + 1) % 24).toString().padStart(2, "0");
  return `${startH}:00–${endH}:00`;
}

/**
 * Converts a UTC Date into the creator's operational IANA timezone,
 * returning the local day of week, 1-hour bucket, and window label.
 *
 * Never uses server or browser defaults implicitly.
 */
export function getLocalPublishingTime(
  publishedAtUtc: Date,
  ianaTimezone: string
): LocalPublishingTime {
  const targetTz = isValidIanaTimezone(ianaTimezone) ? ianaTimezone : "UTC";

  // Use Intl.DateTimeFormat parts to reliably decompose local components
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: targetTz,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(publishedAtUtc);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const rawWeekday = partMap.weekday as DayOfWeekName;
  const dayOfWeek: DayOfWeekName = DAYS_OF_WEEK.includes(rawWeekday)
    ? rawWeekday
    : "Monday";

  // Map to ISO day index: Monday = 1, ..., Sunday = 7
  const dayIndex = DAYS_OF_WEEK.indexOf(dayOfWeek) + 1;

  // In hour12: false, some implementations return "24" for midnight; normalize to 0..23
  let hourNum = parseInt(partMap.hour || "0", 10);
  if (hourNum === 24) hourNum = 0;
  if (hourNum < 0 || hourNum > 23) hourNum = 0;

  const year = partMap.year || "1970";
  const month = partMap.month || "01";
  const day = partMap.day || "01";
  const formattedLocalDate = `${year}-${month}-${day}`;

  return {
    dayOfWeek,
    dayIndex,
    hourBucket: hourNum,
    windowLabel: formatOneHourWindowLabel(hourNum),
    formattedLocalDate,
  };
}

/**
 * Formats a Date as YYYY-MM-DD in UTC.
 */
export function formatUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Calculates calendar day difference between two dates: (date2 - date1).
 * Example: 2026-08-11 minus 2026-08-10 = 1 day difference.
 */
export function getCalendarDaysDifference(d1: Date, d2: Date): number {
  const utc1 = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate());
  const utc2 = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());
  return Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24));
}
