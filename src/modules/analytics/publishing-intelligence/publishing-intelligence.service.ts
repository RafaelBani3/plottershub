/**
 * Phase 3.4G: Publishing Intelligence Calculation Service
 *
 * Source of Truth: docs/YOUTUBE_PUBLISHING_INTELLIGENCE_IMPLEMENTATION_SPEC.md
 *
 * Implements on-demand, non-causal synthesis of:
 * - Signal A: Historical Consumption Pattern (Daily channel-wide watch time/views)
 * - Signal B: Content Supply (Upload volume by local day-of-week and 1-hour bucket)
 * - Signal C: Publishing Performance (Day 1, Day 2 cumulative, Day 3 cumulative launch velocity)
 *
 * Enforces:
 * - Zero new database tables / zero mutations of historical data
 * - Strict format segmentation (LONG_FORM vs SHORTS)
 * - Explicit IANA timezone conversions
 * - Analytics reporting lag boundaries
 * - Evidence strength framework (INSUFFICIENT, LOW, MODERATE, HIGH)
 * - Neutral descriptive quadrants (No "Best/Optimal" rankings)
 */

import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { SocialError } from "@/modules/social/errors";
import { classifyYouTubeVideo } from "@/modules/social/providers/youtube/youtube.mapper";
import {
  ConsumptionPatternDay,
  ConsumptionRelativeLevel,
  ContentSupplyBucket,
  EvidenceStrength,
  NarrativeObservation,
  ObservedPublishingWindow,
  PublishingIntelligenceDTO,
  PublishingIntelligenceFormat,
  PublishingIntelligenceQueryInput,
  WindowPerformance,
} from "./publishing-intelligence.types";
import {
  DAYS_OF_WEEK,
  DayOfWeekName,
  formatOneHourWindowLabel,
  formatUtcDateString,
  getLocalPublishingTime,
  isValidIanaTimezone,
} from "./publishing-intelligence.time";
import {
  calculateMedian,
  classifyQuadrant,
  evaluateEvidenceStrength,
} from "./publishing-intelligence.calculator";

export class PublishingIntelligenceService {
  private db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  /**
   * Generates Publishing Intelligence on-demand for a connected social account.
   */
  async getPublishingIntelligence(
    workspaceId: string,
    input: PublishingIntelligenceQueryInput
  ): Promise<PublishingIntelligenceDTO> {
    // 1. Account & Workspace Verification
    const account = await this.db.socialAccount.findUnique({
      where: { id: input.socialAccountId },
      include: {
        platform: true,
        token: true,
      },
    });

    if (!account) {
      throw new SocialError(
        `Social account '${input.socialAccountId}' was not found.`,
        "SOCIAL_ACCOUNT_RESTRICTED",
        { statusCode: 404 }
      );
    }

    if (account.workspaceId !== workspaceId) {
      throw new SocialError(
        `Tenant isolation violation: Social account '${input.socialAccountId}' does not belong to workspace '${workspaceId}'.`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 403 }
      );
    }

    // 2. Resolve Parameters & Timezone
    const format: PublishingIntelligenceFormat =
      input.format === "SHORTS" ? "SHORTS" : "LONG_FORM";

    const lookbackDays = [30, 60, 90, 180].includes(input.lookbackDays ?? 0)
      ? input.lookbackDays!
      : 90;

    // Timezone resolution: Query param -> Account settings/token -> default UTC
    const requestedTimezone = input.publishingTimezone?.trim();
    const configuredTimezone = (account as any).publishingTimezone || "UTC";
    const timezone = isValidIanaTimezone(requestedTimezone || "")
      ? requestedTimezone!
      : isValidIanaTimezone(configuredTimezone)
      ? configuredTimezone
      : "UTC";

