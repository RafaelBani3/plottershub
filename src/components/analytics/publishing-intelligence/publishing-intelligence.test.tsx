import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsumptionPatternCard } from "./consumption-pattern-card";
import { ContentSupplyCard } from "./content-supply-card";
import { ObservedWindowsTable } from "./observed-windows-table";
import { QuadrantMatrixCard } from "./quadrant-matrix-card";
import {
  ConsumptionPatternDay,
  ContentSupplyBucket,
  ObservedPublishingWindow,
} from "@/modules/analytics/publishing-intelligence/publishing-intelligence.types";

const mockDays: ConsumptionPatternDay[] = [
  {
    dayOfWeek: "Monday",
    dayIndex: 1,
    totalViews: 1000,
    totalWatchTimeMinutes: 5000,
    averageDailyViews: 1000,
    averageDailyWatchTimeMinutes: 5000,
    consumptionIndex: 0.85,
    relativeLevel: "BELOW_AVERAGE",
    observationCount: 1,
  },
  {
    dayOfWeek: "Friday",
    dayIndex: 5,
    totalViews: 3000,
    totalWatchTimeMinutes: 15000,
    averageDailyViews: 3000,
    averageDailyWatchTimeMinutes: 15000,
    consumptionIndex: 1.5,
    relativeLevel: "ABOVE_AVERAGE",
    observationCount: 1,
  },
];

const mockBuckets: ContentSupplyBucket[] = [
  {
    dayOfWeek: "Friday",
    hourBucket: 18,
    windowLabel: "18:00–19:00",
    uploadCount: 18,
    percentageOfTotal: 75.0,
  },
  {
    dayOfWeek: "Saturday",
    hourBucket: 11,
    windowLabel: "11:00–12:00",
    uploadCount: 6,
    percentageOfTotal: 25.0,
  },
];

const mockWindows: ObservedPublishingWindow[] = [
  {
    id: "Friday-18",
    dayOfWeek: "Friday",
    hourBucket: 18,
    windowLabel: "18:00–19:00",
    uploadCount: 18,
    performance: {
      day1ViewsMedian: 18400,
      day2CumulativeViewsMedian: 32100,
      day3CumulativeViewsMedian: 45000,
      day1WatchTimeMinutesMedian: 60000,
      channelBaselineDay1ViewsMedian: 12700,
      relativeDeltaPercent: 44.9,
      sampleSize: 18,
    },
    consumptionLevel: "ABOVE_AVERAGE",
    performanceLevel: "ABOVE_BASELINE",
    quadrant: "Q1_HIGH_CONSUMPTION_HIGH_VELOCITY",
    quadrantLabel: "Relatively higher consumption / relatively higher early performance",
    evidenceStrength: "HIGH",
    evidenceReason: "Substantial sample size",
  },
  {
    id: "Saturday-11",
    dayOfWeek: "Saturday",
    hourBucket: 11,
    windowLabel: "11:00–12:00",
    uploadCount: 6,
    performance: {
      day1ViewsMedian: 13100,
      day2CumulativeViewsMedian: 21000,
      day3CumulativeViewsMedian: 28000,
      day1WatchTimeMinutesMedian: 40000,
      channelBaselineDay1ViewsMedian: 12700,
      relativeDeltaPercent: 3.1,
      sampleSize: 6,
    },
    consumptionLevel: "AVERAGE",
    performanceLevel: "BASELINE",
    quadrant: "UNCLASSIFIED",
    quadrantLabel: "Within baseline variance range",
    evidenceStrength: "MODERATE",
    evidenceReason: "Meaningful sample size",
  },
];

