import { describe, it, expect } from "vitest";
import {
  formatUtcDateString,
  getInclusiveDaysCount,
  getPresetDateRange,
  validateDateRange,
  formatMetricValue,
  formatWatchTime,
} from "./youtube-formatters";

describe("YouTube Analytics Formatters & Date Utilities", () => {
  describe("UTC Date Calculations", () => {
    it("formats UTC dates correctly to YYYY-MM-DD", () => {
      const d = new Date(Date.UTC(2026, 7, 15)); // 2026-08-15
      expect(formatUtcDateString(d)).toBe("2026-08-15");
    });

    it("calculates exact inclusive day counts", () => {
      // Inclusive count: Aug 1 to Aug 7 is 7 days
      expect(getInclusiveDaysCount("2026-08-01", "2026-08-07")).toBe(7);
      // Aug 1 to Aug 28 is 28 days
      expect(getInclusiveDaysCount("2026-08-01", "2026-08-28")).toBe(28);
      // Same day is 1 day
      expect(getInclusiveDaysCount("2026-08-01", "2026-08-01")).toBe(1);
    });

    it("computes 7-day preset with exact 7-day inclusive count", () => {
      const refDate = new Date(Date.UTC(2026, 7, 30)); // 2026-08-30
      const range7d = getPresetDateRange("7d", refDate);
      // End is ref - 2d = 2026-08-28
      // Start is ref - 8d = 2026-08-22
      expect(range7d.endDate).toBe("2026-08-28");
      expect(range7d.startDate).toBe("2026-08-22");
      expect(range7d.days).toBe(7);
    });

    it("computes 28-day preset with exact 28-day inclusive count", () => {
      const refDate = new Date(Date.UTC(2026, 7, 30));
      const range28d = getPresetDateRange("28d", refDate);
      expect(range28d.endDate).toBe("2026-08-28");
      expect(range28d.startDate).toBe("2026-08-01");
      expect(range28d.days).toBe(28);
    });

    it("computes 90-day preset with exact 90-day inclusive count", () => {
      const refDate = new Date(Date.UTC(2026, 7, 30));
      const range90d = getPresetDateRange("90d", refDate);
      expect(range90d.endDate).toBe("2026-08-28");
      expect(range90d.days).toBe(90);
    });
  });

  describe("Date Range Validation", () => {
    it("validates valid ranges under 90 days", () => {
      const res = validateDateRange("2026-08-01", "2026-08-28");
      expect(res.isValid).toBe(true);
      expect(res.warning).toBeUndefined();
    });

    it("warns for ranges between 91 and 365 days", () => {
      const res = validateDateRange("2026-01-01", "2026-05-01"); // ~120 days
      expect(res.isValid).toBe(true);
      expect(res.warning).toContain("exceeds 90 days");
    });

    it("invalidates ranges exceeding 365 days", () => {
      const res = validateDateRange("2024-01-01", "2026-01-01");
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("365 days");
    });

    it("invalidates ranges where start is after end", () => {
      const res = validateDateRange("2026-08-28", "2026-08-01");
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("Start date cannot be after end date");
    });
  });

  describe("Strict NULL vs ZERO presentation semantics", () => {
    it("renders null as '—'", () => {
      expect(formatMetricValue(null, "integer")).toBe("—");
      expect(formatMetricValue(null, "percent")).toBe("—");
      expect(formatMetricValue(null, "duration")).toBe("—");
      expect(formatWatchTime(null)).toBe("—");
    });

    it("renders 0 or '0' as '0' rather than '—'", () => {
      expect(formatMetricValue("0", "integer")).toBe("0");
      expect(formatMetricValue(0, "integer")).toBe("0");
      expect(formatMetricValue("0", "percent")).toBe("0.0%");
      expect(formatWatchTime("0")).toBe("0 mins");
    });

    it("formats durations accurately", () => {
      expect(formatMetricValue(95, "duration")).toBe("1:35");
      expect(formatMetricValue(3665, "duration")).toBe("1:01:05");
    });

    it("formats watch time into hours and minutes", () => {
      expect(formatWatchTime("120")).toBe("2.0 hrs");
      expect(formatWatchTime("45")).toBe("45 mins");
      expect(formatWatchTime("120000")).toBe("2.0K hrs");
    });
  });
});
