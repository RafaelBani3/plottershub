import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalyticsRepository } from "./analytics.repository";
import {
  calculateIdentityHash,
  buildAnalyticsProjections,
} from "./analytics.projections";
import { AnalyticsObservation } from "../types";
import { buildObservationIdentityKey } from "../providers/youtube/youtube.analytics-mapper";
import { Prisma } from "@prisma/client";

describe("Phase 3.3C — Analytics Data Model & Persistence", () => {
  let mockPrisma: any;
  let repository: AnalyticsRepository;

  const validWorkspaceId = "ws_test_123";
  const validAccountId = "acc_test_456";

  beforeEach(() => {
    mockPrisma = {
      socialAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: validAccountId,
          workspaceId: validWorkspaceId,
        }),
      },
      analyticsObservation: {
        upsert: vi.fn().mockImplementation(({ create }) => {
          return Promise.resolve({
            id: "obs_test_cuid",
            ...create,
          });
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
    };

    repository = new AnalyticsRepository(mockPrisma as any);
  });

  // ===========================================================================
  // A. Create Daily Observation
  // ===========================================================================
  it("A: projects and persists a daily observation with observationDate populated", async () => {
    const observation: AnalyticsObservation = {
      identityKey: buildObservationIdentityKey({
        provider: "YOUTUBE",
        source: "ANALYTICS_API",
        socialAccountId: validAccountId,
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        granularity: "DAILY",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        observationDate: "2026-03-05",
      }),
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-10",
      observationDate: "2026-03-05",
      metrics: {
        views: 1250n,
        likes: 84n,
        subscribersGained: 12n,
      },
      capturedAt: new Date("2026-03-11T10:00:00.000Z"),
    };

    const record = await repository.upsertObservation(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
      syncJobId: "job_sync_001",
      dataLagDays: 2,
    });

    expect(mockPrisma.socialAccount.findUnique).toHaveBeenCalledWith({
      where: { id: validAccountId },
      select: { id: true, workspaceId: true },
    });

    expect(mockPrisma.analyticsObservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          identityHash: calculateIdentityHash(observation.identityKey),
        },
        create: expect.objectContaining({
          workspaceId: validWorkspaceId,
          socialAccountId: validAccountId,
          granularity: "DAILY",
          observationDate: new Date("2026-03-05T00:00:00.000Z"),
          views: 1250n,
          likes: 84n,
          subscribersGained: 12n,
          syncJobId: "job_sync_001",
          dataLagDays: 2,
        }),
      })
    );

    expect(record.granularity).toBe("DAILY");
  });

  // ===========================================================================
  // B. Create Aggregated Observation
  // ===========================================================================
  it("B: projects and persists an aggregated observation with observationDate as null", async () => {
    const observation: AnalyticsObservation = {
      identityKey: buildObservationIdentityKey({
        provider: "YOUTUBE",
        source: "ANALYTICS_API",
        socialAccountId: validAccountId,
        queryPattern: "TOP_VIDEOS_PERFORMANCE",
        granularity: "AGGREGATED",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        observationDate: null,
        dimensions: { video: "vid_top_01" },
      }),
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "TOP_VIDEOS_PERFORMANCE",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      observationDate: null,
      dimensions: { video: "vid_top_01" },
      metrics: {
        views: 54000n,
        averageViewPercentage: 64.5,
      },
      capturedAt: new Date(),
    };

    await repository.upsertObservation(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    expect(mockPrisma.analyticsObservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          granularity: "AGGREGATED",
          observationDate: null,
          externalContentId: "vid_top_01",
          views: 54000n,
          averageViewPercentage: new Prisma.Decimal("64.5"),
        }),
      })
    );
  });

  // ===========================================================================
  // C. Video Observation with externalContentId
  // ===========================================================================
  it("C: extracts externalContentId from dimensions.video as an indexed resolver attribute", () => {
    const observation: AnalyticsObservation = {
      identityKey: "test_key",
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "VIDEO_DAILY_TIME_SERIES",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-10",
      dimensions: { video: "youtube_video_xyz987" },
      metrics: { views: 200n },
      capturedAt: new Date(),
    };

    const projection = buildAnalyticsProjections(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    expect(projection.externalContentId).toBe("youtube_video_xyz987");
    expect(projection.dimensions).toEqual({ video: "youtube_video_xyz987" });
  });

  // ===========================================================================
  // D. Multi-Dimensional Observation
  // ===========================================================================
  it("D: supports multi-dimensional observations in JSONB dimensions", async () => {
    const observation: AnalyticsObservation = {
      identityKey: buildObservationIdentityKey({
        provider: "YOUTUBE",
        source: "ANALYTICS_API",
        socialAccountId: validAccountId,
        queryPattern: "DEVICE_DISTRIBUTION",
        granularity: "AGGREGATED",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        dimensions: { country: "ID", deviceType: "MOBILE" },
      }),
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "DEVICE_DISTRIBUTION",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      dimensions: { country: "ID", deviceType: "MOBILE" },
      metrics: {
        views: 8900n,
        estimatedMinutesWatched: 12500n,
      },
      capturedAt: new Date(),
    };

    await repository.upsertObservation(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    expect(mockPrisma.analyticsObservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          dimensions: { country: "ID", deviceType: "MOBILE" },
          views: 8900n,
          estimatedMinutesWatched: 12500n,
        }),
      })
    );
  });

  // ===========================================================================
  // E. Explicit Zero Preservation (NULL != 0)
  // ===========================================================================
  it("E: preserves explicit 0 as 0n in relational columns and '0' in JSONB", () => {
    const observation: AnalyticsObservation = {
      identityKey: "test_zero_key",
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      metrics: {
        views: 0n,
        shares: 0,
        subscribersLost: "0",
      },
      capturedAt: new Date(),
    };

    const projection = buildAnalyticsProjections(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    expect(projection.views).toBe(0n);
    expect(projection.shares).toBe(0n);
    expect(projection.subscribersLost).toBe(0n);
    expect(projection.metrics.views).toBe("0");
    expect(projection.metrics.shares).toBe(0);
    expect(projection.metrics.subscribersLost).toBe("0");
  });

  // ===========================================================================
  // F. Strict NULL Preservation
  // ===========================================================================
  it("F: preserves null for missing/suppressed metrics without coercing to zero", () => {
    const observation: AnalyticsObservation = {
      identityKey: "test_null_key",
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "VIEWER_DEMOGRAPHICS",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      metrics: {
        viewerPercentage: null,
        views: null,
      },
      capturedAt: new Date(),
    };

    const projection = buildAnalyticsProjections(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    expect(projection.views).toBeNull();
    expect(projection.averageViewPercentage).toBeNull();
    expect(projection.metrics.viewerPercentage).toBeNull();
    expect(projection.metrics.views).toBeNull();
  });

  // ===========================================================================
  // G. BigInt Precision Preservation
  // ===========================================================================
  it("G: preserves large BigInt values (2^53 + 1) without precision loss", () => {
    const hugeCount = 9007199254740993n;
    const observation: AnalyticsObservation = {
      identityKey: "test_bigint_key",
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      metrics: {
        views: hugeCount,
        estimatedMinutesWatched: 9007199254740995n,
      },
      capturedAt: new Date(),
    };

    const projection = buildAnalyticsProjections(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    expect(projection.views).toBe(hugeCount);
    expect(projection.metrics.views).toBe("9007199254740993");
    expect(projection.metrics.estimatedMinutesWatched).toBe("9007199254740995");
  });

  // ===========================================================================
  // H. Decimal Precision
  // ===========================================================================
  it("H: preserves Decimal rate precision accurately", () => {
    const observation: AnalyticsObservation = {
      identityKey: "test_decimal_key",
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "TOP_VIDEOS_PERFORMANCE",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      metrics: {
        averageViewPercentage: 64.55,
        engagementRate: "4.1250",
      },
      capturedAt: new Date(),
    };

    const projection = buildAnalyticsProjections(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    expect(projection.averageViewPercentage?.toNumber()).toBe(64.55);
    expect(projection.engagementRate?.toNumber()).toBe(4.125);
    expect(projection.engagementRate?.toString()).toBe("4.125");
  });

  // ===========================================================================
  // I. Duplicate / Idempotent Upsert
  // ===========================================================================
  it("I: performs idempotent upsert using identityHash unique constraint", async () => {
    const observation: AnalyticsObservation = {
      identityKey: buildObservationIdentityKey({
        provider: "YOUTUBE",
        source: "ANALYTICS_API",
        socialAccountId: validAccountId,
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        granularity: "DAILY",
        startDate: "2026-03-01",
        endDate: "2026-03-01",
        observationDate: "2026-03-01",
      }),
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      observationDate: "2026-03-01",
      metrics: { views: 500n },
      capturedAt: new Date(),
    };

    // First write
    await repository.upsertObservation(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    // Re-sync with updated metrics
    observation.metrics.views = 520n;
    await repository.upsertObservation(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    expect(mockPrisma.analyticsObservation.upsert).toHaveBeenCalledTimes(2);
    const hash = calculateIdentityHash(observation.identityKey);
    expect(mockPrisma.analyticsObservation.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { identityHash: hash },
        update: expect.objectContaining({ views: 520n }),
      })
    );
  });

  // ===========================================================================
  // J. Concurrent Parallel Upsert Simulation
  // ===========================================================================
  it("J: handles concurrent parallel upserts safely without throwing unhandled collisions", async () => {
    const observation: AnalyticsObservation = {
      identityKey: "concurrent_key_001",
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      metrics: { views: 100n },
      capturedAt: new Date(),
    };

    const p1 = repository.upsertObservation(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });
    const p2 = repository.upsertObservation(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
  });

  // ===========================================================================
  // K. Date Range Isolation for Aggregated Observations
  // ===========================================================================
  it("K: ensures different date ranges generate distinct identity keys and hashes", () => {
    const keyJan = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "TOP_VIDEOS_PERFORMANCE",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      dimensions: { video: "vid_1" },
    });

    const keyFeb = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "TOP_VIDEOS_PERFORMANCE",
      granularity: "AGGREGATED",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      dimensions: { video: "vid_1" },
    });

    expect(keyJan).not.toBe(keyFeb);
    expect(calculateIdentityHash(keyJan)).not.toBe(calculateIdentityHash(keyFeb));
  });

  // ===========================================================================
  // L. Multi-Video Isolation
  // ===========================================================================
  it("L: ensures different videos on the same date produce distinct identities", () => {
    const keyVidA = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "VIDEO_DAILY_TIME_SERIES",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-10",
      observationDate: "2026-03-05",
      dimensions: { video: "vid_AAA" },
    });

    const keyVidB = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "VIDEO_DAILY_TIME_SERIES",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-10",
      observationDate: "2026-03-05",
      dimensions: { video: "vid_BBB" },
    });

    expect(keyVidA).not.toBe(keyVidB);
    expect(calculateIdentityHash(keyVidA)).not.toBe(calculateIdentityHash(keyVidB));
  });

  // ===========================================================================
  // M. Dimension Order Invariance
  // ===========================================================================
  it("M: produces identical identity and identityHash regardless of dimension key order", () => {
    const key1 = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "DEVICE_DISTRIBUTION",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      dimensions: { country: "ID", deviceType: "MOBILE" },
    });

    const key2 = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "DEVICE_DISTRIBUTION",
      granularity: "AGGREGATED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      dimensions: { deviceType: "MOBILE", country: "ID" },
    });

    expect(key1).toBe(key2);
    expect(calculateIdentityHash(key1)).toBe(calculateIdentityHash(key2));
  });

  // ===========================================================================
  // N. Provider Isolation
  // ===========================================================================
  it("N: decouples provider identity (YOUTUBE vs TIKTOK vs INSTAGRAM)", () => {
    const ytKey = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    const ttKey = buildObservationIdentityKey({
      provider: "TIKTOK",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    expect(ytKey.startsWith("YOUTUBE:")).toBe(true);
    expect(ttKey.startsWith("TIKTOK:")).toBe(true);
    expect(calculateIdentityHash(ytKey)).not.toBe(calculateIdentityHash(ttKey));
  });

  // ===========================================================================
  // O. Source Isolation (ANALYTICS_API vs DATA_API)
  // ===========================================================================
  it("O: isolates telemetry source origin (ANALYTICS_API vs DATA_API)", () => {
    const analyticsKey = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    const dataApiKey = buildObservationIdentityKey({
      provider: "YOUTUBE",
      source: "DATA_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    expect(analyticsKey).toContain(":ANALYTICS_API:");
    expect(dataApiKey).toContain(":DATA_API:");
    expect(calculateIdentityHash(analyticsKey)).not.toBe(calculateIdentityHash(dataApiKey));
  });

  // ===========================================================================
  // P. Workspace Tenant Integrity Enforcement
  // ===========================================================================
  it("P: rejects writing observations when socialAccountId belongs to a different workspace", async () => {
    mockPrisma.socialAccount.findUnique.mockResolvedValueOnce({
      id: "acc_foreign",
      workspaceId: "ws_foreign_workspace",
    });

    const observation: AnalyticsObservation = {
      identityKey: "cross_tenant_key",
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: "acc_foreign",
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      metrics: { views: 10n },
      capturedAt: new Date(),
    };

    await expect(
      repository.upsertObservation(observation, {
        workspaceId: validWorkspaceId,
        socialAccountId: "acc_foreign",
      })
    ).rejects.toThrowError(/Tenant isolation violation/);
  });

  // ===========================================================================
  // Q. JSONB vs Relational Projection Synchronization
  // ===========================================================================
  it("Q: ensures JSONB metrics and promoted relational columns originate from the same domain observation", () => {
    const observation: AnalyticsObservation = {
      identityKey: "sync_check_key",
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      socialAccountId: validAccountId,
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      metrics: {
        views: 4500n,
        likes: 120n,
        averageViewDuration: 215,
        averageViewPercentage: 55.4,
      },
      capturedAt: new Date(),
    };

    const projection = buildAnalyticsProjections(observation, {
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
    });

    // Relational values
    expect(projection.views).toBe(4500n);
    expect(projection.likes).toBe(120n);
    expect(projection.averageViewDuration).toBe(215);
    expect(projection.averageViewPercentage?.toString()).toBe("55.4");

    // JSONB values
    expect(projection.metrics.views).toBe("4500");
    expect(projection.metrics.likes).toBe("120");
    expect(projection.metrics.averageViewDuration).toBe(215);
    expect(projection.metrics.averageViewPercentage).toBe(55.4);
  });

  // ===========================================================================
  // Edge Case: Serialization Safety for BigInt and Decimal
  // ===========================================================================
  it("serializes Prisma record into JSON-safe structure without BigInt TypeError", () => {
    const mockRecord: any = {
      id: "obs_123",
      workspaceId: validWorkspaceId,
      socialAccountId: validAccountId,
      externalAccountId: "UC123",
      externalContentId: null,
      provider: "YOUTUBE",
      source: "ANALYTICS_API",
      queryPattern: "CHANNEL_DAILY_OVERVIEW",
      granularity: "DAILY",
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-10T00:00:00.000Z"),
      observationDate: new Date("2026-03-05T00:00:00.000Z"),
      identityKey: "test_key",
      identityHash: "test_hash",
      dimensions: null,
      metrics: { views: "5000", likes: "100" },
      views: 5000n,
      estimatedMinutesWatched: 12000n,
      averageViewDuration: 144,
      averageViewPercentage: new Prisma.Decimal("50.00"),
      likes: 100n,
      comments: null,
      shares: 0n,
      saves: null,
      subscribersGained: 10n,
      subscribersLost: 2n,
      engagementRate: new Prisma.Decimal("2.0000"),
      capturedAt: new Date("2026-03-11T10:00:00.000Z"),
      syncJobId: "job_1",
      dataLagDays: 2,
    };

    const serialized = repository.serializeObservation(mockRecord);
    expect(serialized.views).toBe("5000");
    expect(serialized.shares).toBe("0");
    expect(serialized.comments).toBeNull();
    expect(serialized.averageViewPercentage).toBe("50");
    expect(serialized.startDate).toBe("2026-03-01");
    expect(serialized.observationDate).toBe("2026-03-05");

    // Must be directly JSON-serializable
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });
});
