import { describe, it, expect } from "vitest";
import { YouTubeAnalyticsReportPlanner } from "./youtube.analytics-planner";
import {
  YouTubeAnalyticsMapper,
  buildObservationIdentityKey,
} from "./youtube.analytics-mapper";
import {
  YOUTUBE_QUERY_PATTERN_DEFINITIONS,
  YouTubeAnalyticsQueryPattern,
} from "./youtube.analytics.types";
import { YouTubeAnalyticsResultTable } from "./youtube.types";
import { SocialError } from "../../errors";

describe("Phase 3.3B — YouTube Analytics Report Planner & Mapper", () => {
  const planner = new YouTubeAnalyticsReportPlanner();
  const fixedClock = "2026-03-15"; // T = 2026-03-15, default lag 2 days -> T-2 = 2026-03-13

  // ======== ===================================================================
  // A. Valid Aggregated Channel Query (TOP_VIDEOS_PERFORMANCE)
  // ===========================================================================
  it("A: plans valid aggregated top videos performance query", () => {
    const plan = planner.planReport({
      queryPattern: "TOP_VIDEOS_PERFORMANCE",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      currentDate: fixedClock,
    });

    expect(plan.queryPattern).toBe("TOP_VIDEOS_PERFORMANCE");
    expect(plan.granularity).toBe("AGGREGATED");
    expect(plan.method).toBe("reports.query");
    expect(plan.queryOptions.dimensions).toBe("video");
    expect(plan.queryOptions.sort).toBe("-views");
    expect(plan.queryOptions.maxResults).toBe(200);
    expect(plan.queryOptions.startDate).toBe("2026-01-01");
    expect(plan.queryOptions.endDate).toBe("2026-01-31");
    expect(plan.queryOptions.metrics).toContain("views");
    expect(plan.queryOptions.metrics).toContain("averageViewPercentage");
  });

  // ===========================================================================
  // B. Valid Daily Channel Query (CHANNEL_DAILY_OVERVIEW)
  // ===========================================================================
  it("B: plans valid daily channel time-series query", () => {
    const plan = planner.planReport({
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      startDate: "2026-03-01",
      endDate: "2026-03-10",
      currentDate: fixedClock,
    });

    expect(plan.queryPattern).toBe("CHANNEL_DAILY_OVERVIEW");
    expect(plan.granularity).toBe("DAILY");
    expect(plan.queryOptions.dimensions).toBe("day");
    expect(plan.queryOptions.sort).toBe("day");
    expect(plan.queryOptions.metrics).toContain("views");
    expect(plan.queryOptions.metrics).toContain("subscribersGained");
    expect(plan.queryOptions.metrics).toContain("subscribersLost");
  });

  // ===========================================================================
  // C. Valid Video-Level Query (VIDEO_DAILY_TIME_SERIES)
  // ===========================================================================
  it("C: plans valid single video daily time-series query with required video filter", () => {
    const plan = planner.planReport({
      queryPattern: "VIDEO_DAILY_TIME_SERIES",
      startDate: "2026-03-01",
      endDate: "2026-03-10",
      filters: { video: "video_abc123" },
      currentDate: fixedClock,
    });

    expect(plan.queryPattern).toBe("VIDEO_DAILY_TIME_SERIES");
    expect(plan.granularity).toBe("DAILY");
    expect(plan.queryOptions.dimensions).toBe("day");
    expect(plan.queryOptions.filters).toBe("video==video_abc123");
    expect(plan.queryOptions.sort).toBe("day");
  });

  // ===========================================================================
  // D. Invalid Date Format
  // ===========================================================================
  it("D: rejects invalid date formats", () => {
    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026/01/01",
        endDate: "2026-01-31",
        currentDate: fixedClock,
      })
    ).toThrowError(/Invalid startDate/);

    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-01-01",
        endDate: "not-a-date",
        currentDate: fixedClock,
      })
    ).toThrowError(/Invalid endDate/);
  });

  // ===========================================================================
  // E. StartDate > EndDate
  // ===========================================================================
  it("E: rejects inverted date range where startDate is after endDate", () => {
    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-03-10",
        endDate: "2026-03-01",
        currentDate: fixedClock,
      })
    ).toThrowError(/must not be after endDate/);
  });

  // ===========================================================================
  // F. Unsupported Metric
  // ===========================================================================
  it("F: rejects unsupported or unknown metric names", () => {
    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        metrics: ["views", "totallyFakeMetric"],
        currentDate: fixedClock,
      })
    ).toThrowError(/Metric 'totallyFakeMetric' is not supported/);
  });

  // ===========================================================================
  // G. Unsupported Dimension
  // ===========================================================================
  it("G: rejects unsupported dimensions for a query pattern", () => {
    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        dimensions: ["country"], // country is not allowed on CHANNEL_DAILY_OVERVIEW
        currentDate: fixedClock,
      })
    ).toThrowError(/Dimension 'country' is not supported for query pattern/);
  });

  // ===========================================================================
  // H. Incompatible Metric/Dimension (e.g. Demographics with non-percentage metrics)
  // ===========================================================================
  it("H: enforces demographics isolation (only viewerPercentage allowed)", () => {
    expect(() =>
      planner.planReport({
        queryPattern: "VIEWER_DEMOGRAPHICS",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        metrics: ["views"], // Demographics only allows viewerPercentage
        currentDate: fixedClock,
      })
    ).toThrowError(/Metric 'views' is not supported for query pattern 'VIEWER_DEMOGRAPHICS'/);

    // Valid demographics plan
    const validPlan = planner.planReport({
      queryPattern: "VIEWER_DEMOGRAPHICS",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      currentDate: fixedClock,
    });
    expect(validPlan.queryOptions.dimensions).toBe("ageGroup,gender");
    expect(validPlan.queryOptions.metrics).toBe("viewerPercentage");
    expect(validPlan.queryOptions.sort).toBe("gender,ageGroup");
  });

  // ===========================================================================
  // I. Invalid / Dangerous Filter Validation
  // ===========================================================================
  it("I: validates filter syntax and rejects injection attempts", () => {
    // Malformed string filter
    expect(() =>
      planner.planReport({
        queryPattern: "VIDEO_DAILY_TIME_SERIES",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        filters: "video=notAnEqualSign",
        currentDate: fixedClock,
      })
    ).toThrowError(/Invalid or malformed filter expression/);

    // Injection attempt with suspicious characters
    expect(() =>
      planner.planReport({
        queryPattern: "VIDEO_DAILY_TIME_SERIES",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        filters: { video: "vid123; DROP TABLE snapshots;" },
        currentDate: fixedClock,
      })
    ).toThrowError(/Invalid filter value/);

    // Missing required filter for VIDEO_DAILY_TIME_SERIES
    expect(() =>
      planner.planReport({
        queryPattern: "VIDEO_DAILY_TIME_SERIES",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        currentDate: fixedClock,
      })
    ).toThrowError(/requires a filter for 'video'/);
  });

  // ===========================================================================
  // J. Invalid Sort
  // ===========================================================================
  it("J: validates sort fields against queried metrics and dimensions", () => {
    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        sort: ["-invalidField"],
        currentDate: fixedClock,
      })
    ).toThrowError(/Invalid sort field '-invalidField'/);

    // Valid sort with - prefix
    const plan = planner.planReport({
      queryPattern: "TOP_VIDEOS_PERFORMANCE",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      sort: ["-likes", "views"],
      currentDate: fixedClock,
    });
    expect(plan.queryOptions.sort).toBe("-likes,views");
  });

  // ===========================================================================
  // K. maxResults Boundary
  // ===========================================================================
  it("K: bounds maxResults between 1 and 200", () => {
    expect(() =>
      planner.planReport({
        queryPattern: "TOP_VIDEOS_PERFORMANCE",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        maxResults: 0,
        currentDate: fixedClock,
      })
    ).toThrowError(/Invalid maxResults: 0/);

    expect(() =>
      planner.planReport({
        queryPattern: "TOP_VIDEOS_PERFORMANCE",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        maxResults: 500,
        currentDate: fixedClock,
      })
    ).toThrowError(/Invalid maxResults: 500/);

    const plan = planner.planReport({
      queryPattern: "GEOGRAPHIC_DISTRIBUTION",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      maxResults: 25,
      currentDate: fixedClock,
    });
    expect(plan.queryOptions.maxResults).toBe(25);
  });

  // ===========================================================================
  // L. Analytics Lag Handling (CLAMP vs REJECT)
  // ===========================================================================
  it("L: handles analytics data lag deterministically with CLAMP and REJECT policies", () => {
    // Current date = 2026-03-15. Lag = 2 days -> max available = 2026-03-13.
    // Case 1: CLAMP policy clamps 2026-03-15 to 2026-03-13
    const clampedPlan = planner.planReport({
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      analyticsDataLagDays: 2,
      lagPolicy: "CLAMP",
      currentDate: fixedClock,
    });
    expect(clampedPlan.effectiveEndDate).toBe("2026-03-13");
    expect(clampedPlan.queryOptions.endDate).toBe("2026-03-13");

    // Case 2: REJECT policy throws error when requesting beyond max available date
    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-03-01",
        endDate: "2026-03-15",
        analyticsDataLagDays: 2,
        lagPolicy: "REJECT",
        currentDate: fixedClock,
      })
    ).toThrowError(/Analytics data for requested end date '2026-03-15' is not yet available/);

    // Case 3: StartDate after clamped end date throws error
    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-03-14",
        endDate: "2026-03-15",
        analyticsDataLagDays: 2,
        lagPolicy: "CLAMP",
        currentDate: fixedClock,
      })
    ).toThrowError(/after the effective lag-clamped endDate/);
  });

  // ===========================================================================
  // M. DAILY Planning & Observations Mapping
  // ===========================================================================
  it("M: maps daily time-series rows with observationDate populated", () => {
    const table: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "day", columnType: "DIMENSION", dataType: "STRING" },
        { name: "views", columnType: "METRIC", dataType: "INTEGER" },
        { name: "likes", columnType: "METRIC", dataType: "INTEGER" },
      ],
      rows: [
        ["2026-03-01", 1200, 45],
        ["2026-03-02", 1500, 60],
      ],
    };

    const observations = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
      socialAccountId: "acc_123",
    });

    expect(observations).toHaveLength(2);
    expect(observations[0].granularity).toBe("DAILY");
    expect(observations[0].observationDate).toBe("2026-03-01");
    expect(observations[0].metrics.views).toBe(1200n);
    expect(observations[0].metrics.likes).toBe(45n);
    expect(observations[0].identityKey).toBe(
      "YOUTUBE:ANALYTICS_API:acc_123:CHANNEL_DAILY_OVERVIEW:DAILY:2026-03-01:2026-03-02:2026-03-01:none"
    );

    expect(observations[1].observationDate).toBe("2026-03-02");
    expect(observations[1].metrics.views).toBe(1500n);
  });

  // ===========================================================================
  // N. AGGREGATED Planning & Observations Mapping
  // ===========================================================================
  it("N: maps aggregated observations with observationDate as null", () => {
    const table: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "video", columnType: "DIMENSION", dataType: "STRING" },
        { name: "views", columnType: "METRIC", dataType: "INTEGER" },
        { name: "averageViewPercentage", columnType: "METRIC", dataType: "FLOAT" },
      ],
      rows: [["vid_001", 50000, 64.5]],
    };

    const observations = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
      queryPattern: "TOP_VIDEOS_PERFORMANCE",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      socialAccountId: "acc_123",
    });

    expect(observations).toHaveLength(1);
    expect(observations[0].granularity).toBe("AGGREGATED");
    expect(observations[0].observationDate).toBeNull();
    expect(observations[0].dimensions).toEqual({ video: "vid_001" });
    expect(observations[0].metrics.views).toBe(50000n);
    expect(observations[0].metrics.averageViewPercentage).toBe(64.5);
    expect(observations[0].identityKey).toBe(
      "YOUTUBE:ANALYTICS_API:acc_123:TOP_VIDEOS_PERFORMANCE:AGGREGATED:2026-01-01:2026-01-31:agg:video=vid_001"
    );
  });

  // ===========================================================================
  // O. Column Order Independence
  // ===========================================================================
  it("O: dynamically maps metrics and dimensions regardless of columnHeaders order", () => {
    const shuffledTable: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "likes", columnType: "METRIC", dataType: "INTEGER" },
        { name: "day", columnType: "DIMENSION", dataType: "STRING" },
        { name: "averageViewDuration", columnType: "METRIC", dataType: "INTEGER" },
        { name: "views", columnType: "METRIC", dataType: "INTEGER" },
      ],
      rows: [[42, "2026-03-05", 185, 9500]],
    };

    const observations = YouTubeAnalyticsMapper.mapResultTableToObservations(shuffledTable, {
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-10",
      socialAccountId: "acc_123",
    });

    expect(observations[0].observationDate).toBe("2026-03-05");
    expect(observations[0].metrics.views).toBe(9500n);
    expect(observations[0].metrics.likes).toBe(42n);
    expect(observations[0].metrics.averageViewDuration).toBe(185);
  });

  // ===========================================================================
  // P. Missing Column Handling
  // ===========================================================================
  it("P: leaves missing metric columns undefined or null without throwing", () => {
    const partialTable: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "day", columnType: "DIMENSION", dataType: "STRING" },
        { name: "views", columnType: "METRIC", dataType: "INTEGER" },
      ],
      rows: [["2026-03-01", 100]],
    };

    const observations = YouTubeAnalyticsMapper.mapResultTableToObservations(partialTable, {
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      socialAccountId: "acc_123",
    });

    expect(observations[0].metrics.views).toBe(100n);
    expect(observations[0].metrics.likes).toBeUndefined();
    expect(observations[0].metrics.shares).toBeUndefined();
  });

  // ===========================================================================
  // Q. Zero Value Preservation (NULL != 0)
  // ===========================================================================
  it("Q: preserves explicit zero values as 0n / 0", () => {
    const table: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "day", columnType: "DIMENSION", dataType: "STRING" },
        { name: "views", columnType: "METRIC", dataType: "INTEGER" },
        { name: "shares", columnType: "METRIC", dataType: "INTEGER" },
        { name: "averageViewPercentage", columnType: "METRIC", dataType: "FLOAT" },
      ],
      rows: [["2026-03-01", 0, "0", 0.0]],
    };

    const observations = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      socialAccountId: "acc_123",
    });

    expect(observations[0].metrics.views).toBe(0n);
    expect(observations[0].metrics.shares).toBe(0n);
    expect(observations[0].metrics.averageViewPercentage).toBe(0);
    expect(observations[0].metrics.views).not.toBeNull();
  });

  // ===========================================================================
  // R. Strict NULL / Privacy Value Preservation
  // ===========================================================================
  it("R: preserves strict null values and returns empty array on privacy suppression", () => {
    // Explicit null cell in row
    const tableWithNulls: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "day", columnType: "DIMENSION", dataType: "STRING" },
        { name: "views", columnType: "METRIC", dataType: "INTEGER" },
        { name: "shares", columnType: "METRIC", dataType: "INTEGER" },
      ],
      rows: [["2026-03-01", 100, null]],
    };

    const observations = YouTubeAnalyticsMapper.mapResultTableToObservations(tableWithNulls, {
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      socialAccountId: "acc_123",
    });

    expect(observations[0].metrics.views).toBe(100n);
    expect(observations[0].metrics.shares).toBeNull();

    // Privacy-suppressed table with 0 rows (e.g. Demographics on small channel)
    const emptyTable: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "ageGroup", columnType: "DIMENSION", dataType: "STRING" },
        { name: "gender", columnType: "DIMENSION", dataType: "STRING" },
        { name: "viewerPercentage", columnType: "METRIC", dataType: "FLOAT" },
      ],
      rows: [],
    };

    const emptyObs = YouTubeAnalyticsMapper.mapResultTableToObservations(emptyTable, {
      queryPattern: "VIEWER_DEMOGRAPHICS",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      socialAccountId: "acc_123",
    });

    expect(emptyObs).toEqual([]);
  });

  // ===========================================================================
  // S. Large Numeric Precision Preservation
  // ===========================================================================
  it("S: preserves large integer values as BigInt without JS Number precision loss", () => {
    const hugeCountStr = "9007199254740993"; // 2^53 + 1, exceeds IEEE-754 float precision
    const table: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "day", columnType: "DIMENSION", dataType: "STRING" },
        { name: "views", columnType: "METRIC", dataType: "INTEGER" },
        { name: "estimatedMinutesWatched", columnType: "METRIC", dataType: "INTEGER" },
      ],
      rows: [["2026-03-01", hugeCountStr, "9007199254740995"]],
    };

    const observations = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      socialAccountId: "acc_123",
    });

    expect(observations[0].metrics.views).toBe(9007199254740993n);
    expect(observations[0].metrics.estimatedMinutesWatched).toBe(9007199254740995n);
  });

  // ===========================================================================
  // T. Multiple Video Observations Do Not Collide
  // ===========================================================================
  it("T: ensures different videos on the same day generate distinct identity keys", () => {
    const keyVidA = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: "acc_123",
      queryPattern: "VIDEO_DAILY_TIME_SERIES",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      observationDate: "2026-03-15",
      dimensions: { video: "vid_A" },
    });

    const keyVidB = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: "acc_123",
      queryPattern: "VIDEO_DAILY_TIME_SERIES",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      observationDate: "2026-03-15",
      dimensions: { video: "vid_B" },
    });

    expect(keyVidA).not.toBe(keyVidB);
    expect(keyVidA).toContain("video=vid_A");
    expect(keyVidB).toContain("video=vid_B");
  });

  // ===========================================================================
  // U. Deterministic Multi-Dimensional Identity & Date Range Isolation
  // ===========================================================================
  it("U: produces identical canonical identityKey regardless of dimension object key order", () => {
    const key1 = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: "acc_123",
      queryPattern: "DEVICE_DISTRIBUTION",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      observationDate: null,
      dimensions: { country: "ID", deviceType: "MOBILE" },
    });

    const key2 = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: "acc_123",
      queryPattern: "DEVICE_DISTRIBUTION",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      observationDate: null,
      dimensions: { deviceType: "MOBILE", country: "ID" }, // Inverted object keys
    });

    expect(key1).toBe(key2);
    expect(key1).toBe(
      "YOUTUBE:ANALYTICS_API:acc_123:DEVICE_DISTRIBUTION:AGGREGATED:2026-01-01:2026-01-31:agg:country=ID,deviceType=MOBILE"
    );

    // Different date range produces distinct identityKey
    const keyDifferentDates = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: "acc_123",
      queryPattern: "DEVICE_DISTRIBUTION",
      granularity: "AGGREGATED",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      observationDate: null,
      dimensions: { country: "ID", deviceType: "MOBILE" },
    });

    expect(keyDifferentDates).not.toBe(key1);
  });

  // ===========================================================================
  // V. Provider & Source Separation
  // ===========================================================================
  it("V: decouples provider identity from telemetry source", () => {
    const table: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "day", columnType: "DIMENSION", dataType: "STRING" },
        { name: "views", columnType: "METRIC", dataType: "INTEGER" },
      ],
      rows: [["2026-03-01", 500]],
    };

    const observations = YouTubeAnalyticsMapper.mapResultTableToObservations(table, {
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: "acc_123",
    });

    expect(observations[0].provider).toBe("YOUTUBE");
    expect(observations[0].source).toBe("ANALYTICS_API");
  });

  // ===========================================================================
  // W. Unsupported Impressions / CTR Handling
  // ===========================================================================
  it("W: explicitly fails with deferred reporting API error on impressions / CTR", () => {
    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        metrics: ["views", "impressions"],
        currentDate: fixedClock,
      })
    ).toThrowError(/Metric 'impressions' is not supported via YouTube Analytics reports.query/);

    expect(() =>
      planner.planReport({
        queryPattern: "TOP_VIDEOS_PERFORMANCE",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        metrics: ["views", "impressionClickThroughRate"],
        currentDate: fixedClock,
      })
    ).toThrowError(/Metric 'impressionClickThroughRate' is not supported via YouTube Analytics reports.query/);

    expect(() =>
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        metrics: ["saves"],
        currentDate: fixedClock,
      })
    ).toThrowError(/Metric 'saves' is not supported/);
  });

  // ===========================================================================
  // X. Malformed API Response Handling
  // ===========================================================================
  it("X: safely handles malformed API response tables", () => {
    // Missing columnHeaders throws SocialError
    expect(() =>
      YouTubeAnalyticsMapper.mapResultTableToObservations(
        {} as any,
        {
          queryPattern: "CHANNEL_DAILY_OVERVIEW",
          granularity: "DAILY",
          startDate: "2026-03-01",
          endDate: "2026-03-01",
        }
      )
    ).toThrowError(/Invalid or missing columnHeaders/);

    // Non-array rows returns empty array
    const resultWithNullRows = YouTubeAnalyticsMapper.mapResultTableToObservations(
      {
        kind: "youtubeAnalytics#resultTable",
        columnHeaders: [{ name: "day", columnType: "DIMENSION", dataType: "STRING" }],
        rows: null as any,
      },
      {
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        granularity: "DAILY",
        startDate: "2026-03-01",
        endDate: "2026-03-01",
      }
    );
    expect(resultWithNullRows).toEqual([]);
  });

  // ===========================================================================
  // Y. Zero HTTP Dispatches on Validation Failure
  // ===========================================================================
  it("Y: fails synchronously before any HTTP dispatch when plan validation fails", () => {
    let httpCalled = false;
    const mockQueryReports = () => {
      httpCalled = true;
      return Promise.resolve({ kind: "youtubeAnalytics#resultTable", columnHeaders: [], rows: [] });
    };

    expect(() => {
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "2026-03-10",
        endDate: "2026-03-01", // Invalid inverted dates
        currentDate: fixedClock,
      });
      // If planReport doesn't throw, mockQueryReports would be called
      mockQueryReports();
    }).toThrowError(/must not be after endDate/);

    expect(httpCalled).toBe(false);
  });

  // ===========================================================================
  // Z. Zero Token Leakage in Errors and Plans
  // ===========================================================================
  it("Z: guarantees zero token exposure in planned queries, observations, and error messages", () => {
    const plan = planner.planReport({
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      startDate: "2026-03-01",
      endDate: "2026-03-10",
      currentDate: fixedClock,
    });

    const serializedPlan = JSON.stringify(plan);
    expect(serializedPlan).not.toContain("ya29.");
    expect(serializedPlan).not.toContain("Bearer ");
    expect(serializedPlan).not.toContain("access_token");

    try {
      planner.planReport({
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        startDate: "invalid",
        endDate: "invalid",
        currentDate: fixedClock,
      });
    } catch (err: any) {
      expect(err).toBeInstanceOf(SocialError);
      expect(err.message).not.toContain("ya29.");
      expect(err.message).not.toContain("Bearer ");
    }
  });

  // ===========================================================================
  // Additional Pattern Verification: GEOGRAPHIC, TRAFFIC_SOURCE, DEVICE
  // ===========================================================================
  describe("All 7 Supported Query Patterns Verification", () => {
    it("verifies GEOGRAPHIC_DISTRIBUTION with subscribersGained", () => {
      const plan = planner.planReport({
        queryPattern: "GEOGRAPHIC_DISTRIBUTION",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        currentDate: fixedClock,
      });

      expect(plan.queryOptions.dimensions).toBe("country");
      expect(plan.queryOptions.metrics).toContain("subscribersGained");
      expect(plan.queryOptions.metrics).toContain("views");
      expect(plan.queryOptions.sort).toBe("-views");
      expect(plan.queryOptions.maxResults).toBe(50);
    });

    it("verifies TRAFFIC_SOURCE_DISTRIBUTION", () => {
      const plan = planner.planReport({
        queryPattern: "TRAFFIC_SOURCE_DISTRIBUTION",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        currentDate: fixedClock,
      });

      expect(plan.queryOptions.dimensions).toBe("insightTrafficSourceType");
      expect(plan.queryOptions.metrics).toBe("views,estimatedMinutesWatched");
      expect(plan.queryOptions.sort).toBe("-views");
    });

    it("verifies DEVICE_DISTRIBUTION", () => {
      const plan = planner.planReport({
        queryPattern: "DEVICE_DISTRIBUTION",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        currentDate: fixedClock,
      });

      expect(plan.queryOptions.dimensions).toBe("deviceType");
      expect(plan.queryOptions.metrics).toBe("views,estimatedMinutesWatched");
      expect(plan.queryOptions.sort).toBe("-views");
    });

    it("verifies all 7 patterns are fully defined in YOUTUBE_QUERY_PATTERN_DEFINITIONS", () => {
      const expectedPatterns: YouTubeAnalyticsQueryPattern[] = [
        "CHANNEL_DAILY_OVERVIEW",
        "TOP_VIDEOS_PERFORMANCE",
        "VIDEO_DAILY_TIME_SERIES",
        "VIEWER_DEMOGRAPHICS",
        "GEOGRAPHIC_DISTRIBUTION",
        "TRAFFIC_SOURCE_DISTRIBUTION",
        "DEVICE_DISTRIBUTION",
      ];

      for (const pattern of expectedPatterns) {
        const def = YOUTUBE_QUERY_PATTERN_DEFINITIONS[pattern];
        expect(def).toBeDefined();
        expect(def.allowedMetrics.length).toBeGreaterThan(0);
        expect(def.allowedDimensions.length).toBeGreaterThan(0);
        expect(def.granularity).toMatch(/^(DAILY|AGGREGATED)$/);
      }
    });
  });
});
