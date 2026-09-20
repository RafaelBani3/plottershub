import { prisma } from "@/lib/db/prisma";
import { SocialError } from "../errors";
import { SocialProviderRegistry } from "../registry";
import { socialTokenManager } from "../token-manager";
import { defaultLock, DistributedLock } from "@/lib/lock/distributed-lock";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { hasPermission } from "@/lib/auth/rbac";
import { YouTubeSocialProvider } from "../providers/youtube/youtube.provider";
import { YouTubeMapper } from "../providers/youtube/youtube.mapper";
import { SyncOptions, SyncResult } from "./sync.types";

export class SocialSyncService {
  private lock: DistributedLock;

  constructor(lock: DistributedLock = defaultLock) {
    this.lock = lock;
  }

  /**
   * Performs end-to-end data synchronization for a connected YouTube account.
   * Concurrency-hardened: Acquires an exclusive distributed sync lock per account
   * ensuring exactly ONE active sync operation per SocialAccount at a time.
   */
  async syncYouTubeAccount(options: SyncOptions): Promise<SyncResult> {
    const startTimeMs = Date.now();
    const syncStartTime = new Date();

    // 1. Guardrail maxVideosLimit: default 500, clamped to max 1000
    const limit = options.maxVideosLimit ?? 500;
    if (limit < 1 || limit > 1000) {
      throw new SocialError(
        "Invalid maxVideosLimit. Must be between 1 and 1000.",
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE" }
      );
    }

    // 2. Load SocialAccount and verify existence and provider
    const account = await prisma.socialAccount.findUnique({
      where: { id: options.accountId },
      include: {
        platform: true,
        workspace: true,
        token: true,
      },
    });

    if (!account) {
      throw new SocialError("Social account not found.", "SOCIAL_INVALID_REQUEST");
    }

    if (account.platform.code !== "YOUTUBE") {
      throw new SocialError(
        `Unsupported platform for YouTube sync: ${account.platform.code}`,
        "SOCIAL_UNSUPPORTED_OPERATION",
        { provider: account.platform.code }
      );
    }

    // 3. Verify actor permissions within the account's workspace
    if (options.actorUserId) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: account.workspaceId,
            userId: options.actorUserId,
          },
        },
      });

      if (!membership || !hasPermission(membership.role, "social_accounts:manage")) {
        throw new SocialError(
          "Permission denied. User lacks permission to synchronize social accounts.",
          "SOCIAL_AUTH_REQUIRED",
          { provider: "YOUTUBE", statusCode: 403 }
        );
      }
    }

    // 4. Concurrency Guard: Acquire exclusive distributed lock for this social account
    const lockKey = `social-sync:${account.id}`;
    const lockToken = await this.lock.acquire(lockKey, {
      ttlMs: 60000, // 60s lease
      timeoutMs: 0, // Fail immediately with 409 Conflict if already in progress
    });

    if (!lockToken) {
      throw new SocialError(
        "A synchronization operation is already in progress for this account.",
        "SOCIAL_REFRESH_LOCKED",
        {
          provider: "YOUTUBE",
          statusCode: 409,
          retryable: true,
        }
      );
    }

    // Set up heartbeat timer to automatically extend lease during long syncs
    const heartbeatIntervalMs = 20000;
    const heartbeatTimer = setInterval(async () => {
      await this.lock.extend(lockKey, lockToken, 60000).catch(() => {});
    }, heartbeatIntervalMs);

    let syncJobId: string | null = null;

    try {
      // 5. Update status to SYNCING and register SyncJob
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: "SYNCING" },
      });

      const syncJob = await prisma.syncJob.create({
        data: {
          socialAccountId: account.id,
          jobType: "SYNC_ACCOUNT",
          status: "PROCESSING",
          attempts: 1,
          startedAt: syncStartTime,
        },
      });
      syncJobId = syncJob.id;

      // 6. Log SYNC_STARTED audit event
      await logAuditEvent({
        workspaceId: account.workspaceId,
        userId: options.actorUserId,
        action: "SYNC_STARTED",
        resource: "social_account",
        resourceId: account.id,
        details: {
          platform: "YOUTUBE",
          syncJobId: syncJob.id,
        },
      });

      // 7. Retrieve decrypted valid access token via SocialTokenManager
      const accessToken = await socialTokenManager.getValidAccessToken(account.id);

      // 8. Obtain YouTube provider and channel metadata
      const provider = SocialProviderRegistry.getProvider("YOUTUBE") as YouTubeSocialProvider;
      const channel = await provider.dataApiClient.getAuthenticatedChannel(accessToken);

      // 9. Update channel profile metadata & insert AccountMetricSnapshot (single deterministic timestamp)
      const normalizedProfile = YouTubeMapper.mapChannelToNormalizedAccount(channel);
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          username: normalizedProfile.username,
          displayName: normalizedProfile.displayName,
          avatarUrl: normalizedProfile.avatarUrl,
        },
      });

      const accountMetrics = YouTubeMapper.mapChannelToAccountMetrics(channel, syncStartTime);
      await prisma.accountMetricSnapshot.create({
        data: {
          socialAccountId: account.id,
          capturedAt: syncStartTime,
          followersCount: accountMetrics.followersCount,
          totalVideos: accountMetrics.totalVideos,
          totalViews: accountMetrics.totalViews,
          followingCount: accountMetrics.followingCount,
          totalLikes: accountMetrics.totalLikes,
          subscribersGained: accountMetrics.subscribersGained,
          subscribersLost: accountMetrics.subscribersLost,
        },
      });

      const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;

      let videosDiscovered = 0;
      let videosProcessed = 0;
      let videosCreated = 0;
      let videosUpdated = 0;
      let snapshotsCreated = 0;
      let pageToken: string | undefined = undefined;
      const errors: Array<{ batchIndex?: number; message: string }> = [];

      // 10. Video Discovery & Bounded Batch Synchronization
      let boundaryReached = false;

      if (uploadsPlaylistId) {
        while (videosProcessed < limit && !boundaryReached) {
          const pageSize = Math.min(50, limit - videosProcessed);
          const playlistPage = await provider.dataApiClient.getUploadsPlaylistItems(
            accessToken,
            uploadsPlaylistId,
            pageToken,
            pageSize
          );

          const rawItems = playlistPage.items || [];
          const videoIds = Array.from(
            new Set(
              rawItems
                .map((item) => item.contentDetails?.videoId || item.snippet.resourceId?.videoId)
                .filter((id): id is string => Boolean(id))
            )
          );

          videosDiscovered += videoIds.length;

          if (videoIds.length === 0) {
            if (playlistPage.nextPageToken) {
              pageToken = playlistPage.nextPageToken;
              continue;
            }
            break;
          }

          // Fetch full metadata & public statistics for this batch (max 50)
          const videos = await provider.dataApiClient.getVideosBatch(accessToken, videoIds);

          // Execute bounded transaction for this batch
          await prisma.$transaction(async (tx) => {
            for (const video of videos) {
              const normalized = YouTubeMapper.mapVideoToNormalizedContent(video);
              const metrics = YouTubeMapper.mapVideoToNormalizedMetrics(video, syncStartTime);
              const platformMetadata = YouTubeMapper.mapVideoToPlatformMetadata(video);

              const isDeletedOrRejected =
                video.status?.uploadStatus === "deleted" ||
                video.status?.uploadStatus === "rejected" ||
                video.status?.uploadStatus === "failed";

              const contentStatus = isDeletedOrRejected ? "ARCHIVED" : "PUBLISHED";
              const platformStatus = isDeletedOrRejected ? "CANCELLED" : "PUBLISHED";

              let contentPlatform = await tx.contentPlatform.findFirst({
                where: {
                  socialAccountId: account.id,
                  externalContentId: video.id,
                },
                include: { content: true },
              });

              if (contentPlatform) {
                // Update existing Content record
                await tx.content.update({
                  where: { id: contentPlatform.contentId },
                  data: {
                    title: normalized.title,
                    description: normalized.description,
                    publishedAt: normalized.publishedAt,
                    status: contentStatus,
                  },
                });

                // Update existing ContentPlatform record
                await tx.contentPlatform.update({
                  where: { id: contentPlatform.id },
                  data: {
                    externalUrl: normalized.externalUrl,
                    status: platformStatus,
                    publishedAt: normalized.publishedAt,
                    metadata: platformMetadata as any,
                  },
                });

                videosUpdated++;

                // Stop on known content boundary if requested
                if (options.stopOnKnownContent) {
                  boundaryReached = true;
                }
              } else {
                // Create new Content record
                const newContent = await tx.content.create({
                  data: {
                    workspaceId: account.workspaceId,
                    title: normalized.title,
                    description: normalized.description,
                    status: contentStatus,
                    publishedAt: normalized.publishedAt,
                  },
                });

                // Create new ContentPlatform record
                contentPlatform = await tx.contentPlatform.create({
                  data: {
                    contentId: newContent.id,
                    socialAccountId: account.id,
                    externalContentId: video.id,
                    externalUrl: normalized.externalUrl,
                    status: platformStatus,
                    publishedAt: normalized.publishedAt,
                    metadata: platformMetadata as any,
                  },
                  include: { content: true },
                });

                videosCreated++;
              }

              // Check historical date boundary
              if (
                options.historicalCutoffDate &&
                normalized.publishedAt &&
                normalized.publishedAt < options.historicalCutoffDate
              ) {
                boundaryReached = true;
              }

              // Insert ContentMetricSnapshot (preserves strict NULL vs 0)
              await tx.contentMetricSnapshot.create({
                data: {
                  contentPlatformId: contentPlatform.id,
                  socialAccountId: account.id,
                  capturedAt: syncStartTime,
                  views: metrics.views,
                  likes: metrics.likes,
                  comments: metrics.comments,
                  shares: metrics.shares,
                  saves: metrics.saves,
                  followersGained: metrics.followersGained,
                  engagementRate: metrics.engagementRate,
                },
              });

              snapshotsCreated++;
              videosProcessed++;
            }
          }, {
            maxWait: 15000,
            timeout: 60000,
          });

          if (boundaryReached) {
            break;
          }

          pageToken = playlistPage.nextPageToken;

          if (!pageToken) {
            break;
          }
        }
      }

      const durationMs = Date.now() - startTimeMs;

      // 11. Update SocialAccount & SyncJob on successful completion
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          status: "HEALTHY",
          lastSyncedAt: new Date(),
        },
      });

      await prisma.syncJob.update({
        where: { id: syncJobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      // 12. Log SYNC_COMPLETED audit event
      await logAuditEvent({
        workspaceId: account.workspaceId,
        userId: options.actorUserId,
        action: "SYNC_COMPLETED",
        resource: "social_account",
        resourceId: account.id,
        details: {
          platform: "YOUTUBE",
          syncJobId,
          videosDiscovered,
          videosProcessed,
          videosCreated,
          videosUpdated,
          snapshotsCreated,
          durationMs,
        },
      });

      return {
        success: true,
        accountId: account.id,
        platform: "YOUTUBE",
        channelId: channel.id,
        channelTitle: channel.snippet.title,
        videosDiscovered,
        videosProcessed,
        videosCreated,
        videosUpdated,
        snapshotsCreated,
        durationMs,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      const isAuthError =
        error instanceof SocialError &&
        (error.code === "SOCIAL_TOKEN_REVOKED" || error.code === "SOCIAL_AUTH_REQUIRED");

      const accountStatus = isAuthError ? "REAUTH_REQUIRED" : "API_ERROR";

      await prisma.socialAccount
        .update({
          where: { id: options.accountId },
          data: { status: accountStatus },
        })
        .catch(() => {});

      if (syncJobId) {
        await prisma.syncJob
          .update({
            where: { id: syncJobId },
            data: {
              status: "FAILED",
              errorMessage: error instanceof Error ? error.message : "Sync failed",
              completedAt: new Date(),
            },
          })
          .catch(() => {});
      }

      if (account?.workspaceId) {
        await logAuditEvent({
          workspaceId: account.workspaceId,
          userId: options.actorUserId,
          action: "SYNC_FAILED",
          resource: "social_account",
          resourceId: account.id,
          details: {
            platform: "YOUTUBE",
            error: error instanceof Error ? error.message : "Sync failed",
          },
        }).catch(() => {});
      }

      if (error instanceof SocialError) {
        throw error;
      }

      throw new SocialError(
        error?.message || "YouTube synchronization failed.",
        "SOCIAL_API_ERROR",
        { provider: "YOUTUBE", cause: error }
      );
    } finally {
      // 13. Guaranteed Lock Release by Owner
      clearInterval(heartbeatTimer);
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }
}

export const socialSyncService = new SocialSyncService();
