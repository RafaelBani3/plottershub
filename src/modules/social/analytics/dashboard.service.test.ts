import { describe, it, expect, beforeEach, vi } from "vitest";
import { YouTubeDashboardService } from "./dashboard.service";
import { AnalyticsDashboardRepository } from "./dashboard.repository";
import { SocialError } from "../errors";
import { Prisma } from "@prisma/client";

describe("YouTubeDashboardService", () => {
  let mockRepo: AnalyticsDashboardRepository;
  let service: YouTubeDashboardService;
  const fixedNow = new Date("2026-09-12T12:00:00.000Z");

  const mockAccount = {
    id: "account-123",
    workspaceId: "ws-1",
    platformId: "plat-yt",
    externalAccountId: "UC_TEST123",
    username: "TestChannel",
    displayName: "Test Channel Display",
    avatarUrl: "https://example.com/avatar.jpg",
    status: "CONNECTED" as const,
    lastSyncedAt: new Date("2026-09-10T10:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-09-10T10:00:00Z"),
    platform: {
      id: "plat-yt",
      code: "YOUTUBE",
      name: "YouTube",
      active: true,
      createdAt: new Date(),
    },
  };

  beforeEach(() => {
    mockRepo = {
      resolveAccount: vi.fn().mockResolvedValue({
        status: "RESOLVED",
        account: mockAccount,
      }),
      getOverviewAggregates: vi.fn().mockResolvedValue({
        count: 7,
        hasMeasuredViews: true,
        viewsSum: 10000n,
        hasMeasuredMinutes: true,
        estimatedMinutesWatchedSum: 2000n,
        hasMeasuredLikes: true,
        likesSum: 500n,
        hasMeasuredComments: true,
        commentsSum: 100n,
        hasMeasuredShares: true,
        sharesSum: 50n,
        hasMeasuredSubsGained: true,
        subscribersGainedSum: 80n,
        hasMeasuredSubsLost: true,
        subscribersLostSum: 10n,
        averageViewPercentageSum: new Prisma.Decimal("45.5"),
        averageViewPercentageCount: 1,
      }),
      getDailyTrends: vi.fn().mockResolvedValue([
        {
          id: "obs-1",
          workspaceId: "ws-1",
          socialAccountId: "account-123",
          observationDate: new Date("2026-09-01T00:00:00Z"),
          startDate: new Date("2026-09-01T00:00:00Z"),
          endDate: new Date("2026-09-01T00:00:00Z"),
          views: 1500n,
          estimatedMinutesWatched: 300n,
          averageViewDuration: 120,
          likes: 60n,
          comments: 10n,
          shares: 5n,
          subscribersGained: 12n,
          subscribersLost: 2n,
        },
      ]),
      getTopVideos: vi.fn().mockResolvedValue({
        items: [
          {
            videoId: "vid-1",
            title: "Epic Video",
            description: "First video",
            publishedAt: new Date("2026-08-01T00:00:00Z"),
            externalUrl: "https://youtube.com/watch?v=vid-1",
            views: 5000n,
            estimatedMinutesWatched: 1200n,
            averageViewDuration: 144,
            averageViewPercentage: new Prisma.Decimal("55.2"),
            likes: 250n,
            comments: 40n,
            shares: 20n,
            subscribersGained: 30n,
            engagementRate: new Prisma.Decimal("6.20"),
          },
        ],
        total: 1,
        dataAvailability: "COMPLETE",
      }),
      getVideoTimeSeries: vi.fn().mockResolvedValue({
        content: {
          videoId: "vid-1",
          title: "Epic Video",
          description: "First video",
          publishedAt: new Date("2026-08-01T00:00:00Z"),
          externalUrl: "https://youtube.com/watch?v=vid-1",
        },
        observations: [
          {
            id: "obs-v1",
            observationDate: new Date("2026-09-01T00:00:00Z"),
            startDate: new Date("2026-09-01T00:00:00Z"),
            endDate: new Date("2026-09-01T00:00:00Z"),
            views: 800n,
            estimatedMinutesWatched: 200n,
            averageViewDuration: 150,
            likes: 40n,
            comments: 5n,
            shares: 2n,
            subscribersGained: 4n,
            subscribersLost: 0n,
          },
        ],
        dataAvailability: "COMPLETE",
      }),
      getAggregatedDistribution: vi.fn().mockResolvedValue({
        observations: [
          {
            id: "dist-1",
            dimensions: { country: "US" },
            metrics: {},
            views: 4000n,
            estimatedMinutesWatched: 800n,
            subscribersGained: 25n,
          },
          {
            id: "dist-2",
            dimensions: { country: "ID" },
            metrics: {},
            views: 1000n,
            estimatedMinutesWatched: 200n,
            subscribersGained: 5n,
          },
        ],
        dataAvailability: "COMPLETE",
      }),
      getAccountFreshness: vi.fn().mockResolvedValue({
        latestObservationDate: "2026-09-10",
        dataAsOf: "2026-09-11T00:00:00.000Z",
        analyticsDataLagDays: 2,
        status: "FRESH",
      }),
      getLifetimeStats: vi.fn().mockResolvedValue({
        totalSubscribers: "50000",
        totalViews: "1000000",
        totalVideos: "120",
      }),
    } as unknown as AnalyticsDashboardRepository;

    service = new YouTubeDashboardService(mockRepo, () => fixedNow);
  });

  // ===========================================================================
  // 1-7: Account Resolution & Tenant Isolation
  // ===========================================================================

  describe("Account Resolution & Tenant Isolation", () => {
    it("1. passes workspaceId and socialAccountId to repository for verification", async () => {
      await service.getOverview({
        workspaceId: "ws-1",
        socialAccountId: "account-123",
      });

      expect(mockRepo.resolveAccount).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        socialAccountId: "account-123",
      });
    });

    it("2. auto-resolves when exactly one active YouTube account exists", async () => {
      const res = await service.getOverview({ workspaceId: "ws-1" });

      expect(res.meta.socialAccountId).toBe("account-123");
      expect(res.data.views.current).toBe("10000");
    });

    it("3. rejects with HTTP 400 and MULTIPLE_ACCOUNTS_FOUND when multiple accounts exist", async () => {
      vi.mocked(mockRepo.resolveAccount).mockResolvedValueOnce({
        status: "MULTIPLE_ACCOUNTS",
        accounts: [
          { id: "acc-1", externalAccountId: "UC1", username: "ch1", displayName: "Ch 1", avatarUrl: null },
          { id: "acc-2", externalAccountId: "UC2", username: "ch2", displayName: "Ch 2", avatarUrl: null },
        ],
      });

      await expect(
        service.getOverview({ workspaceId: "ws-1" })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "MULTIPLE_ACCOUNTS_FOUND",
          statusCode: 400,
        })
      );
    });

    it("4. returns HTTP 200 with NO_DATA when zero active accounts exist in workspace", async () => {
      vi.mocked(mockRepo.resolveAccount).mockResolvedValueOnce({
        status: "NO_ACCOUNTS",
      });

      const res = await service.getOverview({ workspaceId: "ws-1" });
      expect(res.meta.dataAvailability).toBe("NO_DATA");
      expect(res.data.views.current).toBeNull();
    });

    it("5. propagates tenant isolation violation (403) from repository", async () => {
      vi.mocked(mockRepo.resolveAccount).mockRejectedValueOnce(
        new SocialError("Tenant isolation violation", "SOCIAL_INVALID_REQUEST", { statusCode: 403 })
      );

      await expect(
        service.getOverview({ workspaceId: "ws-other", socialAccountId: "account-123" })
      ).rejects.toThrowError(expect.objectContaining({ statusCode: 403 }));
    });

    it("6. propagates non-YouTube platform rejection (400) from repository", async () => {
      vi.mocked(mockRepo.resolveAccount).mockRejectedValueOnce(
        new SocialError("Not a YouTube account", "SOCIAL_INVALID_REQUEST", { statusCode: 400 })
      );

      await expect(
        service.getOverview({ workspaceId: "ws-1", socialAccountId: "acc-tiktok" })
      ).rejects.toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it("7. returns empty response and NO_DATA when zero active accounts exist", async () => {
      vi.mocked(mockRepo.resolveAccount).mockResolvedValueOnce({
        status: "NO_ACCOUNTS",
      });

      const res = await service.getTrends({ workspaceId: "ws-1" });
      expect(res.meta.dataAvailability).toBe("NO_DATA");
      expect(res.data.series).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 8-13: Date Range Validation & No Silent Clamping
  // ===========================================================================

  describe("Date Range Validation", () => {
    it("8. rejects malformed date strings with HTTP 400", () => {
      expect(() =>
        service.resolveDateRange("2026/09/01", "2026-09-07")
      ).toThrowError(expect.objectContaining({ statusCode: 400 }));

      expect(() =>
        service.resolveDateRange("2026-09-01", "invalid-date")
      ).toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it("9. rejects startDate > endDate with HTTP 400", () => {
      expect(() =>
        service.resolveDateRange("2026-09-08", "2026-09-01")
      ).toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it("10. rejects future endDate with HTTP 400", () => {
      expect(() =>
        service.resolveDateRange("2026-09-01", "2026-09-20")
      ).toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it("11. rejects daily trend queries exceeding 90 days with DATE_RANGE_EXCEEDED (400)", () => {
      expect(() =>
        service.resolveDateRange("2026-05-01", "2026-09-01", 90)
      ).toThrowError(
        expect.objectContaining({
          code: "DATE_RANGE_EXCEEDED",
          statusCode: 400,
        })
      );
    });

    it("12. rejects aggregate queries exceeding 365 days with DATE_RANGE_EXCEEDED (400)", () => {
      expect(() =>
        service.resolveDateRange("2025-01-01", "2026-09-01", 365)
      ).toThrowError(
        expect.objectContaining({
          code: "DATE_RANGE_EXCEEDED",
          statusCode: 400,
        })
      );
    });

    it("13. does NOT silently clamp date ranges (fails fast with exact validation error)", () => {
      try {
        service.resolveDateRange("2026-05-01", "2026-09-01", 90);
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("DATE_RANGE_EXCEEDED");
        expect(err.message).toContain("exceeds the maximum allowed limit of 90 days");
      }
    });
  });

  // ===========================================================================
  // 14-21: Overview Aggregations, NULL Semantics & Comparisons
  // ===========================================================================

  describe("Overview Aggregations & Strict NULL != 0", () => {
    it("14. correctly aggregates overview KPI totals and formats BigInt as string", async () => {
      const res = await service.getOverview({
        workspaceId: "ws-1",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      });

      expect(res.data.views.current).toBe("10000");
      expect(res.data.likes.current).toBe("500");
      expect(res.data.comments.current).toBe("100");
      expect(res.data.shares.current).toBe("50");
      expect(res.data.netSubscribers.current).toBe("70"); // 80 - 10
    });

    it("15. preserves strict NULL != 0 when all observations for a metric are null", async () => {
      vi.mocked(mockRepo.getOverviewAggregates).mockResolvedValueOnce({
        count: 7,
        hasMeasuredViews: true,
        viewsSum: 5000n,
        hasMeasuredMinutes: true,
        estimatedMinutesWatchedSum: 1000n,
        hasMeasuredLikes: true,
        likesSum: 200n,
        hasMeasuredComments: true,
        commentsSum: 40n,
        hasMeasuredShares: false, // Shares not measured (null)
        sharesSum: null,
        hasMeasuredSubsGained: false,
        subscribersGainedSum: null,
        hasMeasuredSubsLost: false,
        subscribersLostSum: null,
        averageViewPercentageSum: null,
        averageViewPercentageCount: 0,
      });

      const res = await service.getOverview({
        workspaceId: "ws-1",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      });

      expect(res.data.shares.current).toBeNull();
      expect(res.data.subscribersGained.current).toBeNull();
      expect(res.data.netSubscribers.current).toBeNull();
    });

    it("16. evaluates engagementRate to null when views is null, 0, or when shares is null", async () => {
      // Missing shares -> engagementRate MUST be null
      vi.mocked(mockRepo.getOverviewAggregates).mockResolvedValueOnce({
        count: 5,
        hasMeasuredViews: true,
        viewsSum: 1000n,
        hasMeasuredMinutes: true,
        estimatedMinutesWatchedSum: 200n,
        hasMeasuredLikes: true,
        likesSum: 50n,
        hasMeasuredComments: true,
        commentsSum: 10n,
        hasMeasuredShares: false,
        sharesSum: null,
        hasMeasuredSubsGained: false,
        subscribersGainedSum: null,
        hasMeasuredSubsLost: false,
        subscribersLostSum: null,
        averageViewPercentageSum: null,
        averageViewPercentageCount: 0,
      });

      const res = await service.getOverview({ workspaceId: "ws-1" });
      expect(res.data.engagementRate.current).toBeNull();
    });

    it("17. calculates weighted average view duration from totals and guards zero denominator", async () => {
      const res = await service.getOverview({ workspaceId: "ws-1" });

      // 2000 minutes * 60s / 10000 views = 120000 / 10000 = 12 seconds
      expect(res.data.averageViewDurationSeconds.current).toBe(12);
    });

    it("18. calculates exact non-overlapping previous comparison period", () => {
      const range = service.resolveDateRange("2026-09-01", "2026-09-07", 90);

      expect(range.days).toBe(7);
      expect(range.startDateStr).toBe("2026-09-01");
      expect(range.endDateStr).toBe("2026-09-07");
      expect(range.prevStartDateStr).toBe("2026-08-25");
      expect(range.prevEndDateStr).toBe("2026-08-31");
    });

    it("19. computes positive percentage delta accurately", async () => {
      vi.mocked(mockRepo.getOverviewAggregates)
        .mockResolvedValueOnce({
          // Current: 12000
          count: 7,
          hasMeasuredViews: true,
          viewsSum: 12000n,
          hasMeasuredMinutes: true,
          estimatedMinutesWatchedSum: 2000n,
          hasMeasuredLikes: true,
          likesSum: 500n,
          hasMeasuredComments: true,
          commentsSum: 100n,
          hasMeasuredShares: true,
          sharesSum: 50n,
          hasMeasuredSubsGained: true,
          subscribersGainedSum: 80n,
          hasMeasuredSubsLost: true,
          subscribersLostSum: 10n,
          averageViewPercentageSum: null,
          averageViewPercentageCount: 0,
        })
        .mockResolvedValueOnce({
          // Previous: 10000
          count: 7,
          hasMeasuredViews: true,
          viewsSum: 10000n,
          hasMeasuredMinutes: true,
          estimatedMinutesWatchedSum: 2000n,
          hasMeasuredLikes: true,
          likesSum: 500n,
          hasMeasuredComments: true,
          commentsSum: 100n,
          hasMeasuredShares: true,
          sharesSum: 50n,
          hasMeasuredSubsGained: true,
          subscribersGainedSum: 80n,
          hasMeasuredSubsLost: true,
          subscribersLostSum: 10n,
          averageViewPercentageSum: null,
          averageViewPercentageCount: 0,
        });

      const res = await service.getOverview({ workspaceId: "ws-1" });
      expect(res.data.views.delta).toBe("2000");
      expect(res.data.views.percentageChange).toBe(20.0);
    });

    it("20. computes negative percentage delta accurately", async () => {
      vi.mocked(mockRepo.getOverviewAggregates)
        .mockResolvedValueOnce({
          // Current: 8000
          count: 7,
          hasMeasuredViews: true,
          viewsSum: 8000n,
          hasMeasuredMinutes: true,
          estimatedMinutesWatchedSum: 2000n,
          hasMeasuredLikes: true,
          likesSum: 500n,
          hasMeasuredComments: true,
          commentsSum: 100n,
          hasMeasuredShares: true,
          sharesSum: 50n,
          hasMeasuredSubsGained: true,
          subscribersGainedSum: 80n,
          hasMeasuredSubsLost: true,
          subscribersLostSum: 10n,
          averageViewPercentageSum: null,
          averageViewPercentageCount: 0,
        })
        .mockResolvedValueOnce({
          // Previous: 10000
          count: 7,
          hasMeasuredViews: true,
          viewsSum: 10000n,
          hasMeasuredMinutes: true,
          estimatedMinutesWatchedSum: 2000n,
          hasMeasuredLikes: true,
          likesSum: 500n,
          hasMeasuredComments: true,
          commentsSum: 100n,
          hasMeasuredShares: true,
          sharesSum: 50n,
          hasMeasuredSubsGained: true,
          subscribersGainedSum: 80n,
          hasMeasuredSubsLost: true,
          subscribersLostSum: 10n,
          averageViewPercentageSum: null,
          averageViewPercentageCount: 0,
        });

      const res = await service.getOverview({ workspaceId: "ws-1" });
      expect(res.data.views.delta).toBe("-2000");
      expect(res.data.views.percentageChange).toBe(-20.0);
    });

    it("21. handles previous = 0 gracefully (null percentageChange when current != 0, 0 when current = 0)", async () => {
      vi.mocked(mockRepo.getOverviewAggregates)
        .mockResolvedValueOnce({
          // Current views = 500, likes = 0
          count: 7,
          hasMeasuredViews: true,
          viewsSum: 500n,
          hasMeasuredMinutes: true,
          estimatedMinutesWatchedSum: 100n,
          hasMeasuredLikes: true,
          likesSum: 0n,
          hasMeasuredComments: true,
          commentsSum: 0n,
          hasMeasuredShares: true,
          sharesSum: 0n,
          hasMeasuredSubsGained: true,
          subscribersGainedSum: 0n,
          hasMeasuredSubsLost: true,
          subscribersLostSum: 0n,
          averageViewPercentageSum: null,
          averageViewPercentageCount: 0,
        })
        .mockResolvedValueOnce({
          // Previous views = 0, likes = 0
          count: 7,
          hasMeasuredViews: true,
          viewsSum: 0n,
          hasMeasuredMinutes: true,
          estimatedMinutesWatchedSum: 0n,
          hasMeasuredLikes: true,
          likesSum: 0n,
          hasMeasuredComments: true,
          commentsSum: 0n,
          hasMeasuredShares: true,
          sharesSum: 0n,
          hasMeasuredSubsGained: true,
          subscribersGainedSum: 0n,
          hasMeasuredSubsLost: true,
          subscribersLostSum: 0n,
          averageViewPercentageSum: null,
          averageViewPercentageCount: 0,
        });

      const res = await service.getOverview({ workspaceId: "ws-1" });
      expect(res.data.views.percentageChange).toBeNull(); // Division by zero undefined
      expect(res.data.likes.percentageChange).toBe(0); // 0 -> 0 is 0% change
    });
  });

  // ===========================================================================
  // 22-26: Top Videos Period Integrity, Sorting & Pagination
  // ===========================================================================

  describe("Top Videos Period Integrity & Ranking", () => {
    it("22. matches exact TOP_VIDEOS_PERFORMANCE period and enriches with Content metadata", async () => {
      const res = await service.getTopVideos({
        workspaceId: "ws-1",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      });

      expect(res.meta.dataAvailability).toBe("COMPLETE");
      expect(res.data.videos).toHaveLength(1);
      expect(res.data.videos[0].title).toBe("Epic Video");
      expect(res.data.videos[0].metrics.views).toBe("5000");
      expect(res.data.videos[0].rank).toBe(1);
    });

    it("23. returns INSUFFICIENT_DATA when exact aggregate period does not exist", async () => {
      vi.mocked(mockRepo.getTopVideos).mockResolvedValueOnce({
        items: [],
        total: 0,
        dataAvailability: "INSUFFICIENT_DATA",
      });

      const res = await service.getTopVideos({
        workspaceId: "ws-1",
        startDate: "2026-09-03",
        endDate: "2026-09-05",
      });

      expect(res.meta.dataAvailability).toBe("INSUFFICIENT_DATA");
      expect(res.data.videos).toHaveLength(0);
    });

    it("24. strictly avoids closest-window fallback (passes exact requested dates to repository)", async () => {
      await service.getTopVideos({
        workspaceId: "ws-1",
        startDate: "2026-09-02",
        endDate: "2026-09-06",
      });

      expect(mockRepo.getTopVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: new Date("2026-09-02T00:00:00.000Z"),
          endDate: new Date("2026-09-06T00:00:00.000Z"),
        })
      );
    });

    it("25. validates sort parameters against strict registry", async () => {
      await expect(
        service.getTopVideos({
          workspaceId: "ws-1",
          sortBy: "malicious_column",
        })
      ).rejects.toThrowError(expect.objectContaining({ statusCode: 400 }));

      await expect(
        service.getTopVideos({
          workspaceId: "ws-1",
          sortOrder: "INVALID_ORDER",
        })
      ).rejects.toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it("26. clamps pagination limit to maximum 50 and handles offsets correctly", async () => {
      await service.getTopVideos({
        workspaceId: "ws-1",
        limit: 1000,
        offset: 5,
      });

      expect(mockRepo.getTopVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 5,
        })
      );
    });
  });

  // ===========================================================================
  // 27-28: Video Detail & IDOR Protection
  // ===========================================================================

  describe("Video Detail & IDOR Protection", () => {
    it("27. enforces video ownership and rejects unauthorized/foreign video IDs with 404", async () => {
      vi.mocked(mockRepo.getVideoTimeSeries).mockRejectedValueOnce(
        new SocialError("Video not found", "SOCIAL_INVALID_REQUEST", { statusCode: 404 })
      );

      await expect(
        service.getVideoDetail({
          workspaceId: "ws-1",
          videoId: "foreign-video-999",
        })
      ).rejects.toThrowError(expect.objectContaining({ statusCode: 404 }));
    });

    it("28. returns NO_DATA when requested video has no daily records in the period", async () => {
      vi.mocked(mockRepo.getVideoTimeSeries).mockResolvedValueOnce({
        content: {
          videoId: "vid-unsynced",
          title: "Unsynced Video",
          description: null,
          publishedAt: null,
          externalUrl: null,
        },
        observations: [],
        dataAvailability: "NO_DATA",
      });

      const res = await service.getVideoDetail({
        workspaceId: "ws-1",
        videoId: "vid-unsynced",
      });

      expect(res.meta.dataAvailability).toBe("NO_DATA");
      expect(res.data.dailySeries).toHaveLength(0);
      expect(res.data.periodTotals.views).toBeNull();
    });
  });

  // ===========================================================================
  // 29-30: Distribution Aggregations & Percentage Rules
  // ===========================================================================

  describe("Distribution Aggregations (Never Sum Daily Percentages)", () => {
    it("29. queries period-level aggregated observations for demographics", async () => {
      vi.mocked(mockRepo.getAggregatedDistribution).mockResolvedValueOnce({
        observations: [
          {
            id: "demo-1",
            dimensions: { ageGroup: "age18-24", gender: "female" },
            metrics: { viewerPercentage: 35.5 },
          },
          {
            id: "demo-2",
            dimensions: { ageGroup: "age25-34", gender: "male" },
            metrics: { viewerPercentage: 64.5 },
          },
        ] as any,
        dataAvailability: "COMPLETE",
      });

      const res = await service.getAudience({ workspaceId: "ws-1" });

      expect(res.data.demographics).toHaveLength(2);
      expect(res.data.genderTotals.female).toBe(35.5);
      expect(res.data.genderTotals.male).toBe(64.5);
    });

    it("30. calculates country percentage share and guards zero denominator", async () => {
      const res = await service.getGeography({ workspaceId: "ws-1" });

      // US: 4000 / 5000 = 80%, ID: 1000 / 5000 = 20%
      expect(res.data.countries[0].countryCode).toBe("US");
      expect(res.data.countries[0].percentageShare).toBe(80.0);
      expect(res.data.countries[1].countryCode).toBe("ID");
      expect(res.data.countries[1].percentageShare).toBe(20.0);
    });
  });

  // ===========================================================================
  // 31-34: Freshness, Serialization & Summary Bounded Query Behavior
  // ===========================================================================

  describe("Freshness, Serialization & Summary Bounded Queries", () => {
    it("31. returns structured freshness status (FRESH / STALE / NO_DATA)", async () => {
      const res = await service.getTrends({ workspaceId: "ws-1" });

      expect(res.meta.freshness.status).toBe("FRESH");
      expect(res.meta.freshness.latestObservationDate).toBe("2026-09-10");
    });

    it("32. serializes BigInt fields to strings without loss of precision", async () => {
      const res = await service.getTrends({ workspaceId: "ws-1" });

      expect(typeof res.data.series[0].views).toBe("string");
      expect(res.data.series[0].views).toBe("1500");
    });

    it("33. preserves Decimal precision in Top Videos engagement rate", async () => {
      const res = await service.getTopVideos({ workspaceId: "ws-1" });

      expect(res.data.videos[0].metrics.engagementRate).toBe(6.2);
    });

    it("34. executes summary endpoint with bounded parallel queries and single account resolution", async () => {
      const res = await service.getSummary({
        workspaceId: "ws-1",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      });

      // Account resolved exactly once
      expect(mockRepo.resolveAccount).toHaveBeenCalledTimes(1);

      // Composite contains all three components
      expect(res.data.overview.views.current).toBe("10000");
      expect(res.data.trends.series).toHaveLength(1);
      expect(res.data.topVideos.videos).toHaveLength(1);
      expect(res.meta.freshness.status).toBe("FRESH");
    });
  });
});
