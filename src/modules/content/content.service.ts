import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { PrismaClient, type Prisma } from "@prisma/client";
import { hasPermission, Permission } from "@/lib/auth/rbac";
import { SocialError } from "@/modules/social/errors";
import { ContentRepository } from "./content.repository";
import {
  ListContentQuery,
  ContentListItemDTO,
  ContentListResult,
  UpdateContentInput,
  validateUpdateContentInput,
} from "./content.types";
import { defaultLock, DistributedLock } from "@/lib/lock/distributed-lock";
import { socialTokenManager, SocialTokenManager } from "@/modules/social/token-manager";
import { YouTubeDataApiClient } from "@/modules/social/providers/youtube/youtube.data-api";
import { SocialProviderRegistry } from "@/modules/social/registry";
import { hasYouTubeWriteScope } from "@/modules/social/providers/youtube/youtube.oauth";
import { prepareYouTubeUpdatePayload } from "./content.merge";
import { classifyYouTubeVideo } from "@/modules/social/providers/youtube/youtube.mapper";
import { logAuditEvent } from "@/modules/audit/audit-service";

export interface ContentServiceOptions {
  actorUserId: string;
  workspaceId: string;
}

export class ContentService {
  constructor(
    private readonly repository: ContentRepository = new ContentRepository(),
    private readonly db: PrismaClient = defaultPrisma,
    private readonly lock: DistributedLock = defaultLock,
    private readonly tokenManager: SocialTokenManager = socialTokenManager,
    private readonly dataApiClient: YouTubeDataApiClient = new YouTubeDataApiClient()
  ) {}