    // 3. Analytics Lag Boundary Calculation
    // YouTube Analytics reporting lag is 48-72h (default 2 full calendar days).
    const analyticsLagDays = 2;
    const now = new Date();
    const dataCutoffDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - analyticsLagDays,
        23,
        59,
        59,
        999
      )
    );

    const startDate = new Date(
      Date.UTC(
        dataCutoffDate.getUTCFullYear(),
        dataCutoffDate.getUTCMonth(),
        dataCutoffDate.getUTCDate() - lookbackDays,
        0,
        0,
        0,
        0
      )
    );

    // 4. Signal A: Historical Consumption Pattern (Channel Daily Overview)
    const consumptionObservations = await this.db.analyticsObservation.findMany({
      where: {
        workspaceId,
        socialAccountId: account.id,
        queryPattern: "CHANNEL_DAILY_OVERVIEW",
        observationDate: {
          gte: startDate,
          lte: dataCutoffDate,
        },
      },
      select: {
        observationDate: true,
        views: true,
        estimatedMinutesWatched: true,
      },
    });

    const consumptionMap: Record<
      DayOfWeekName,
      { views: number; watchTime: number; count: number }
    > = {
      Monday: { views: 0, watchTime: 0, count: 0 },
      Tuesday: { views: 0, watchTime: 0, count: 0 },
      Wednesday: { views: 0, watchTime: 0, count: 0 },
      Thursday: { views: 0, watchTime: 0, count: 0 },
      Friday: { views: 0, watchTime: 0, count: 0 },
      Saturday: { views: 0, watchTime: 0, count: 0 },
      Sunday: { views: 0, watchTime: 0, count: 0 },
    };

    let totalConsumptionViews = 0;
    let totalConsumptionWatchTime = 0;
    let totalConsumptionDays = 0;

    for (const obs of consumptionObservations) {
      if (!obs.observationDate) continue;
      const obsDate = new Date(obs.observationDate);
      // Derive day of week in UTC (since YouTube observations are UTC-aligned)
      const dayName = obsDate.toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "UTC",
      }) as DayOfWeekName;

      if (consumptionMap[dayName]) {
        const v = Number(obs.views || 0);
        const w = Number(obs.estimatedMinutesWatched || 0);
        consumptionMap[dayName].views += v;
        consumptionMap[dayName].watchTime += w;
        consumptionMap[dayName].count += 1;
        totalConsumptionViews += v;
        totalConsumptionWatchTime += w;
        totalConsumptionDays += 1;
      }
    }

    const channelDailyMeanViews =
      totalConsumptionDays > 0
        ? Math.round(totalConsumptionViews / totalConsumptionDays)
        : 0;
    const channelDailyMeanWatchTime =
      totalConsumptionDays > 0
        ? Math.round(totalConsumptionWatchTime / totalConsumptionDays)
        : 0;

    const daysOfWeekConsumption: ConsumptionPatternDay[] = DAYS_OF_WEEK.map(
      (dayOfWeek, idx) => {
        const entry = consumptionMap[dayOfWeek];
        const avgViews =
          entry.count > 0 ? Math.round(entry.views / entry.count) : 0;
        const avgWatchTime =
          entry.count > 0 ? Math.round(entry.watchTime / entry.count) : 0;

        const consumptionIndex =
          channelDailyMeanViews > 0
            ? Number((avgViews / channelDailyMeanViews).toFixed(2))
            : 1.0;

        const relativeLevel: ConsumptionRelativeLevel =
          consumptionIndex >= 1.05
            ? "ABOVE_AVERAGE"
            : consumptionIndex <= 0.95
            ? "BELOW_AVERAGE"
            : "AVERAGE";

        return {
          dayOfWeek,
          dayIndex: idx + 1,
          totalViews: entry.views,
          totalWatchTimeMinutes: entry.watchTime,
          averageDailyViews: avgViews,
          averageDailyWatchTimeMinutes: avgWatchTime,
          consumptionIndex,
          relativeLevel,
          observationCount: entry.count,
        };
      }
    );

    // Identify Peak & Lowest Consumption Days
    const sortedByConsumption = [...daysOfWeekConsumption].sort(
      (a, b) => b.averageDailyViews - a.averageDailyViews
    );
    const peakConsumptionDay =
      channelDailyMeanViews > 0 ? sortedByConsumption[0]?.dayOfWeek || null : null;
    const lowestConsumptionDay =
      channelDailyMeanViews > 0
        ? sortedByConsumption[sortedByConsumption.length - 1]?.dayOfWeek || null
        : null;

    // 5. Retrieve Published Videos & Format Segmentation (Signal B: Content Supply)
    const publishedPlatformVideos = await this.db.contentPlatform.findMany({
      where: {
        socialAccountId: account.id,
        status: "PUBLISHED",
        publishedAt: {
          gte: startDate,
          lte: now,
        },
      },
      include: {
        content: {
          include: {
            assets: true,
          },
        },
      },
      orderBy: {
        publishedAt: "asc",
      },
    });

    interface ClassifiedVideo {
      contentPlatformId: string;
      externalContentId: string;
      title: string;
      publishedAtUtc: Date;
      format: PublishingIntelligenceFormat;
      isMaturing: boolean;
      localTime: ReturnType<typeof getLocalPublishingTime>;
    }

    const eligibleVideos: ClassifiedVideo[] = [];
    const totalVideosInCatalog = publishedPlatformVideos.length;

    for (const cp of publishedPlatformVideos) {
      if (!cp.publishedAt || !cp.externalContentId) continue;

      // Classify format using Phase 3.4C logic
      const metadata = (cp.metadata as Record<string, unknown>) || {};
      let detectedFormat = (metadata.contentType as string) || null;

      if (!detectedFormat) {
        const primaryAsset = cp.content.assets[0];
        const classification = classifyYouTubeVideo({
          snippet: {
            channelId: "",
            publishedAt: cp.publishedAt.toISOString(),
            title: cp.content.title,
            description: cp.content.description || "",
          },
          contentDetails: {
            duration: primaryAsset?.durationSeconds
              ? `PT${primaryAsset.durationSeconds}S`
              : "PT0S",
          },
        });
        detectedFormat = classification.contentType;
      }

      // Strictly exclude UNKNOWN or LIVE_STREAM from format-specific intelligence
      if (detectedFormat !== format) {
        continue;
      }

      const publishedAtUtc = new Date(cp.publishedAt);
      const isMaturing = publishedAtUtc > dataCutoffDate;
      const localTime = getLocalPublishingTime(publishedAtUtc, timezone);

      eligibleVideos.push({
        contentPlatformId: cp.id,
        externalContentId: cp.externalContentId,
        title: cp.content.title,
        publishedAtUtc,
        format,
        isMaturing,
        localTime,
      });
    }

    // 6. Signal C: Retrieve Post-Publication Launch Velocity Observations
    const finalizedVideos = eligibleVideos.filter((v) => !v.isMaturing);
    const finalizedVideoIds = finalizedVideos.map((v) => v.externalContentId);

    const videoDailyObservations =
      finalizedVideoIds.length > 0
        ? await this.db.analyticsObservation.findMany({
            where: {
              workspaceId,
              socialAccountId: account.id,
              externalContentId: { in: finalizedVideoIds },
              queryPattern: "VIDEO_DAILY_TIME_SERIES",
            },
            select: {
              externalContentId: true,
              observationDate: true,
              views: true,
              estimatedMinutesWatched: true,
            },
          })
        : [];

    // Group observations by video
    const videoObservationsMap: Record<
      string,
      Map<string, { views: number; watchTime: number }>
    > = {};

    for (const obs of videoDailyObservations) {
      if (!obs.externalContentId || !obs.observationDate) continue;
      if (!videoObservationsMap[obs.externalContentId]) {
        videoObservationsMap[obs.externalContentId] = new Map();
      }
      const dateKey = formatUtcDateString(new Date(obs.observationDate));
      videoObservationsMap[obs.externalContentId].set(dateKey, {
        views: Number(obs.views || 0),
        watchTime: Number(obs.estimatedMinutesWatched || 0),
      });
    }

    // Associate Day 1, Day 2 cumulative, Day 3 cumulative per video
    interface VideoLaunchMetrics {
      day1Views: number;
      day2CumulativeViews: number;
      day3CumulativeViews: number;
      day1WatchTime: number;
    }

    const videoMetricsMap = new Map<string, VideoLaunchMetrics>();
    const allFinalizedDay1Views: number[] = [];

    for (const v of finalizedVideos) {
      const obsMap = videoObservationsMap[v.externalContentId];
      if (!obsMap) continue;

      const pubUtc = v.publishedAtUtc;
      const day1Key = formatUtcDateString(pubUtc);

      const day2Date = new Date(
        Date.UTC(pubUtc.getUTCFullYear(), pubUtc.getUTCMonth(), pubUtc.getUTCDate() + 1)
      );
      const day2Key = formatUtcDateString(day2Date);

      const day3Date = new Date(
        Date.UTC(pubUtc.getUTCFullYear(), pubUtc.getUTCMonth(), pubUtc.getUTCDate() + 2)
      );
      const day3Key = formatUtcDateString(day3Date);

      const day1Data = obsMap.get(day1Key) || { views: 0, watchTime: 0 };
      const day2Data = obsMap.get(day2Key) || { views: 0, watchTime: 0 };
      const day3Data = obsMap.get(day3Key) || { views: 0, watchTime: 0 };

      const day1Views = day1Data.views;
      const day2CumulativeViews = day1Views + day2Data.views;
      const day3CumulativeViews = day2CumulativeViews + day3Data.views;
      const day1WatchTime = day1Data.watchTime;

      videoMetricsMap.set(v.externalContentId, {
        day1Views,
        day2CumulativeViews,
        day3CumulativeViews,
        day1WatchTime,
      });

      allFinalizedDay1Views.push(day1Views);
    }

    // Baseline Channel Launch Velocity Median
    const channelBaselineDay1ViewsMedian = calculateMedian(allFinalizedDay1Views);

    // 7. Aggregate Content Supply & Windows by (DayOfWeek, HourBucket)
    // 168 distinct 1-hour buckets in creator's configured timezone
    interface WindowBucketData {
      dayOfWeek: DayOfWeekName;
      hourBucket: number;
      uploadCount: number;
      finalizedDay1Views: number[];
      finalizedDay2CumulativeViews: number[];
      finalizedDay3CumulativeViews: number[];
      finalizedDay1WatchTime: number[];
    }

    const windowBuckets = new Map<string, WindowBucketData>();

    // Pre-populate all 168 buckets to preserve zero-volume representation
    for (const dayOfWeek of DAYS_OF_WEEK) {
      for (let h = 0; h < 24; h++) {
        const key = `${dayOfWeek}-${h}`;
        windowBuckets.set(key, {
          dayOfWeek,
          hourBucket: h,
          uploadCount: 0,
          finalizedDay1Views: [],
          finalizedDay2CumulativeViews: [],
          finalizedDay3CumulativeViews: [],
          finalizedDay1WatchTime: [],
        });
      }
    }

    // Accumulate published videos into local time buckets
    for (const v of eligibleVideos) {
      const key = `${v.localTime.dayOfWeek}-${v.localTime.hourBucket}`;
      const bucket = windowBuckets.get(key);
      if (bucket) {
        bucket.uploadCount += 1;
        if (!v.isMaturing) {
          const metrics = videoMetricsMap.get(v.externalContentId);
          if (metrics) {
            bucket.finalizedDay1Views.push(metrics.day1Views);
            bucket.finalizedDay2CumulativeViews.push(metrics.day2CumulativeViews);
            bucket.finalizedDay3CumulativeViews.push(metrics.day3CumulativeViews);
            bucket.finalizedDay1WatchTime.push(metrics.day1WatchTime);
          }
        }
      }
    }

    // Build Content Supply List
    const totalUploads = eligibleVideos.length;
    const contentSupplyBuckets: ContentSupplyBucket[] = [];
    const daySupplyCountMap: Record<string, number> = {};

    for (const dayOfWeek of DAYS_OF_WEEK) {
      daySupplyCountMap[dayOfWeek] = 0;
      for (let h = 0; h < 24; h++) {
        const bucket = windowBuckets.get(`${dayOfWeek}-${h}`)!;
        daySupplyCountMap[dayOfWeek] += bucket.uploadCount;
        contentSupplyBuckets.push({
          dayOfWeek,
          hourBucket: h,
          windowLabel: formatOneHourWindowLabel(h),
          uploadCount: bucket.uploadCount,
          percentageOfTotal:
            totalUploads > 0
              ? Number(((bucket.uploadCount / totalUploads) * 100).toFixed(1))
              : 0,
        });
      }
    }

    const mostActivePublishingDay =
      totalUploads > 0
        ? Object.entries(daySupplyCountMap).sort((a, b) => b[1] - a[1])[0]?.[0] || null
        : null;

    // 8. Build Observed Publishing Windows & Quadrant Classification
    const observedWindows: ObservedPublishingWindow[] = [];
    const consumptionDayMap = new Map(
      daysOfWeekConsumption.map((d) => [d.dayOfWeek, d.relativeLevel])
    );

    for (const [key, b] of windowBuckets.entries()) {
      // Only include windows with at least 1 upload in the primary observed windows table
      if (b.uploadCount === 0) continue;

      const sampleSize = b.finalizedDay1Views.length;
      const dayConsumptionLevel =
        consumptionDayMap.get(b.dayOfWeek) || "AVERAGE";

      const day1Median =
        sampleSize > 0 ? calculateMedian(b.finalizedDay1Views) : null;
      const day2CumulativeMedian =
        sampleSize > 0 ? calculateMedian(b.finalizedDay2CumulativeViews) : null;
      const day3CumulativeMedian =
        sampleSize > 0 ? calculateMedian(b.finalizedDay3CumulativeViews) : null;
      const day1WatchTimeMedian =
        sampleSize > 0 ? calculateMedian(b.finalizedDay1WatchTime) : null;

      let relativeDeltaPercent: number | null = null;
      if (day1Median !== null && channelBaselineDay1ViewsMedian > 0) {
        relativeDeltaPercent = Number(
          (
            ((day1Median - channelBaselineDay1ViewsMedian) /
              channelBaselineDay1ViewsMedian) *
            100
          ).toFixed(1)
        );
      }

      // Evidence strength
      const { strength: evidenceStrength, reason: evidenceReason } =
        evaluateEvidenceStrength(sampleSize, lookbackDays, b.finalizedDay1Views);

      // Quadrant classification
      const { quadrant, label: quadrantLabel, performanceLevel } =
        classifyQuadrant(dayConsumptionLevel, relativeDeltaPercent, sampleSize);

      const performance: WindowPerformance = {
        day1ViewsMedian: day1Median,
        day2CumulativeViewsMedian: day2CumulativeMedian,
        day3CumulativeViewsMedian: day3CumulativeMedian,
        day1WatchTimeMinutesMedian: day1WatchTimeMedian,
        channelBaselineDay1ViewsMedian,
        relativeDeltaPercent,
        sampleSize,
      };

      observedWindows.push({
        id: key,
        dayOfWeek: b.dayOfWeek,
        hourBucket: b.hourBucket,
        windowLabel: formatOneHourWindowLabel(b.hourBucket),
        uploadCount: b.uploadCount,
        performance,
        consumptionLevel: dayConsumptionLevel,
        performanceLevel,
        quadrant,
        quadrantLabel,
        evidenceStrength,
        evidenceReason,
      });
    }

    // Sort observed windows by upload count descending, then by Day 1 views median descending
    observedWindows.sort((a, b) => {
      if (b.uploadCount !== a.uploadCount) {
        return b.uploadCount - a.uploadCount;
      }
      return (
        (b.performance.day1ViewsMedian || 0) - (a.performance.day1ViewsMedian || 0)
      );
    });

    // 9. Categorize into Quadrants
    const quadrants = {
      q1: observedWindows.filter(
        (w) => w.quadrant === "Q1_HIGH_CONSUMPTION_HIGH_VELOCITY"
      ),
      q2: observedWindows.filter(
        (w) => w.quadrant === "Q2_HIGH_CONSUMPTION_LOW_VELOCITY"
      ),
      q3: observedWindows.filter(
        (w) => w.quadrant === "Q3_LOW_CONSUMPTION_HIGH_VELOCITY"
      ),
      q4: observedWindows.filter(
        (w) => w.quadrant === "Q4_LOW_CONSUMPTION_LOW_VELOCITY"
      ),
      unclassified: observedWindows.filter(
        (w) => w.quadrant === "UNCLASSIFIED"
      ),
    };

    // 10. Summary Evidence Counts
    const highEvidenceCount = observedWindows.filter(
      (w) => w.evidenceStrength === "HIGH"
    ).length;
    const moderateEvidenceCount = observedWindows.filter(
      (w) => w.evidenceStrength === "MODERATE"
    ).length;
    const lowEvidenceCount = observedWindows.filter(
      (w) => w.evidenceStrength === "LOW"
    ).length;
    const insufficientCount = observedWindows.filter(
      (w) => w.evidenceStrength === "INSUFFICIENT"
    ).length;

    const overallEvidenceStrength: EvidenceStrength =
      finalizedVideos.length < 5
        ? "INSUFFICIENT"
        : highEvidenceCount > 0
        ? "HIGH"
        : moderateEvidenceCount > 0
        ? "MODERATE"
        : lowEvidenceCount > 0
        ? "LOW"
        : "INSUFFICIENT";

    // 11. Formulate Descriptive Narrative Observations (Non-Causal)
    const narrativeObservations: NarrativeObservation[] = [];

    if (peakConsumptionDay) {
      const peakDayData = daysOfWeekConsumption.find(
        (d) => d.dayOfWeek === peakConsumptionDay
      );
      narrativeObservations.push({
        type: "OBSERVED",
        title: "Peak Channel Consumption Day",
        text: `Over the analyzed ${lookbackDays}-day period, ${peakConsumptionDay} recorded the highest daily viewing volume across your catalog (average ${peakDayData?.averageDailyViews.toLocaleString()} views/day, +${Math.round(((peakDayData?.consumptionIndex || 1) - 1) * 100)}% above your channel average).`,
      });
    }

    if (mostActivePublishingDay) {
      const pubCount = daySupplyCountMap[mostActivePublishingDay];
      const pct = totalUploads > 0 ? Math.round((pubCount / totalUploads) * 100) : 0;
      narrativeObservations.push({
        type: "OBSERVED",
        title: "Content Supply Habit",
        text: `Your publishing schedule is concentrated on ${mostActivePublishingDay} (${pubCount} uploads, ${pct}% of your total ${format.toLowerCase().replace("_", " ")} videos).`,
      });
    }

    if (quadrants.q1.length > 0) {
      const topQ1 = quadrants.q1[0];
      narrativeObservations.push({
        type: "DERIVED",
        title: "Observed High Consumption & High Velocity Intersection",
        text: `Videos published during ${topQ1.dayOfWeek} ${topQ1.windowLabel} coincided with both above-average channel consumption and higher early Day 1 viewing velocity (+${topQ1.performance.relativeDeltaPercent}% over channel baseline of ${channelBaselineDay1ViewsMedian.toLocaleString()} views; based on ${topQ1.performance.sampleSize} comparable uploads).`,
      });
    } else if (finalizedVideos.length < 5) {
      narrativeObservations.push({
        type: "CONTEXT",
        title: "Insufficient Historical Uploads",
        text: `Only ${finalizedVideos.length} comparable ${format.toLowerCase().replace("_", " ")} upload(s) were observed in the selected window. A minimum of 5 finalized uploads is required for meaningful baseline launch velocity analysis.`,
      });
    }

    narrativeObservations.push({
      type: "CONTEXT",
      title: "Observational Context & Causality Notice",
      text: "These windows describe historical patterns in your channel data. They do not guarantee future video performance. Video content, topic resonance, title, and thumbnail appeal remain primary drivers of viewership.",
    });

    const methodologyNotes = [
      `Format segmented strictly to ${format.replace("_", " ")} videos.`,
      `Timezone evaluated in ${timezone} (converted from official UTC publication timestamps).`,
      `Channel velocity baseline is derived from median Day 1 views (${channelBaselineDay1ViewsMedian.toLocaleString()} views) across ${finalizedVideos.length} finalized uploads.`,
      `Analytics data lag of ${analyticsLagDays} days is enforced; videos published after ${formatUtcDateString(dataCutoffDate)} are currently maturing.`,
      "No hourly audience heatmaps are generated because YouTube Analytics API does not expose intraday audience activity.",
    ];

    return {
      meta: {
        socialAccountId: account.id,
        workspaceId,
        channelTitle: account.displayName || account.username,
        format,
        lookbackDays,
        startDate: formatUtcDateString(startDate),
        endDate: formatUtcDateString(now),
        publishingTimezone: timezone,
        analyticsLagDays,
        dataCutoffDate: formatUtcDateString(dataCutoffDate),
        totalVideosInCatalog,
        totalEligibleVideos: eligibleVideos.length,
        channelBaselineDay1ViewsMedian,
        generatedAt: now.toISOString(),
      },
      freshness: {
        lastObservationDate:
          consumptionObservations.length > 0
            ? formatUtcDateString(
                new Date(
                  Math.max(
                    ...consumptionObservations
                      .filter((o) => o.observationDate)
                      .map((o) => new Date(o.observationDate!).getTime())
                  )
                )
              )
            : null,
        lagBoundaryDate: formatUtcDateString(dataCutoffDate),
        maturingVideosCount: eligibleVideos.length - finalizedVideos.length,
        isLagRespected: true,
        disclaimer:
          "YouTube Analytics reports data with a 48–72h delay. Recent uploads from the last 2 days are excluded from velocity baselines until their observation cycles complete.",
      },
      consumptionPattern: {
        daysOfWeek: daysOfWeekConsumption,
        channelDailyMeanViews,
        channelDailyMeanWatchTimeMinutes: channelDailyMeanWatchTime,
        peakConsumptionDay,
        lowestConsumptionDay,
      },
      contentSupply: {
        totalUploads,
        buckets: contentSupplyBuckets,
        mostActivePublishingDay,
      },
      observedWindows,
      quadrants,
      evidenceSummary: {
        overallEvidenceStrength,
        highEvidenceWindowsCount: highEvidenceCount,
        moderateEvidenceWindowsCount: moderateEvidenceCount,
        lowEvidenceWindowsCount: lowEvidenceCount,
        insufficientWindowsCount: insufficientCount,
        minimumObservationThreshold: 3,
      },
      narrativeObservations,
      methodologyNotes,
    };
  }
}

export const publishingIntelligenceService = new PublishingIntelligenceService();
