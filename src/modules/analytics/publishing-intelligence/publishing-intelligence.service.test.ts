import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublishingIntelligenceService } from "./publishing-intelligence.service";
import { PrismaClient } from "@prisma/client";

describe("Phase 3.4G: PublishingIntelligenceService", () => {
  let mockPrisma: any;
  let service: PublishingIntelligenceService;

  const mockAccount = {
    id: "sa_yt_test",
    workspaceId: "ws_test",
    platform: { code: "YOUTUBE", name: "YouTube" },
    externalAccountId: "yt_channel_123",
    username: "PlottersArt",
    displayName: "Plotters Official",
    status: "CONNECTED",
    publishingTimezone: "Asia/Jakarta",
  };

  beforeEach(() => {
    mockPrisma = {
      socialAccount: {
        findUnique: vi.fn(),
      },
      analyticsObservation: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        upsert: vi.fn(),
      },
      contentPlatform: {
        findMany: vi.fn(),
      },
    };

    service = new PublishingIntelligenceService(mockPrisma as unknown as PrismaClient);
  });

  describe("Tenant Isolation & Security", () => {
    it("throws 404 if social account does not exist", async () => {
      mockPrisma.socialAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.getPublishingIntelligence("ws_test", {
          socialAccountId: "nonexistent",
        })
      ).rejects.toThrow("was not found");
    });

    it("throws 403 if social account belongs to a different workspace", async () => {
      mockPrisma.socialAccount.findUnique.mockResolvedValue({
        ...mockAccount,
        workspaceId: "other_ws",
      });

      await expect(
        service.getPublishingIntelligence("ws_test", {
          socialAccountId: "sa_yt_test",
        })
      ).rejects.toThrow("Tenant isolation violation");
    });
  });

  describe("Signal A: Historical Consumption Pattern", () => {
    it("aggregates channel daily consumption across days of week in UTC", async () => {
      mockPrisma.socialAccount.findUnique.mockResolvedValue(mockAccount);

      // Return 7 days of observations
      mockPrisma.analyticsObservation.findMany.mockImplementation((args: any) => {
        if (args.where.queryPattern === "CHANNEL_DAILY_OVERVIEW") {
          return Promise.resolve([
            // 2026-08-10 is Monday (1000 views, 5000 min)
            {
              observationDate: new Date("2026-08-10T00:00:00Z"),
              views: BigInt(1000),
              estimatedMinutesWatched: BigInt(5000),
            },
            // 2026-08-14 is Friday (3000 views, 15000 min)
            {
              observationDate: new Date("2026-08-14T00:00:00Z"),
              views: BigInt(3000),
              estimatedMinutesWatched: BigInt(15000),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);

      const result = await service.getPublishingIntelligence("ws_test", {
        socialAccountId: "sa_yt_test",
      });

      expect(result.consumptionPattern.daysOfWeek).toHaveLength(7);

      const mon = result.consumptionPattern.daysOfWeek.find((d) => d.dayOfWeek === "Monday");
      expect(mon?.averageDailyViews).toBe(1000);
      expect(mon?.observationCount).toBe(1);

      const fri = result.consumptionPattern.daysOfWeek.find((d) => d.dayOfWeek === "Friday");
      expect(fri?.averageDailyViews).toBe(3000);
      expect(fri?.observationCount).toBe(1);

      // Friday has 3000 vs mean 2000 -> consumptionIndex = 1.5
      expect(fri?.relativeLevel).toBe("ABOVE_AVERAGE");
      expect(result.consumptionPattern.peakConsumptionDay).toBe("Friday");
    });
  });

  describe("Signal B & C: Content Supply and Launch Velocity", () => {
    it("allocates uploads into creator timezone and calculates Day 1, Day 2 cumulative, Day 3 cumulative metrics", async () => {
      mockPrisma.socialAccount.findUnique.mockResolvedValue(mockAccount);

      // Consumption data
      mockPrisma.analyticsObservation.findMany.mockImplementation((args: any) => {
        if (args.where.queryPattern === "CHANNEL_DAILY_OVERVIEW") {
          return Promise.resolve([
            {
              observationDate: new Date("2026-08-01T00:00:00Z"),
              views: BigInt(2000),
              estimatedMinutesWatched: BigInt(6000),
            },
          ]);
        }
        if (args.where.queryPattern === "VIDEO_DAILY_TIME_SERIES") {
          return Promise.resolve([
            // Video 1 (published 2026-08-07 11:30 UTC -> 18:30 Jakarta)
            {
              externalContentId: "vid_1",
              observationDate: new Date("2026-08-07T00:00:00Z"), // Day 1
              views: BigInt(1000),
              estimatedMinutesWatched: BigInt(3000),
            },
            {
              externalContentId: "vid_1",
              observationDate: new Date("2026-08-08T00:00:00Z"), // Day 2
              views: BigInt(1500),
              estimatedMinutesWatched: BigInt(4500),
            },
            {
              externalContentId: "vid_1",
              observationDate: new Date("2026-08-09T00:00:00Z"), // Day 3
              views: BigInt(800),
              estimatedMinutesWatched: BigInt(2400),
            },
            // Video 2
            {
              externalContentId: "vid_2",
              observationDate: new Date("2026-08-07T00:00:00Z"), // Day 1
              views: BigInt(1200),
              estimatedMinutesWatched: BigInt(3600),
            },
            {
              externalContentId: "vid_2",
              observationDate: new Date("2026-08-08T00:00:00Z"), // Day 2
              views: BigInt(1800),
              estimatedMinutesWatched: BigInt(5400),
            },
            {
              externalContentId: "vid_2",
              observationDate: new Date("2026-08-09T00:00:00Z"), // Day 3
              views: BigInt(1000),
              estimatedMinutesWatched: BigInt(3000),
            },
            // Video 3
            {
              externalContentId: "vid_3",
              observationDate: new Date("2026-08-07T00:00:00Z"), // Day 1
              views: BigInt(1100),
              estimatedMinutesWatched: BigInt(3300),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      // 3 published videos on Friday 11:30 UTC -> Friday 18:30 Jakarta
      mockPrisma.contentPlatform.findMany.mockResolvedValue([
        {
          id: "cp_1",
          externalContentId: "vid_1",
          publishedAt: new Date("2026-08-07T11:30:00.000Z"),
          metadata: { contentType: "LONG_FORM" },
          content: { title: "Video 1", assets: [] },
        },
        {
          id: "cp_2",
          externalContentId: "vid_2",
          publishedAt: new Date("2026-08-07T11:45:00.000Z"),
          metadata: { contentType: "LONG_FORM" },
          content: { title: "Video 2", assets: [] },
        },
        {
          id: "cp_3",
          externalContentId: "vid_3",
          publishedAt: new Date("2026-08-07T11:55:00.000Z"),
          metadata: { contentType: "LONG_FORM" },
          content: { title: "Video 3", assets: [] },
        },
      ]);

      const result = await service.getPublishingIntelligence("ws_test", {
        socialAccountId: "sa_yt_test",
        publishingTimezone: "Asia/Jakarta",
      });

      // Total 3 uploads
      expect(result.contentSupply.totalUploads).toBe(3);
      expect(result.contentSupply.mostActivePublishingDay).toBe("Friday");

      // Check observed window: Friday 18:00–19:00
      const windowFri18 = result.observedWindows.find(
        (w) => w.dayOfWeek === "Friday" && w.hourBucket === 18
      );
      expect(windowFri18).toBeDefined();
      expect(windowFri18?.uploadCount).toBe(3);
      expect(windowFri18?.windowLabel).toBe("18:00–19:00");

      // Median of [1000, 1200, 1100] is 1100
      expect(windowFri18?.performance.day1ViewsMedian).toBe(1100);

      // Cumulative Day 2 for [vid1: 2500, vid2: 3000, vid3: 1100] -> median is 2500
      expect(windowFri18?.performance.day2CumulativeViewsMedian).toBe(2500);

      // Cumulative Day 3 for [vid1: 3300, vid2: 4000, vid3: 1100] -> median is 3300
      expect(windowFri18?.performance.day3CumulativeViewsMedian).toBe(3300);

      // Evidence strength for sample size 3 is LOW
      expect(windowFri18?.evidenceStrength).toBe("LOW");
    });
  });

  describe("Format Segmentation & Maturing Lag Boundary", () => {
    it("strictly isolates LONG_FORM from SHORTS videos", async () => {
      mockPrisma.socialAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.analyticsObservation.findMany.mockResolvedValue([]);

      mockPrisma.contentPlatform.findMany.mockResolvedValue([
        {
          id: "cp_long",
          externalContentId: "vid_long",
          publishedAt: new Date("2026-08-01T10:00:00Z"),
          metadata: { contentType: "LONG_FORM" },
          content: { title: "Deep Dive Long", assets: [] },
        },
        {
          id: "cp_short",
          externalContentId: "vid_short",
          publishedAt: new Date("2026-08-01T10:00:00Z"),
          metadata: { contentType: "SHORTS" },
          content: { title: "Quick Short", assets: [] },
        },
      ]);

      // Query LONG_FORM
      const longResult = await service.getPublishingIntelligence("ws_test", {
        socialAccountId: "sa_yt_test",
        format: "LONG_FORM",
      });
      expect(longResult.contentSupply.totalUploads).toBe(1);

      // Query SHORTS
      const shortsResult = await service.getPublishingIntelligence("ws_test", {
        socialAccountId: "sa_yt_test",
        format: "SHORTS",
      });
      expect(shortsResult.contentSupply.totalUploads).toBe(1);
    });

    it("excludes recent maturing uploads from finalized velocity baselines", async () => {
      mockPrisma.socialAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.analyticsObservation.findMany.mockResolvedValue([]);

      // Video published today (within 2-day lag)
      const today = new Date();
      mockPrisma.contentPlatform.findMany.mockResolvedValue([
        {
          id: "cp_recent",
          externalContentId: "vid_recent",
          publishedAt: today,
          metadata: { contentType: "LONG_FORM" },
          content: { title: "Recent Video", assets: [] },
        },
      ]);

      const result = await service.getPublishingIntelligence("ws_test", {
        socialAccountId: "sa_yt_test",
      });

      expect(result.contentSupply.totalUploads).toBe(1);
      expect(result.freshness.maturingVideosCount).toBe(1);

      // The window should have sampleSize 0 for velocity
      const window = result.observedWindows[0];
      expect(window?.performance.sampleSize).toBe(0);
      expect(window?.performance.day1ViewsMedian).toBeNull();
    });
  });

  describe("Absolute Guardrails & Immutability", () => {
    it("NEVER mutates AnalyticsObservation during calculation", async () => {
      mockPrisma.socialAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.analyticsObservation.findMany.mockResolvedValue([]);
      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);

      await service.getPublishingIntelligence("ws_test", {
        socialAccountId: "sa_yt_test",
      });

      expect(mockPrisma.analyticsObservation.create).not.toHaveBeenCalled();
      expect(mockPrisma.analyticsObservation.update).not.toHaveBeenCalled();
      expect(mockPrisma.analyticsObservation.delete).not.toHaveBeenCalled();
      expect(mockPrisma.analyticsObservation.upsert).not.toHaveBeenCalled();
    });

    it("does NOT return arbitrary composite scores in DTO", async () => {
      mockPrisma.socialAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.analyticsObservation.findMany.mockResolvedValue([]);
      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);

      const result = await service.getPublishingIntelligence("ws_test", {
        socialAccountId: "sa_yt_test",
      });

      expect((result as any).publishingScore).toBeUndefined();
      expect((result as any).optimalTimeScore).toBeUndefined();
      expect((result as any).audienceScore).toBeUndefined();
      expect((result as any).bestTimeScore).toBeUndefined();
    });
  });
});