  /**
   * Validates actor membership and RBAC permissions within the target workspace.
   */
  private async validateAccess(actorUserId: string, workspaceId: string, requiredPermission: Permission) {
    if (!actorUserId) {
      throw new SocialError("Authentication required.", "SOCIAL_AUTH_REQUIRED", {
        statusCode: 401,
      });
    }

    if (!workspaceId) {
      throw new SocialError("Workspace ID is required.", "SOCIAL_INVALID_REQUEST", {
        statusCode: 400,
      });
    }

    const membership = await this.db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: actorUserId,
        },
      },
    });

    if (!membership) {
      throw new SocialError("Access denied. User is not a member of this workspace.", "SOCIAL_AUTH_REQUIRED", {
        statusCode: 403,
      });
    }

    if (!hasPermission(membership.role, requiredPermission)) {
      throw new SocialError(
        `Permission denied. User role [${membership.role}] lacks [${requiredPermission}].`,
        "SOCIAL_AUTH_REQUIRED",
        { statusCode: 403 }
      );
    }

    return membership;
  }

  /**
   * Lists content items with strict server-side workspace isolation and RBAC checks.
   */
  async listContent(options: ContentServiceOptions, query: Omit<ListContentQuery, "workspaceId">): Promise<ContentListResult> {
    // 1. Authorize actor
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:view");

    // 2. Validate socialAccountId if provided
    if (query.socialAccountId) {
      const account = await this.db.socialAccount.findFirst({
        where: {
          id: query.socialAccountId,
          workspaceId: options.workspaceId,
        },
      });

      if (!account) {
        throw new SocialError("Social account not found in this workspace.", "SOCIAL_INVALID_REQUEST", {
          statusCode: 404,
        });
      }
    }

    // 3. Delegate to repository with guaranteed server-enforced workspaceId
    return this.repository.listContent({
      ...query,
      workspaceId: options.workspaceId,
    });
  }

  /**
   * Retrieves a single content item by ID with server-side authorization.
   */
  async getContentById(options: ContentServiceOptions, contentId: string): Promise<ContentListItemDTO> {
    // 1. Authorize actor
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:view");

    if (!contentId || contentId.trim() === "") {
      throw new SocialError("Content ID is required.", "SOCIAL_INVALID_REQUEST", {
        statusCode: 400,
      });
    }

    // 2. Retrieve content
    const item = await this.repository.getContentById(options.workspaceId, contentId);

    if (!item) {
      throw new SocialError("Content item not found in this workspace.", "SOCIAL_INVALID_REQUEST", {
        statusCode: 404,
      });
    }

    return item;
  }

  /**
   * Retrieves summary count metrics for content items in a workspace.
   */
  async getSummaryMetrics(options: ContentServiceOptions, socialAccountId?: string) {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:view");
    return this.repository.getSummaryMetrics(options.workspaceId, socialAccountId);
  }

  /**
   * Executes a safe Read-Modify-Write update for a YouTube video item.
   *
   * Enforces:
   * 1. RBAC content:edit
   * 2. Strict input validation
   * 3. Tenant and social account isolation
   * 4. Provider capability checks
   * 5. OAuth write scope verification
   * 6. Per-video distributed locking (content-update:{acc}:{vid})
   * 7. Live YouTube fetch before merge (zero stale UI overwrite)
   * 8. Strictly-typed update payload (zero `any`)
   * 9. Shorts re-classification preservation
   * 10. Explicit handling of provider success vs DB failure
   * 11. Immutable audit logging
   */
  async updateContent(
    options: ContentServiceOptions,
    contentId: string,
    input: UpdateContentInput
  ): Promise<ContentListItemDTO> {
    // 1. RBAC & Workspace Authorization
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    // 2. Input Validation
    const validation = validateUpdateContentInput(input);
    if (!validation.valid) {
      throw new SocialError(validation.error || "Invalid content update input.", "CONTENT_VALIDATION_ERROR", {
        statusCode: 400,
      });
    }

    if (!contentId || contentId.trim() === "") {
      throw new SocialError("Content ID is required.", "SOCIAL_INVALID_REQUEST", {
        statusCode: 400,
      });
    }

    // 3. Resolve ContentPlatform, Content, and SocialAccount server-side
    const row = await this.db.contentPlatform.findFirst({
      where: {
        OR: [{ id: contentId }, { contentId }],
        content: {
          workspaceId: options.workspaceId,
        },
        socialAccount: {
          workspaceId: options.workspaceId,
        },
      },
      include: {
        content: true,
        socialAccount: {
          include: {
            platform: true,
            token: true,
          },
        },
      },
    });

    if (!row) {
      throw new SocialError("Content item not found in this workspace.", "CONTENT_NOT_FOUND", {
        statusCode: 404,
      });
    }

    const { socialAccount, externalContentId } = row;

    if (!externalContentId) {
      throw new SocialError("Content item is not linked to an external YouTube video.", "CONTENT_NOT_FOUND", {
        statusCode: 400,
      });
    }

    if (socialAccount.platform.code !== "YOUTUBE") {
      throw new SocialError(
        `Unsupported platform for YouTube content update: ${socialAccount.platform.code}`,
        "SOCIAL_UNSUPPORTED_OPERATION",
        { provider: socialAccount.platform.code, statusCode: 400 }
      );
    }

    // 4. Verify SocialAccount status
    if (socialAccount.status === "REAUTH_REQUIRED" || socialAccount.status === "DISCONNECTED") {
      throw new SocialError(
        `Social account requires re-authorization: status is ${socialAccount.status}`,
        "SOCIAL_TOKEN_REVOKED",
        { provider: "YOUTUBE", statusCode: 401, userActionRequired: true }
      );
    }

    // 5. Capability Check
    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();

    if (input.title !== undefined || input.description !== undefined || input.tags !== undefined || input.categoryId !== undefined) {
      if (!capabilities.canUpdateContentMetadata) {
        throw new SocialError("Provider does not support metadata updates.", "SOCIAL_UNSUPPORTED_OPERATION", {
          provider: "YOUTUBE",
          statusCode: 400,
        });
      }
    }

    if (input.privacyStatus !== undefined && !capabilities.canUpdateContentPrivacy) {
      throw new SocialError("Provider does not support privacy updates.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (input.publishAt !== undefined && !capabilities.canScheduleContentPublish) {
      throw new SocialError("Provider does not support publish scheduling.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (input.selfDeclaredMadeForKids !== undefined && !capabilities.canUpdateKidsSettings) {
      throw new SocialError("Provider does not support kids settings updates.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (input.containsSyntheticMedia !== undefined && !capabilities.canUpdateSyntheticMedia) {
      throw new SocialError("Provider does not support synthetic media disclosure updates.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    // 6. OAuth Scope Verification
    const scopes = socialAccount.token?.scopes;
    if (!hasYouTubeWriteScope(scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize Plottershub with editing permissions to update video metadata.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        {
          provider: "YOUTUBE",
          statusCode: 403,
          userActionRequired: true,
        }
      );
    }

    // 7. Acquire Per-Video Distributed Lock
    const lockKey = `content-update:${socialAccount.id}:${externalContentId}`;
    const lockToken = await this.lock.acquire(lockKey, {
      ttlMs: 15000,
      timeoutMs: 0, // Fail-fast
    });

    if (!lockToken) {
      throw new SocialError(
        "An update operation is currently in progress for this video. Please wait.",
        "SOCIAL_REFRESH_LOCKED",
        {
          provider: "YOUTUBE",
          statusCode: 409,
          retryable: true,
        }
      );
    }

    try {
      // 8. Resolve valid access token
      const accessToken = await this.tokenManager.getValidAccessToken(socialAccount.id);

      // 9. Fetch Authoritative LATEST YouTube state (Quota: 1 unit)
      const liveVideo = await this.dataApiClient.getVideoById(accessToken, externalContentId, "snippet,status");
      if (!liveVideo) {
        throw new SocialError("Video not found on YouTube. It may have been removed or deleted.", "CONTENT_NOT_FOUND", {
          provider: "YOUTUBE",
          statusCode: 404,
        });
      }

      // Verify channel ownership against the authenticated live resource
      if (liveVideo.snippet.channelId !== socialAccount.externalAccountId) {
        throw new SocialError("Video does not belong to the connected YouTube channel.", "CONTENT_NOT_OWNED", {
          provider: "YOUTUBE",
          statusCode: 403,
        });
      }

      // 10. Merge ONLY requested changes into strictly typed payload
      const { parts, body, changedFields } = prepareYouTubeUpdatePayload(liveVideo, input);

      // If no effective fields changed, return current item
      if (parts.length === 0) {
        return (await this.repository.getContentById(options.workspaceId, row.id))!;
      }

      // Log requested audit event
      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "CONTENT_UPDATE_REQUESTED",
        resource: "content",
        resourceId: row.contentId,
        details: {
          socialAccountId: socialAccount.id,
          externalContentId,
          changedFields,
        },
      }).catch(() => {});

      // 11. Send videos.update via official PUT (Quota: 50 units)
      const updatedVideo = await this.dataApiClient.updateVideo(accessToken, parts, body);

      // 12. Shorts Re-classification check (Guardrail 4)
      const existingMeta = (row.metadata as Record<string, unknown>) || {};
      let contentType = existingMeta.contentType;
      let classificationConfidence = existingMeta.classificationConfidence;
      let classificationSource = existingMeta.classificationSource;
      let classificationRationale = existingMeta.classificationRationale;

      const titleOrTagsChanged =
        changedFields.includes("title") ||
        changedFields.includes("tags") ||
        changedFields.includes("description");

      if (titleOrTagsChanged) {
        const classification = classifyYouTubeVideo(updatedVideo);
        contentType = classification.contentType;
        classificationConfidence = classification.confidence;
        classificationSource = classification.classificationSource;
        classificationRationale = classification.rationale;
      }

      // 13. Update Local PostgreSQL Database (Guardrail 6: Explicit DB failure handling)
      try {
        const updatedMetadata = {
          ...existingMeta,
          title: updatedVideo.snippet.title,
          description: updatedVideo.snippet.description,
          tags: updatedVideo.snippet.tags || [],
          categoryId: updatedVideo.snippet.categoryId,
          privacyStatus: updatedVideo.status?.privacyStatus ? String(updatedVideo.status.privacyStatus).toUpperCase() : existingMeta.privacyStatus,
          selfDeclaredMadeForKids: updatedVideo.status?.selfDeclaredMadeForKids ?? existingMeta.selfDeclaredMadeForKids,
          containsSyntheticMedia: updatedVideo.status?.containsSyntheticMedia ?? existingMeta.containsSyntheticMedia,
          publishAt: updatedVideo.status?.publishAt,
          contentType,
          classificationConfidence,
          classificationSource,
          classificationRationale,
          updatedAt: new Date().toISOString(),
        };

        const newContentStatus =
          updatedVideo.status?.privacyStatus === "private" && updatedVideo.status?.publishAt
            ? "SCHEDULED"
            : row.content.status;

        await this.db.$transaction([
          this.db.content.update({
            where: { id: row.contentId },
            data: {
              title: updatedVideo.snippet.title,
              description: updatedVideo.snippet.description,
              status: newContentStatus,
            },
          }),
          this.db.contentPlatform.update({
            where: { id: row.id },
            data: {
              metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
              status: newContentStatus === "SCHEDULED" ? "SCHEDULED" : row.status,
              scheduledAt: updatedVideo.status?.publishAt ? new Date(updatedVideo.status.publishAt) : null,
            },
          }),
        ]);
      } catch (dbError) {
        // YouTube update succeeded on Google, but local database persistence failed!
        // Record reconciliation problem in audit log (Guardrail 6)
        await logAuditEvent({
          workspaceId: options.workspaceId,
          userId: options.actorUserId,
          action: "CONTENT_UPDATE_RECONCILIATION_REQUIRED",
          resource: "content",
          resourceId: row.contentId,
          details: {
            error: dbError instanceof Error ? dbError.message : String(dbError),
            externalContentId,
            socialAccountId: socialAccount.id,
            note: "YouTube update succeeded on Google, but local database persistence failed. Catalog sync required to reconcile state.",
          },
        }).catch(() => {});

        throw new SocialError(
          "The video was updated on YouTube, but local database persistence failed. A catalog sync will reconcile the latest state.",
          "CONTENT_RECONCILIATION_REQUIRED",
          {
            provider: "YOUTUBE",
            statusCode: 500,
            retryable: true,
            cause: dbError,
          }
        );
      }

      // 14. Log Successful Mutation Audit Events
      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "CONTENT_UPDATE_SUCCEEDED",
        resource: "content",
        resourceId: row.contentId,
        details: {
          socialAccountId: socialAccount.id,
          externalContentId,
          changedFields,
          changes: {
            title: input.title !== undefined ? { from: liveVideo.snippet.title, to: updatedVideo.snippet.title } : undefined,
            privacyStatus: input.privacyStatus !== undefined ? { from: liveVideo.status?.privacyStatus, to: updatedVideo.status?.privacyStatus } : undefined,
            containsSyntheticMedia: input.containsSyntheticMedia !== undefined ? { from: liveVideo.status?.containsSyntheticMedia, to: updatedVideo.status?.containsSyntheticMedia } : undefined,
          },
          quotaUnitsEstimated: 51,
        },
      }).catch(() => {});

      if (changedFields.includes("privacyStatus")) {
        await logAuditEvent({
          workspaceId: options.workspaceId,
          userId: options.actorUserId,
          action: "CONTENT_PRIVACY_CHANGED",
          resource: "content",
          resourceId: row.contentId,
          details: {
            externalContentId,
            from: liveVideo.status?.privacyStatus,
            to: updatedVideo.status?.privacyStatus,
          },
        }).catch(() => {});
      }

      if (changedFields.includes("publishAt")) {
        await logAuditEvent({
          workspaceId: options.workspaceId,
          userId: options.actorUserId,
          action: "CONTENT_SCHEDULE_CHANGED",
          resource: "content",
          resourceId: row.contentId,
          details: {
            externalContentId,
            from: liveVideo.status?.publishAt,
            to: updatedVideo.status?.publishAt,
          },
        }).catch(() => {});
      }

      // 15. Return Fresh Sanitized DTO
      const updatedItem = await this.repository.getContentById(options.workspaceId, row.id);
      return updatedItem!;
    } catch (err) {
      if ((err as any)?.code !== "CONTENT_RECONCILIATION_REQUIRED") {
        await logAuditEvent({
          workspaceId: options.workspaceId,
          userId: options.actorUserId,
          action: "CONTENT_UPDATE_FAILED",
          resource: "content",
          resourceId: row.contentId,
          details: {
            error: err instanceof Error ? err.message : String(err),
            externalContentId,
            socialAccountId: socialAccount.id,
          },
        }).catch(() => {});
      }
      throw err;
    } finally {
      // 16. Release Distributed Lock
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }
}

export const contentService = new ContentService();
