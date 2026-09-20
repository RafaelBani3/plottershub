import { describe, it, expect } from "vitest";
import {
  isValidIanaTimezone,
  formatOneHourWindowLabel,
  getLocalPublishingTime,
  formatUtcDateString,
  getCalendarDaysDifference,
} from "./publishing-intelligence.time";

describe("Phase 3.4G: Publishing Intelligence Time & Timezone Utilities", () => {
  describe("isValidIanaTimezone", () => {
    it("accepts valid standard IANA timezones", () => {
      expect(isValidIanaTimezone("UTC")).toBe(true);
      expect(isValidIanaTimezone("Asia/Jakarta")).toBe(true);
      expect(isValidIanaTimezone("America/New_York")).toBe(true);
      expect(isValidIanaTimezone("Europe/London")).toBe(true);
      expect(isValidIanaTimezone("Asia/Tokyo")).toBe(true);
    });

    it("rejects invalid, malformed, or empty timezones", () => {
      expect(isValidIanaTimezone("")).toBe(false);
      expect(isValidIanaTimezone("Invalid/Timezone")).toBe(false);
      expect(isValidIanaTimezone("Mars/Curiosity")).toBe(false);
      expect(isValidIanaTimezone("   ")).toBe(false);
      expect(isValidIanaTimezone(null as any)).toBe(false);
      expect(isValidIanaTimezone(undefined as any)).toBe(false);
    });
  });

  describe("formatOneHourWindowLabel", () => {
    it("formats 1-hour window strings correctly", () => {
      expect(formatOneHourWindowLabel(0)).toBe("00:00–01:00");
      expect(formatOneHourWindowLabel(9)).toBe("09:00–10:00");
      expect(formatOneHourWindowLabel(18)).toBe("18:00–19:00");
      expect(formatOneHourWindowLabel(23)).toBe("23:00–00:00");
    });
  });

  describe("getLocalPublishingTime", () => {
    it("converts UTC timestamp to UTC components correctly", () => {
      // 2026-08-14 is a Friday
      const dateUtc = new Date("2026-08-14T18:30:00.000Z");
      const local = getLocalPublishingTime(dateUtc, "UTC");

      expect(local.dayOfWeek).toBe("Friday");
      expect(local.dayIndex).toBe(5); // Friday = 5
      expect(local.hourBucket).toBe(18);
      expect(local.windowLabel).toBe("18:00–19:00");
      expect(local.formattedLocalDate).toBe("2026-08-14");
    });

    it("converts UTC timestamp to Asia/Jakarta (+7) crossing midnight boundary", () => {
      // 2026-08-14 18:30 UTC -> 2026-08-15 01:30 in Jakarta (+7) -> Saturday
      const dateUtc = new Date("2026-08-14T18:30:00.000Z");
      const local = getLocalPublishingTime(dateUtc, "Asia/Jakarta");

      expect(local.dayOfWeek).toBe("Saturday");
      expect(local.dayIndex).toBe(6); // Saturday = 6
      expect(local.hourBucket).toBe(1);
      expect(local.windowLabel).toBe("01:00–02:00");
      expect(local.formattedLocalDate).toBe("2026-08-15");
    });

    it("converts UTC timestamp to America/New_York (-4 in summer EDT)", () => {
      // 2026-08-14 18:30 UTC -> 14:30 EDT in New York
      const dateUtc = new Date("2026-08-14T18:30:00.000Z");
      const local = getLocalPublishingTime(dateUtc, "America/New_York");

      expect(local.dayOfWeek).toBe("Friday");
      expect(local.dayIndex).toBe(5);
      expect(local.hourBucket).toBe(14);
      expect(local.windowLabel).toBe("14:00–15:00");
      expect(local.formattedLocalDate).toBe("2026-08-14");
    });

    it("falls back to UTC when invalid timezone is provided", () => {
      const dateUtc = new Date("2026-08-14T18:30:00.000Z");
      const local = getLocalPublishingTime(dateUtc, "Invalid/Nonexistent");

      expect(local.dayOfWeek).toBe("Friday");
      expect(local.hourBucket).toBe(18);
    });
  });

  describe("formatUtcDateString and getCalendarDaysDifference", () => {
    it("formats ISO date string as YYYY-MM-DD", () => {
      const d = new Date("2026-08-10T23:59:59.999Z");
      expect(formatUtcDateString(d)).toBe("2026-08-10");
    });

    it("calculates exact calendar day differences", () => {
      const d1 = new Date("2026-08-10T19:30:00.000Z");
      const d2 = new Date("2026-08-12T05:00:00.000Z");
      expect(getCalendarDaysDifference(d1, d2)).toBe(2);
    });
  });
});
