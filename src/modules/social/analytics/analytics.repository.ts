import { PrismaClient, AnalyticsObservation as PrismaAnalyticsObservation } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { AnalyticsObservation } from "../types";
import { SocialError } from "../errors";
import {
  AnalyticsQueryFilters,
  SerializedAnalyticsObservation,
} from "./analytics.types";
import { buildAnalyticsProjections } from "./analytics.projections";

export class AnalyticsRepository {
  private db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  /**
   * Verifies that the specified SocialAccount exists and belongs to the given workspace.
   * Throws SocialError if the account is not found or belongs to a different workspace.
   */
  async verifyWorkspaceOwnership(
    socialAccountId: string,
    workspaceId: string
  ): Promise<void> {
    const account = await this.db.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { id: true, workspaceId: true },
    });

    if (!account) {
      throw new SocialError(
        `Social account '${socialAccountId}' was not found.`,
        "SOCIAL_ACCOUNT_RESTRICTED",
        { statusCode: 404 }
      );
    }

    if (account.workspaceId !== workspaceId) {
      throw new SocialError(
        `Tenant isolation violation: Social account '${socialAccountId}' does not belong to workspace '${workspaceId}'.`,
        "SOCIAL_INVALID_REQUEST",
        { statusCode: 403 }
      );
    }
  }

  /**
   * Atomically upserts an AnalyticsObservation using its unique identityHash as the idempotency guard.
   * Enforces server-verified workspace ownership and preserves dual JSONB + relational projections.
   */
  async upsertObservation(
    observation: AnalyticsObservation,
    options: {
      workspaceId: string;
      socialAccountId: string;
      syncJobId?: string | null;
      dataLagDays?: number | null;
    }
  ): Promise<PrismaAnalyticsObservation> {
    await this.verifyWorkspaceOwnership(options.socialAccountId, options.workspaceId);

    const projection = buildAnalyticsProjections(observation, options);

    return this.db.analyticsObservation.upsert({
      where: { identityHash: projection.identityHash },
      create: {
        workspaceId: projection.workspaceId,
        socialAccountId: projection.socialAccountId,
        externalAccountId: projection.externalAccountId,
        externalContentId: projection.externalContentId,
        provider: projection.provider,
        source: projection.source,
        queryPattern: projection.queryPattern,
        granularity: projection.granularity,
        startDate: projection.startDate,
        endDate: projection.endDate,
        observationDate: projection.observationDate,
        identityKey: projection.identityKey,
        identityHash: projection.identityHash,
        dimensions: projection.dimensions as any,
        metrics: projection.metrics as any,
        views: projection.views,
        estimatedMinutesWatched: projection.estimatedMinutesWatched,
        averageViewDuration: projection.averageViewDuration,
        averageViewPercentage: projection.averageViewPercentage,
        likes: projection.likes,
        comments: projection.comments,
        shares: projection.shares,
        saves: projection.saves,
        subscribersGained: projection.subscribersGained,
        subscribersLost: projection.subscribersLost,
        engagementRate: projection.engagementRate,
        capturedAt: projection.capturedAt,
        syncJobId: projection.syncJobId,
        dataLagDays: projection.dataLagDays,
      },
      update: {
        metrics: projection.metrics as any,
        dimensions: projection.dimensions as any,
        views: projection.views,
        estimatedMinutesWatched: projection.estimatedMinutesWatched,
        averageViewDuration: projection.averageViewDuration,
        averageViewPercentage: projection.averageViewPercentage,
        likes: projection.likes,
        comments: projection.comments,
        shares: projection.shares,
        saves: projection.saves,
        subscribersGained: projection.subscribersGained,
        subscribersLost: projection.subscribersLost,
        engagementRate: projection.engagementRate,
        capturedAt: projection.capturedAt,
        syncJobId: projection.syncJobId,
        dataLagDays: projection.dataLagDays,
      },
    });
  }

  /**
   * Atomically upserts a batch of observations inside a single database transaction.
   */
  async upsertBatch(
    observations: AnalyticsObservation[],
    options: {
      workspaceId: string;
      socialAccountId: string;
      syncJobId?: string | null;
      dataLagDays?: number | null;
    }
  ): Promise<PrismaAnalyticsObservation[]> {
    if (observations.length === 0) {
      return [];
    }

    await this.verifyWorkspaceOwnership(options.socialAccountId, options.workspaceId);

    const projections = observations.map((obs) =>
      buildAnalyticsProjections(obs, options)
    );

    return this.db.$transaction(async (tx) => {
      const results: PrismaAnalyticsObservation[] = [];

      for (const projection of projections) {
        const record = await tx.analyticsObservation.upsert({
          where: { identityHash: projection.identityHash },
          create: {
            workspaceId: projection.workspaceId,
            socialAccountId: projection.socialAccountId,
            externalAccountId: projection.externalAccountId,
            externalContentId: projection.externalContentId,
            provider: projection.provider,
            source: projection.source,
            queryPattern: projection.queryPattern,
            granularity: projection.granularity,
            startDate: projection.startDate,
            endDate: projection.endDate,
            observationDate: projection.observationDate,
            identityKey: projection.identityKey,
            identityHash: projection.identityHash,
            dimensions: projection.dimensions as any,
            metrics: projection.metrics as any,
            views: projection.views,
            estimatedMinutesWatched: projection.estimatedMinutesWatched,
            averageViewDuration: projection.averageViewDuration,
            averageViewPercentage: projection.averageViewPercentage,
            likes: projection.likes,
            comments: projection.comments,
            shares: projection.shares,
            saves: projection.saves,
            subscribersGained: projection.subscribersGained,
            subscribersLost: projection.subscribersLost,
            engagementRate: projection.engagementRate,
            capturedAt: projection.capturedAt,
            syncJobId: projection.syncJobId,
            dataLagDays: projection.dataLagDays,
          },
          update: {
            metrics: projection.metrics as any,
            dimensions: projection.dimensions as any,
            views: projection.views,
            estimatedMinutesWatched: projection.estimatedMinutesWatched,
            averageViewDuration: projection.averageViewDuration,
            averageViewPercentage: projection.averageViewPercentage,
            likes: projection.likes,
            comments: projection.comments,
            shares: projection.shares,
            saves: projection.saves,
            subscribersGained: projection.subscribersGained,
            subscribersLost: projection.subscribersLost,
            engagementRate: projection.engagementRate,
            capturedAt: projection.capturedAt,
            syncJobId: projection.syncJobId,
            dataLagDays: projection.dataLagDays,
          },
        });
        results.push(record);
      }

      return results;
    });
  }

  /**
   * Queries observations strictly filtered by workspaceId.
   */
  async findObservations(
    filters: AnalyticsQueryFilters
  ): Promise<PrismaAnalyticsObservation[]> {
    const where: any = {
      workspaceId: filters.workspaceId,
    };

    if (filters.socialAccountId) {
      where.socialAccountId = filters.socialAccountId;
    }
    if (filters.externalContentId) {
      where.externalContentId = filters.externalContentId;
    }
    if (filters.provider) {
      where.provider = filters.provider;
    }
    if (filters.source) {
      where.source = filters.source;
    }
    if (filters.queryPattern) {
      where.queryPattern = filters.queryPattern;
    }
    if (filters.granularity) {
      where.granularity = filters.granularity;
    }
    if (filters.startDate) {
      where.startDate = {
        gte: typeof filters.startDate === "string" ? new Date(filters.startDate) : filters.startDate,
      };
    }
    if (filters.endDate) {
      where.endDate = {
        lte: typeof filters.endDate === "string" ? new Date(filters.endDate) : filters.endDate,
      };
    }
    if (filters.observationStartDate || filters.observationEndDate) {
      where.observationDate = {};
      if (filters.observationStartDate) {
        where.observationDate.gte =
          typeof filters.observationStartDate === "string"
            ? new Date(filters.observationStartDate)
            : filters.observationStartDate;
      }
      if (filters.observationEndDate) {
        where.observationDate.lte =
          typeof filters.observationEndDate === "string"
            ? new Date(filters.observationEndDate)
            : filters.observationEndDate;
      }
    }

    return this.db.analyticsObservation.findMany({
      where,
      orderBy: [
        { observationDate: "desc" },
        { capturedAt: "desc" },
      ],
      take: filters.limit,
      skip: filters.offset,
    });
  }

  /**
   * Safely formats a PrismaAnalyticsObservation record into a JSON-serializable structure,
   * converting BigInts to string and Decimals to string/number.
   */
  serializeObservation(
    record: PrismaAnalyticsObservation
  ): SerializedAnalyticsObservation {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      socialAccountId: record.socialAccountId,
      externalAccountId: record.externalAccountId,
      externalContentId: record.externalContentId,
      provider: record.provider,
      source: record.source,
      queryPattern: record.queryPattern,
      granularity: record.granularity,
      startDate: record.startDate.toISOString().substring(0, 10),
      endDate: record.endDate.toISOString().substring(0, 10),
      observationDate: record.observationDate
        ? record.observationDate.toISOString().substring(0, 10)
        : null,
      identityKey: record.identityKey,
      identityHash: record.identityHash,
      dimensions: record.dimensions as Record<string, string | null> | null,
      metrics: record.metrics as any,
      views: record.views !== null ? record.views.toString() : null,
      estimatedMinutesWatched:
        record.estimatedMinutesWatched !== null
          ? record.estimatedMinutesWatched.toString()
          : null,
      averageViewDuration: record.averageViewDuration,
      averageViewPercentage:
        record.averageViewPercentage !== null
          ? record.averageViewPercentage.toString()
          : null,
      likes: record.likes !== null ? record.likes.toString() : null,
      comments: record.comments !== null ? record.comments.toString() : null,
      shares: record.shares !== null ? record.shares.toString() : null,
      saves: record.saves !== null ? record.saves.toString() : null,
      subscribersGained:
        record.subscribersGained !== null
          ? record.subscribersGained.toString()
          : null,
      subscribersLost:
        record.subscribersLost !== null
          ? record.subscribersLost.toString()
          : null,
      engagementRate:
        record.engagementRate !== null ? record.engagementRate.toString() : null,
      capturedAt: record.capturedAt.toISOString(),
      syncJobId: record.syncJobId,
      dataLagDays: record.dataLagDays,
    };
  }
}

export const analyticsRepository = new AnalyticsRepository();
