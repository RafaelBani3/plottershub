import { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import {
  ListContentQuery,
  ContentListItemDTO,
  ContentListResult,
  ContentSummaryDTO,
} from "./content.types";
import {
  YouTubeContentType,
  ClassificationConfidence,
  ClassificationSource,
} from "../social/providers/youtube/youtube.types";

/**
 * Formats a duration in seconds into standard time representation (mm:ss or hh:mm:ss).
 * Returns "—" if duration is null, undefined, or unavailable.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export class ContentRepository {
  constructor(private readonly db = defaultPrisma) {}

  /**
   * Retrieves paginated, filtered, and sorted content records for a workspace.
   * Guarantees single-trip execution with zero N+1 database queries.
   */
  async listContent(query: ListContentQuery): Promise<ContentListResult> {
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = Math.max(0, query.offset ?? 0);
    const sortBy = query.sortBy || "publishedAt";
    const sortOrder: Prisma.SortOrder = query.sortOrder === "asc" ? "asc" : "desc";

    // 1. Build strict workspace-isolated WHERE clause
    const where: Prisma.ContentPlatformWhereInput = {
      content: {
        workspaceId: query.workspaceId,
      },
      socialAccount: {
        workspaceId: query.workspaceId,
      },
    };

    // 2. Account filter
    if (query.socialAccountId) {
      where.socialAccountId = query.socialAccountId;
    }

    // 3. Status filter
    if (query.status && query.status !== "ALL") {
      where.status = query.status as any;
    }

    // 4. Date range filter
    if (query.startDate || query.endDate) {
      where.publishedAt = {};
      if (query.startDate) {
        (where.publishedAt as Prisma.DateTimeNullableFilter).gte = query.startDate;
      }
      if (query.endDate) {
        (where.publishedAt as Prisma.DateTimeNullableFilter).lte = query.endDate;
      }
    }

    // 5. Search substring filter
    if (query.search && query.search.trim() !== "") {
      const searchTrimmed = query.search.trim();
      where.content = {
        workspaceId: query.workspaceId,
        OR: [
          { title: { contains: searchTrimmed, mode: "insensitive" } },
          { description: { contains: searchTrimmed, mode: "insensitive" } },
        ],
      } as Prisma.ContentWhereInput;
    }

    // 6. Content Type JSON filter (SHORTS, LONG_FORM, LIVE_STREAM, UNKNOWN)
    if (query.contentType && query.contentType !== "ALL") {
      where.metadata = {
        path: ["contentType"],
        equals: query.contentType,
      };
    }

    // 7. Privacy Status JSON filter (PUBLIC, UNLISTED, PRIVATE)
    if (query.privacy && query.privacy !== "ALL") {
      where.metadata = {
        ...(where.metadata as any),
        path: ["privacyStatus"],
        equals: query.privacy.toLowerCase(),
      };
    }

    // 8. Order By Configuration
    let orderBy: Prisma.ContentPlatformOrderByWithRelationInput = {
      publishedAt: sortOrder,
    };

    if (sortBy === "title") {
      orderBy = {
        content: {
          title: sortOrder,
        },
      };
    } else if (sortBy === "publishedAt") {
      orderBy = {
        publishedAt: sortOrder,
      };
    }

    // 9. Execute count and findMany queries concurrently
    const [total, rows, summary] = await Promise.all([
      this.db.contentPlatform.count({ where }),
      this.db.contentPlatform.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy,
        include: {
          content: true,
          socialAccount: {
            include: {
              platform: true,
            },
          },
          snapshots: {
            take: 1,
            orderBy: {
              capturedAt: "desc",
            },
          },
        },
      }),
      this.getSummaryMetrics(query.workspaceId, query.socialAccountId),
    ]);

    // 10. Map database rows to sanitized DTOs
    const items: ContentListItemDTO[] = rows.map((row) => {
      const meta = row.metadata as Record<string, any> | null;
      const latestSnapshot = row.snapshots[0];
      const durationSeconds = meta?.durationSeconds ?? null;

      const privacyRaw = meta?.privacyStatus ? String(meta.privacyStatus).toUpperCase() : "PUBLIC";
      const contentType = ((meta?.contentType as YouTubeContentType) || "UNKNOWN");
      const classificationConfidence = ((meta?.classificationConfidence as ClassificationConfidence) || "LOW");
      const classificationSource = ((meta?.classificationSource as ClassificationSource) || "UNRESOLVED");

      return {
        id: row.id,
        contentId: row.contentId,
        title: row.content.title,
        description: row.content.description,
        status: row.status,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        externalContentId: row.externalContentId,
        externalUrl: row.externalUrl,
        socialAccountId: row.socialAccountId,
        socialAccountName: row.socialAccount.displayName || row.socialAccount.username,
        contentType,
        classificationConfidence,
        classificationSource,
        classificationRationale: meta?.classificationRationale || "",
        privacyStatus: privacyRaw,
        formattedDuration: formatDuration(durationSeconds),
        durationSeconds,
        thumbnails: meta?.thumbnails || {},
        socialAccount: {
          id: row.socialAccount.id,
          username: row.socialAccount.username,
          displayName: row.socialAccount.displayName,
          avatarUrl: row.socialAccount.avatarUrl,
          platformCode: row.socialAccount.platform.code,
        },
        metadata: meta
          ? {
              durationSeconds,
              durationFormatted: formatDuration(durationSeconds),
              contentType,
              classificationConfidence,
              classificationSource,
              classificationRationale: meta.classificationRationale || "",
              privacyStatus: meta.privacyStatus || "public",
              uploadStatus: meta.uploadStatus || "uploaded",
              license: meta.license || "youtube",
              embeddable: meta.embeddable ?? true,
              madeForKids: Boolean(meta.madeForKids),
              publishAt: meta.publishAt,
              thumbnails: meta.thumbnails || {},
              tags: meta.tags || [],
              categoryId: meta.categoryId || "",
              liveBroadcastContent: meta.liveBroadcastContent,
            }
          : null,
        metrics: latestSnapshot
          ? {
              views: latestSnapshot.views !== null ? latestSnapshot.views.toString() : null,
              likes: latestSnapshot.likes !== null ? latestSnapshot.likes.toString() : null,
              comments: latestSnapshot.comments !== null ? latestSnapshot.comments.toString() : null,
              engagementRate: latestSnapshot.engagementRate ? Number(latestSnapshot.engagementRate) : null,
              capturedAt: latestSnapshot.capturedAt.toISOString(),
            }
          : null,
      };
    });

    const hasMore = offset + items.length < total;

    return {
      items,
      total,
      limit,
      offset,
      hasMore,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
      },
      summary,
    };
  }

  /**
   * Retrieves a single content item by ID with strict workspace isolation.
   */
  async getContentById(workspaceId: string, id: string): Promise<ContentListItemDTO | null> {
    const row = await this.db.contentPlatform.findFirst({
      where: {
        OR: [{ id }, { contentId: id }],
        content: {
          workspaceId,
        },
        socialAccount: {
          workspaceId,
        },
      },
      include: {
        content: true,
        socialAccount: {
          include: {
            platform: true,
          },
        },
        snapshots: {
          take: 1,
          orderBy: {
            capturedAt: "desc",
          },
        },
      },
    });

    if (!row) {
      return null;
    }

    const meta = row.metadata as Record<string, any> | null;
    const latestSnapshot = row.snapshots[0];
    const durationSeconds = meta?.durationSeconds ?? null;

    const privacyRaw = meta?.privacyStatus ? String(meta.privacyStatus).toUpperCase() : "PUBLIC";
    const contentType = ((meta?.contentType as YouTubeContentType) || "UNKNOWN");
    const classificationConfidence = ((meta?.classificationConfidence as ClassificationConfidence) || "LOW");
    const classificationSource = ((meta?.classificationSource as ClassificationSource) || "UNRESOLVED");

    return {
      id: row.id,
      contentId: row.contentId,
      title: row.content.title,
      description: row.content.description,
      status: row.status,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      externalContentId: row.externalContentId,
      externalUrl: row.externalUrl,
      socialAccountId: row.socialAccountId,
      socialAccountName: row.socialAccount.displayName || row.socialAccount.username,
      contentType,
      classificationConfidence,
      classificationSource,
      classificationRationale: meta?.classificationRationale || "",
      privacyStatus: privacyRaw,
      formattedDuration: formatDuration(durationSeconds),
      durationSeconds,
      thumbnails: meta?.thumbnails || {},
      socialAccount: {
        id: row.socialAccount.id,
        username: row.socialAccount.username,
        displayName: row.socialAccount.displayName,
        avatarUrl: row.socialAccount.avatarUrl,
        platformCode: row.socialAccount.platform.code,
      },
      metadata: meta
        ? {
            durationSeconds,
            durationFormatted: formatDuration(durationSeconds),
            contentType,
            classificationConfidence,
            classificationSource,
            classificationRationale: meta.classificationRationale || "",
            privacyStatus: meta.privacyStatus || "public",
            uploadStatus: meta.uploadStatus || "uploaded",
            license: meta.license || "youtube",
            embeddable: meta.embeddable ?? true,
            madeForKids: Boolean(meta.madeForKids),
            publishAt: meta.publishAt,
            thumbnails: meta.thumbnails || {},
            tags: meta.tags || [],
            categoryId: meta.categoryId || "",
            liveBroadcastContent: meta.liveBroadcastContent,
          }
        : null,
      metrics: latestSnapshot
        ? {
            views: latestSnapshot.views !== null ? latestSnapshot.views.toString() : null,
            likes: latestSnapshot.likes !== null ? latestSnapshot.likes.toString() : null,
            comments: latestSnapshot.comments !== null ? latestSnapshot.comments.toString() : null,
            engagementRate: latestSnapshot.engagementRate ? Number(latestSnapshot.engagementRate) : null,
            capturedAt: latestSnapshot.capturedAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Computes aggregate content summary statistics for the workspace/account.
   */
  async getSummaryMetrics(workspaceId: string, socialAccountId?: string): Promise<ContentSummaryDTO> {
    const where: Prisma.ContentPlatformWhereInput = {
      content: { workspaceId },
      socialAccount: { workspaceId },
    };

    if (socialAccountId) {
      where.socialAccountId = socialAccountId;
    }

    const [totalVideos, rows, account] = await Promise.all([
      this.db.contentPlatform.count({ where }),
      this.db.contentPlatform.findMany({
        where,
        select: {
          metadata: true,
          snapshots: {
            take: 1,
            orderBy: { capturedAt: "desc" },
            select: { views: true },
          },
        },
      }),
      socialAccountId
        ? this.db.socialAccount.findUnique({
            where: { id: socialAccountId },
            select: { lastSyncedAt: true },
          })
        : this.db.socialAccount.findFirst({
            where: { workspaceId, platform: { code: "YOUTUBE" } },
            orderBy: { lastSyncedAt: "desc" },
            select: { lastSyncedAt: true },
          }),
    ]);

    let totalViewsBigInt = 0n;
    let shortsCount = 0;
    let longFormCount = 0;
    let unknownCount = 0;
    let liveCount = 0;

    for (const row of rows) {
      const meta = row.metadata as Record<string, any> | null;
      const contentType = meta?.contentType;

      if (contentType === "SHORTS") {
        shortsCount++;
      } else if (contentType === "LONG_FORM") {
        longFormCount++;
      } else if (contentType === "LIVE_STREAM") {
        liveCount++;
      } else {
        unknownCount++;
      }

      const views = row.snapshots[0]?.views;
      if (views) {
        totalViewsBigInt += views;
      }
    }

    return {
      total: totalVideos,
      totalVideos,
      totalViews: totalViewsBigInt.toString(),
      shorts: shortsCount,
      shortsCount,
      longForm: longFormCount,
      longFormCount,
      unknown: unknownCount,
      unknownCount,
      liveStream: liveCount,
      liveCount,
      lastSyncedAt: account?.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
    };
  }
}