describe("Phase 3.4G: Publishing Intelligence UI Components & Copy Guardrails", () => {
  describe("ConsumptionPatternCard", () => {
    it("renders historical consumption days without hourly viewer presence claims", () => {
      const html = renderToStaticMarkup(
        <ConsumptionPatternCard
          days={mockDays}
          channelDailyMeanViews={2000}
          channelDailyMeanWatchTimeMinutes={10000}
        />
      );

      expect(html).toContain("Historical Consumption Pattern");
      expect(html).toContain("Friday");
      expect(html).toContain("+50%");
      expect(html).toContain("Monday");
      expect(html).toContain("-15%");
      expect(html).toContain("Mean: 2,000 views/day");

      // Verify explicit notice that hourly presence is not claimed
      expect(html).toContain("Does not represent hourly concurrent online presence");
    });
  });

  describe("ContentSupplyCard", () => {
    it("renders supply distribution and timezone context", () => {
      const html = renderToStaticMarkup(
        <ContentSupplyCard
          totalUploads={24}
          buckets={mockBuckets}
          mostActivePublishingDay="Friday"
          timezone="Asia/Jakarta"
        />
      );

      expect(html).toContain("Content Supply Distribution");
      expect(html).toContain("Asia/Jakarta");
      expect(html).toContain("24 Uploads");
      expect(html).toContain("Friday 18:00–19:00");
      expect(html).toContain("18 uploads");
      expect(html).toContain("75%");
      expect(html).toContain("Reflects your upload frequency. Does not infer audience availability");
    });
  });

  describe("ObservedWindowsTable", () => {
    it("renders observed windows table with Day 1, Day 2 cumulative, Day 3 cumulative and EvidenceStrengthBadge", () => {
      const html = renderToStaticMarkup(
        <ObservedWindowsTable
          windows={mockWindows}
          channelBaselineMedian={12700}
          timezone="Asia/Jakarta"
        />
      );

      expect(html).toContain("Observed Publishing Windows");
      expect(html).toContain("18,400"); // Day 1 Median
      expect(html).toContain("32,100"); // Day 2 Cumul
      expect(html).toContain("45,000"); // Day 3 Cumul
      expect(html).toContain("+44.9%"); // vs baseline
      expect(html).toContain("Strong"); // Evidence strength badge
      expect(html).toContain("Moderate"); // Evidence strength badge
    });
  });

  describe("QuadrantMatrixCard", () => {
    it("renders neutral descriptive quadrant regions", () => {
      const html = renderToStaticMarkup(
        <QuadrantMatrixCard
          quadrants={{
            q1: [mockWindows[0]],
            q2: [],
            q3: [],
            q4: [],
            unclassified: [mockWindows[1]],
          }}
        />
      );

      expect(html).toContain("Descriptive Quadrant Matrix");
      expect(html).toContain("Higher Consumption / Higher Early Velocity");
      expect(html).toContain("Fri 18:00–19:00");
      expect(html).toContain("Quadrant classifications describe historical patterns");
    });
  });

  describe("STRICT COPY GUARDRAILS — Prohibition of Algorithmic / Causal Claims", () => {
    it("prohibits forbidden words ('Best time', 'Optimal', 'Winning window', 'Guaranteed', 'Maximize views') in UI outputs", () => {
      const consumptionHtml = renderToStaticMarkup(
        <ConsumptionPatternCard
          days={mockDays}
          channelDailyMeanViews={2000}
          channelDailyMeanWatchTimeMinutes={10000}
        />
      );
      const supplyHtml = renderToStaticMarkup(
        <ContentSupplyCard
          totalUploads={24}
          buckets={mockBuckets}
          mostActivePublishingDay="Friday"
          timezone="Asia/Jakarta"
        />
      );
      const tableHtml = renderToStaticMarkup(
        <ObservedWindowsTable
          windows={mockWindows}
          channelBaselineMedian={12700}
          timezone="Asia/Jakarta"
        />
      );
      const quadrantHtml = renderToStaticMarkup(
        <QuadrantMatrixCard
          quadrants={{
            q1: [mockWindows[0]],
            q2: [],
            q3: [],
            q4: [],
            unclassified: [],
          }}
        />
      );

      const allHtml = (consumptionHtml + supplyHtml + tableHtml + quadrantHtml).toLowerCase();

      const forbiddenPhrases = [
        "best time",
        "optimal time",
        "winning window",
        "guaranteed views",
        "maximize views",
        "post at this time",
        "you should post at",
        "your audience is most active at",
      ];

      for (const phrase of forbiddenPhrases) {
        expect(allHtml).not.toContain(phrase);
      }
    });
  });
});
