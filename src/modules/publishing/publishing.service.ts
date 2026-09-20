import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { defaultLock, DistributedLock } from "@/lib/lock/distributed-lock";
import { SocialTokenManager } from "@/modules/social/token-manager";
import { SocialError } from "@/modules/social/errors";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { hasPermission } from "@/lib/auth/rbac";
import { encryptToken, decryptToken } from "@/lib/crypto/token";
import { getMediaStorage, MediaStorage } from "@/modules/storage/media-storage";
import { SocialPublisher } from "@/modules/social/providers/publisher.types";
import { YouTubePublisher } from "@/modules/social/providers/youtube/youtube.publisher";
import { hasYouTubeUploadScope } from "@/modules/social/providers/youtube/youtube.oauth";
import {
  PublishingStatus,
  PublishVideoInput,
  PublishingJobDTO,
  DEFAULT_UPLOAD_CHUNK_BYTES,
  validatePublishVideoInput,
  transitionPublishingJob,
  PublishingFailureMetadata,
} from "./publishing.types";

export class PublishingService {
  private lock: DistributedLock;
  private tokenManager: SocialTokenManager;
  private storage: MediaStorage;
  private publisher: SocialPublisher;

  constructor(options?: {
    lock?: DistributedLock;
    tokenManager?: SocialTokenManager;
    storage?: MediaStorage;
    publisher?: SocialPublisher;
  }) {
    this.lock = options?.lock ?? defaultLock;
    this.tokenManager = options?.tokenManager ?? new SocialTokenManager(this.lock);
    this.storage = options?.storage ?? getMediaStorage();
    this.publisher = options?.publisher ?? new YouTubePublisher();
  }

  /**
   * 6/7-Stage Authorization & Verification Pipeline.
   */
  private async authorizePublish(
    workspaceId: string,
    contentId: string,
    socialAccountId: string,
    actorUserId: string
  ) {
    // 1. Workspace Membership & RBAC
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: actorUserId,
        },
      },
    });

    if (!membership) {
      throw new SocialError("User is not a member of this workspace", "SOCIAL_AUTH_REQUIRED", {
        statusCode: 403,
      });
    }

    if (!hasPermission(membership.role, "content:publish")) {
      throw new SocialError(
        `Role ${membership.role} does not have content:publish permission`,
        "SOCIAL_PERMISSION_MISSING",
        { statusCode: 403 }
      );
    }

    // 2. Content Ownership
    const content = await prisma.content.findFirst({
      where: {
        id: contentId,
        workspaceId,
      },
    });

    if (!content) {
      throw new SocialError("Content not found in this workspace", "CONTENT_NOT_FOUND", {
        statusCode: 404,
      });
    }

    // 3. Social Account Ownership
    const account = await prisma.socialAccount.findFirst({
      where: {
        id: socialAccountId,
        workspaceId,
      },
      include: {
        platform: true,
        token: true,
      },
    });

    if (!account) {
      throw new SocialError(
        "Social account not found in this workspace",
        "SOCIAL_ACCOUNT_RESTRICTED",
        { statusCode: 404 }
      );
    }

    // 4. OAuth Scope Check
    if (!hasYouTubeUploadScope(account.token?.scopes)) {
      throw new SocialError(
        "Social account lacks YouTube video upload OAuth scope (https://www.googleapis.com/auth/youtube.upload)",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { statusCode: 403, userActionRequired: true, provider: "YOUTUBE" }
      );
    }

    // 5. Get or Create ContentPlatform binding
    let contentPlatform = await prisma.contentPlatform.findUnique({
      where: {
        contentId_socialAccountId: {
          contentId,
          socialAccountId,
        },
      },
    });

    if (!contentPlatform) {
      contentPlatform = await prisma.contentPlatform.create({
        data: {
          contentId,
          socialAccountId,
          status: "PENDING",
        },
      });
    }

    return { membership, content, account, contentPlatform };
  }

  /**
   * Primary entry point: Creates a publishing job and executes upload.
   */
  async createAndStartPublishingJob(
    input: PublishVideoInput,
    actorUserId: string
  ): Promise<PublishingJobDTO> {
    const validation = validatePublishVideoInput(input);
    if (!validation.valid) {
      throw new SocialError(
        `Invalid publishing input: ${validation.errors.join(", ")}`,
        "CONTENT_VALIDATION_ERROR",
        { statusCode: 400 }
      );
    }

    const { content, account: _account, contentPlatform } = await this.authorizePublish(
      input.workspaceId,
      input.contentId,
      input.socialAccountId,
      actorUserId
    );

    // Staging media verification
    const storageKey = (input.storageKey || input.videoStorageKey)!;
    const mediaInfo = await this.storage.getObjectMetadata(storageKey);
    if (!mediaInfo || mediaInfo.fileSizeBytes <= 0) {
      throw new SocialError("Staged video file is empty or missing", "CONTENT_VALIDATION_ERROR", {
        statusCode: 400,
      });
    }

    const idempotencyKey = input.idempotencyKey || `pub_${contentPlatform.id}_${Date.now()}`;

    // Idempotency: Check if an active/existing job already exists with this key
    if (input.idempotencyKey) {
      const existingJob = await prisma.publishingJob.findFirst({
        where: {
          contentPlatformId: contentPlatform.id,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existingJob) {
        return this.getPublishingJob(existingJob.id, actorUserId, input.workspaceId);
      }
    }

    // Create PublishingJob record
    const job = await prisma.publishingJob.create({
      data: {
        contentPlatformId: contentPlatform.id,
        idempotencyKey,
        publishingStatus: PublishingStatus.QUEUED,
        storageKey,
        totalBytes: BigInt(mediaInfo.fileSizeBytes),
        bytesUploaded: BigInt(0),
        thumbnailStatus: input.thumbnailStorageKey ? "PENDING" : "NONE",
        scheduledAt: (input.publishAt || input.scheduledAtUtc)
          ? new Date(input.publishAt || input.scheduledAtUtc!)
          : null,
        startedAt: new Date(),
        metadata: {
          privacyStatus: input.privacyStatus,
          title: input.title || content.title,
          description: input.description || content.description,
          tags: input.tags || [],
          categoryId: input.categoryId || "22",
          madeForKids: input.madeForKids ?? false,
          thumbnailStorageKey: input.thumbnailStorageKey,
          publishingTimezone: input.publishingTimezone || "UTC",
        },
      },
    });

    await logAuditEvent({
      workspaceId: input.workspaceId,
      userId: actorUserId,
      action: "VIDEO_UPLOAD_REQUESTED",
      resource: "PublishingJob",
      resourceId: job.id,
      details: {
        contentId: input.contentId,
        socialAccountId: input.socialAccountId,
        fileSizeBytes: mediaInfo.fileSizeBytes,
        privacyStatus: input.privacyStatus,
        scheduled: !!input.scheduledAtUtc,
      },
    });

    // Execute upload workflow under strict distributed lock ordering
    try {
      await this.executeUploadPipeline(job.id, input.workspaceId, actorUserId);
    } catch (err: unknown) {
      if (err instanceof SocialError && err.statusCode === 409) {
        // Concurrency / Lock contention: another worker is processing this job.
        return this.getPublishingJob(job.id, actorUserId, input.workspaceId);
      }
      throw err;
    }

    return this.getPublishingJob(job.id, actorUserId, input.workspaceId);
  }

  /**
   * Executes chunked upload pipeline under strict global lock ordering.
   * Lock Order:
   * 1. publishing-job:${publishingJobId}
   * 2. content-publish:${socialAccountId}:${contentPlatformId}
   */
  private async executeUploadPipeline(
    jobId: string,
    workspaceId: string,
    actorUserId: string
  ): Promise<void> {
    const job = await prisma.publishingJob.findUnique({
      where: { id: jobId },
      include: {
        contentPlatform: {
          include: {
            socialAccount: true,
            content: true,
          },
        },
      },
    });

    if (!job) {
      throw new SocialError(`Publishing job not found: ${jobId}`, "PUBLISHING_JOB_NOT_FOUND", {
        statusCode: 404,
      });
    }

    const { contentPlatform } = job;
    const socialAccountId = contentPlatform.socialAccountId;

    // GLOBAL ACQUISITION ORDER:
    // Step 1: publishing-job lock
    const jobLockKey = `publishing-job:${job.id}`;
    const jobLockToken = await this.lock.acquire(jobLockKey, { ttlMs: 10 * 60 * 1000 });
    if (!jobLockToken) {
      throw new SocialError(
        "Another worker is currently processing this publishing job",
        "SOCIAL_RATE_LIMITED",
        { statusCode: 409, retryable: true }
      );
    }

    // Step 2: content-publish lock
    const contentLockKey = `content-publish:${socialAccountId}:${contentPlatform.id}`;
    const contentLockToken = await this.lock.acquire(contentLockKey, { ttlMs: 5 * 60 * 1000 });
    if (!contentLockToken) {
      // Release step 1 before failing
      await this.lock.release(jobLockKey, jobLockToken);
      throw new SocialError(
        "A publish operation is already in progress for this content on this account",
        "SOCIAL_RATE_LIMITED",
        { statusCode: 409, retryable: true }
      );
    }

    try {
      // Transition to UPLOADING
      transitionPublishingJob(job.publishingStatus, PublishingStatus.UPLOADING);
      await prisma.publishingJob.update({
        where: { id: job.id },
        data: {
          publishingStatus: PublishingStatus.UPLOADING,
          attempts: { increment: 1 },
        },
      });

      await logAuditEvent({
        workspaceId,
        userId: actorUserId,
        action: "VIDEO_UPLOAD_STARTED",
        resource: "PublishingJob",
        resourceId: job.id,
        details: {
          contentPlatformId: contentPlatform.id,
          socialAccountId,
        },
      });

      // Get valid access token
      const accessToken = await this.tokenManager.getValidAccessToken(socialAccountId);

      const metadata = (job.metadata || {}) as Record<string, unknown>;
      const payload = {
        title: (metadata.title as string) || contentPlatform.content?.title || "Untitled Video",
        description: (metadata.description as string) || contentPlatform.content?.description || "",
        tags: (metadata.tags as string[]) || [],
        privacyStatus: (metadata.privacyStatus as "PUBLIC" | "PRIVATE" | "UNLISTED") || "PRIVATE",
        scheduledAtUtc: job.scheduledAt,
        categoryId: (metadata.categoryId as string) || "22",
        madeForKids: (metadata.madeForKids as boolean) || false,
        mediaKey: job.storageKey || "",
      };

      const mediaInfo = await this.storage.getObjectMetadata(job.storageKey || "");

      // 1. Initialize Resumable Session if not already initialized
      let sessionUrl = "";
      if (job.uploadSessionUrlEncrypted) {
        try {
          sessionUrl = decryptToken(job.uploadSessionUrlEncrypted);
        } catch {
          sessionUrl = "";
        }
      }

      if (!sessionUrl) {
        const session = await this.publisher.initPublishingSession(
          socialAccountId,
          payload,
          mediaInfo,
          accessToken
        );
        sessionUrl = session.sessionUrl;

        // Encrypt and persist session URL server-side (Never exposed to client)
        const encryptedSessionUrl = encryptToken(sessionUrl);
        await prisma.publishingJob.update({
          where: { id: job.id },
          data: {
            uploadSessionUrlEncrypted: encryptedSessionUrl,
          },
        });
      }

      // 2. Stream Chunks
      const totalBytes = Number(job.totalBytes || mediaInfo.fileSizeBytes);
      let bytesUploaded = Number(job.bytesUploaded);
      let externalContentId: string | undefined;

      const sessionObj = {
        provider: "YOUTUBE" as const,
        sessionUrl,
        bytesUploaded,
        totalBytes,
      };

      while (bytesUploaded < totalBytes) {
        const chunkSize = Math.min(DEFAULT_UPLOAD_CHUNK_BYTES, totalBytes - bytesUploaded);
        const startByte = bytesUploaded;
        const endByte = startByte + chunkSize - 1;

        // Read chunk from MediaStorage
        const stream = await this.storage.getByteRangeStream(
          job.storageKey || "",
          startByte,
          endByte
        );
        const chunkBuffer = await streamToBuffer(stream);

        const chunkResult = await this.publisher.uploadNextChunk(
          sessionObj,
          chunkBuffer,
          { start: startByte, end: endByte, total: totalBytes },
          accessToken
        );

        bytesUploaded = chunkResult.bytesUploaded;
        sessionObj.bytesUploaded = bytesUploaded;

        await prisma.publishingJob.update({
          where: { id: job.id },
          data: {
            bytesUploaded: BigInt(bytesUploaded),
          },
        });

        if (chunkResult.completed) {
          externalContentId = chunkResult.externalContentId;
          break;
        }
      }

      if (!externalContentId) {
        throw new SocialError(
          "Upload completed but external content ID was not captured",
          "SOCIAL_API_ERROR",
          { statusCode: 502, retryable: true, provider: "YOUTUBE" }
        );
      }

      // Transition to UPLOADED
      transitionPublishingJob(PublishingStatus.UPLOADING, PublishingStatus.UPLOADED);

      // 3. Update Canonical external content identity on ContentPlatform
      await prisma.contentPlatform.update({
        where: { id: contentPlatform.id },
        data: {
          externalContentId,
          status: job.scheduledAt ? "SCHEDULED" : "PUBLISHED",
          scheduledAt: job.scheduledAt,
          publishedAt: job.scheduledAt ? null : new Date(),
        },
      });

      if (!job.scheduledAt) {
        await prisma.content.update({
          where: { id: contentPlatform.contentId },
          data: { status: "PUBLISHED", publishedAt: new Date() },
        });
      }

      // 4. Handle Optional Decoupled Custom Thumbnail
      const thumbnailKey = metadata.thumbnailStorageKey as string | undefined;
      if (thumbnailKey && this.publisher.uploadThumbnail) {
        try {
          const thumbMeta = await this.storage.getObjectMetadata(thumbnailKey);
          const thumbStream = await this.storage.getByteRangeStream(
            thumbnailKey,
            0,
            thumbMeta.fileSizeBytes - 1
          );
          const thumbBuffer = await streamToBuffer(thumbStream);

          await this.publisher.uploadThumbnail(
            externalContentId,
            thumbBuffer,
            thumbMeta.mimeType,
            accessToken
          );

          await prisma.publishingJob.update({
            where: { id: job.id },
            data: { thumbnailStatus: "UPLOADED" },
          });

          await logAuditEvent({
            workspaceId,
            userId: actorUserId,
            action: "THUMBNAIL_UPDATED",
            resource: "ContentPlatform",
            resourceId: contentPlatform.id,
            details: { externalContentId, thumbnailKey },
          });
        } catch (thumbErr) {
          // Thumbnail failure DOES NOT fail the video upload!
          await prisma.publishingJob.update({
            where: { id: job.id },
            data: { thumbnailStatus: "FAILED" },
          });

          await logAuditEvent({
            workspaceId,
            userId: actorUserId,
            action: "THUMBNAIL_FAILED",
            resource: "ContentPlatform",
            resourceId: contentPlatform.id,
            details: {
              externalContentId,
              error: thumbErr instanceof Error ? thumbErr.message : String(thumbErr),
            },
          });
        }
      }

      // 5. Finalize Job Status
      const finalStatus = job.scheduledAt
        ? PublishingStatus.SCHEDULED
        : PublishingStatus.PUBLISHED;

      await prisma.publishingJob.update({
        where: { id: job.id },
        data: {
          publishingStatus: finalStatus,
          status: "COMPLETED",
          completedAt: new Date(),
          uploadSessionUrlEncrypted: null, // Clear sensitive session secret upon completion
        },
      });

      await logAuditEvent({
        workspaceId,
        userId: actorUserId,
        action: job.scheduledAt ? "PUBLISH_SCHEDULED" : "VIDEO_UPLOAD_COMPLETED",
        resource: "PublishingJob",
        resourceId: job.id,
        details: {
          externalContentId,
          contentPlatformId: contentPlatform.id,
          finalStatus,
        },
      });
    } catch (err: unknown) {
      await this.handlePublishingError(job.id, err, workspaceId, actorUserId);
      throw err;
    } finally {
      // GLOBAL RELEASE ORDER (Reverse of acquisition - LIFO):
      // Step 1: Release content-publish lock
      if (contentLockToken) {
        await this.lock.release(contentLockKey, contentLockToken);
      }
      // Step 2: Release publishing-job lock
      if (jobLockToken) {
        await this.lock.release(jobLockKey, jobLockToken);
      }
    }
  }

  /**
   * Handles failure and initiates deterministic reconciliation if outcome is unknown.
   */
  private async handlePublishingError(
    jobId: string,
    err: unknown,
    workspaceId: string,
    actorUserId: string
  ): Promise<void> {
    const job = await prisma.publishingJob.findUnique({
      where: { id: jobId },
      include: { contentPlatform: true },
    });
    if (!job) return;

    const isSocialError = err instanceof SocialError;
    const statusCode = isSocialError ? err.statusCode : 500;
    const retryable = isSocialError ? err.retryable : false;
    const errorCode = isSocialError ? err.code : "INTERNAL_ERROR";
    const errorMessage = err instanceof Error ? err.message : String(err);

    // If ambiguous network/socket drop on chunk, attempt reconciliation
    if (
      job.publishingStatus === PublishingStatus.UPLOADING &&
      (errorCode === "SOCIAL_API_ERROR" || errorCode === "RESUMABLE_SESSION_EXPIRED" || !isSocialError)
    ) {
      try {
        await this.reconcilePublishingJob(job.id, actorUserId, workspaceId);
        return;
      } catch {
        // Reconciliation failed to resolve; record structured FAILED metadata
      }
    }

    const failureMeta: PublishingFailureMetadata = {
      retryable,
      failureCode: (errorCode as PublishingFailureMetadata["failureCode"]) || "INTERNAL_ERROR",
      failureSource: isSocialError ? "YOUTUBE_API" : "PLOTTERSHUB_STAGING",
      httpStatus: statusCode,
      retryCount: job.attempts,
      maxRetries: 3,
      message: errorMessage,
    };

    await prisma.publishingJob.update({
      where: { id: job.id },
      data: {
        publishingStatus: PublishingStatus.FAILED,
        status: "FAILED",
        errorCode,
        errorMessage,
        metadata: ({
          ...(typeof job.metadata === "object" && job.metadata !== null ? (job.metadata as Record<string, unknown>) : {}),
          ...failureMeta,
        } as unknown as Prisma.InputJsonValue),
      },
    });

    await logAuditEvent({
      workspaceId,
      userId: actorUserId,
      action: "VIDEO_UPLOAD_FAILED",
      resource: "PublishingJob",
      resourceId: job.id,
      details: {
        errorCode,
        errorMessage,
        retryable,
      },
    });
  }

  /**
   * Deterministic Reconciliation Flow for Unknown Outcomes.
   */
  async reconcilePublishingJob(
    jobId: string,
    actorUserId: string,
    workspaceId: string
  ): Promise<PublishingJobDTO> {
    const job = await prisma.publishingJob.findUnique({
      where: { id: jobId },
      include: {
        contentPlatform: {
          include: {
            socialAccount: true,
            content: true,
          },
        },
      },
    });

    if (!job) {
      throw new SocialError("Publishing job not found", "PUBLISHING_JOB_NOT_FOUND", {
        statusCode: 404,
      });
    }

    // Step 1: Set state to RECONCILING
    await prisma.publishingJob.update({
      where: { id: job.id },
      data: { publishingStatus: PublishingStatus.RECONCILING },
    });

    const accessToken = await this.tokenManager.getValidAccessToken(
      job.contentPlatform.socialAccountId
    );

    let sessionUrl = "";
    if (job.uploadSessionUrlEncrypted) {
      try {
        sessionUrl = decryptToken(job.uploadSessionUrlEncrypted);
      } catch {
        sessionUrl = "";
      }
    }

    // Step 2: Check session status if URL exists
    if (sessionUrl) {
      const totalBytes = Number(job.totalBytes || 0);
      const sessionStatus = await this.publisher.checkSessionStatus(
        {
          provider: "YOUTUBE",
          sessionUrl,
          bytesUploaded: Number(job.bytesUploaded),
          totalBytes,
        },
        totalBytes,
        accessToken
      );

      if (sessionStatus.status === "COMPLETED" && sessionStatus.externalContentId) {
        // Recovered!
        await prisma.contentPlatform.update({
          where: { id: job.contentPlatformId },
          data: {
            externalContentId: sessionStatus.externalContentId,
            status: job.scheduledAt ? "SCHEDULED" : "PUBLISHED",
          },
        });

        await prisma.publishingJob.update({
          where: { id: job.id },
          data: {
            publishingStatus: job.scheduledAt
              ? PublishingStatus.SCHEDULED
              : PublishingStatus.PUBLISHED,
            status: "COMPLETED",
            uploadSessionUrlEncrypted: null,
          },
        });

        await logAuditEvent({
          workspaceId,
          userId: actorUserId,
          action: "PUBLISHING_RECONCILED",
          resource: "PublishingJob",
          resourceId: job.id,
          details: { externalContentId: sessionStatus.externalContentId, recoveredVia: "SESSION" },
        });

        return this.getPublishingJob(job.id, actorUserId, workspaceId);
      }

      if (sessionStatus.status === "IN_PROGRESS") {
        // Can resume! Update bytes_uploaded and set back to UPLOADING
        await prisma.publishingJob.update({
          where: { id: job.id },
          data: {
            bytesUploaded: BigInt(sessionStatus.bytesReceived),
            publishingStatus: PublishingStatus.UPLOADING,
          },
        });

        return this.getPublishingJob(job.id, actorUserId, workspaceId);
      }
    }

    // Step 3: Session is lost/expired; check recent uploads if publisher supports it
    if (this.publisher.reconcileRecentUpload) {
      const metadata = (job.metadata || {}) as Record<string, unknown>;
      const payload = {
        title: (metadata.title as string) || job.contentPlatform.content.title,
        description: (metadata.description as string) || job.contentPlatform.content.description || "",
        tags: (metadata.tags as string[]) || [],
        privacyStatus: (metadata.privacyStatus as "PUBLIC" | "PRIVATE" | "UNLISTED") || "PRIVATE",
        mediaKey: job.storageKey || "",
      };

      const result = await this.publisher.reconcileRecentUpload(
        job.contentPlatform.socialAccountId,
        payload,
        15, // 15 minute lookback window
        accessToken
      );

      if (result?.matched && result?.externalContentId && result?.confidence === "HIGH") {
        await prisma.contentPlatform.update({
          where: { id: job.contentPlatformId },
          data: {
            externalContentId: result.externalContentId,
            status: job.scheduledAt ? "SCHEDULED" : "PUBLISHED",
          },
        });

        await prisma.publishingJob.update({
          where: { id: job.id },
          data: {
            publishingStatus: job.scheduledAt
              ? PublishingStatus.SCHEDULED
              : PublishingStatus.PUBLISHED,
            status: "COMPLETED",
            uploadSessionUrlEncrypted: null,
          },
        });

        await logAuditEvent({
          workspaceId,
          userId: actorUserId,
          action: "PUBLISHING_RECONCILED",
          resource: "PublishingJob",
          resourceId: job.id,
          details: { externalContentId: result.externalContentId, recoveredVia: "CHANNEL_MATCH" },
        });

        return this.getPublishingJob(job.id, actorUserId, workspaceId);
      }
    }

    // Insufficient confidence: Do NOT create duplicate upload! Mark MANUAL_REVIEW
    await prisma.publishingJob.update({
      where: { id: job.id },
      data: {
        publishingStatus: PublishingStatus.FAILED,
        status: "FAILED",
        errorCode: "RECONCILIATION_UNCONFIRMED",
        errorMessage:
          "Upload outcome is unknown and could not be verified automatically. Please check your YouTube Studio channel before retrying.",
        metadata: {
          ...(typeof job.metadata === "object" ? job.metadata : {}),
          retryable: false,
          requiresManualReview: true,
          failureCode: "RECONCILIATION_UNCONFIRMED",
          failureSource: "YOUTUBE_API",
        },
      },
    });

    return this.getPublishingJob(job.id, actorUserId, workspaceId);
  }

  /**
   * Resumes an interrupted publishing job.
   */
  async resumePublishingJob(
    jobId: string,
    actorUserId: string,
    workspaceId: string
  ): Promise<PublishingJobDTO> {
    const job = await prisma.publishingJob.findUnique({
      where: { id: jobId },
      include: { contentPlatform: true },
    });

    if (!job) {
      throw new SocialError("Publishing job not found", "PUBLISHING_JOB_NOT_FOUND", {
        statusCode: 404,
      });
    }

    // Only allow resuming from UPLOADING, FAILED (retryable), or RECONCILING
    if (
      job.publishingStatus !== PublishingStatus.UPLOADING &&
      job.publishingStatus !== PublishingStatus.FAILED &&
      job.publishingStatus !== PublishingStatus.RECONCILING
    ) {
      throw new SocialError(
        `Cannot resume job with status ${job.publishingStatus}`,
        "INVALID_PUBLISHING_TRANSITION",
        { statusCode: 400 }
      );
    }

    await logAuditEvent({
      workspaceId,
      userId: actorUserId,
      action: "PUBLISHING_RESUMED",
      resource: "PublishingJob",
      resourceId: job.id,
    });

    await this.executeUploadPipeline(job.id, workspaceId, actorUserId);
    return this.getPublishingJob(job.id, actorUserId, workspaceId);
  }

  /**
   * Cancels a publishing job.
   */
  async cancelPublishingJob(
    jobId: string,
    actorUserId: string,
    workspaceId: string
  ): Promise<PublishingJobDTO> {
    const job = await prisma.publishingJob.findUnique({
      where: { id: jobId },
      include: { contentPlatform: true },
    });

    if (!job) {
      throw new SocialError("Publishing job not found", "PUBLISHING_JOB_NOT_FOUND", {
        statusCode: 404,
      });
    }

    transitionPublishingJob(job.publishingStatus, PublishingStatus.CANCELLED);

    await prisma.publishingJob.update({
      where: { id: job.id },
      data: {
        publishingStatus: PublishingStatus.CANCELLED,
        status: "CANCELLED",
        uploadSessionUrlEncrypted: null,
      },
    });

    await logAuditEvent({
      workspaceId,
      userId: actorUserId,
      action: "PUBLISHING_CANCELLED",
      resource: "PublishingJob",
      resourceId: job.id,
    });

    return this.getPublishingJob(job.id, actorUserId, workspaceId);
  }

  /**
   * Retrieves status and progress of a publishing job.
   */
  async getPublishingJob(
    jobId: string,
    _actorUserId: string,
    _workspaceId: string
  ): Promise<PublishingJobDTO> {
    const job = await prisma.publishingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new SocialError("Publishing job not found", "PUBLISHING_JOB_NOT_FOUND", {
        statusCode: 404,
      });
    }

    return {
      id: job.id,
      contentPlatformId: job.contentPlatformId,
      idempotencyKey: job.idempotencyKey,
      publishingStatus: job.publishingStatus,
      bytesUploaded: Number(job.bytesUploaded),
      totalBytes: job.totalBytes ? Number(job.totalBytes) : null,
      thumbnailStatus: job.thumbnailStatus,
      scheduledAt: job.scheduledAt?.toISOString() || null,
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      metadata: (job.metadata as unknown as PublishingFailureMetadata) || null,
      createdAt: job.createdAt.toISOString(),
    };
  }

  /**
   * Uploads or replaces custom thumbnail on an already published YouTube video.
   */
  async uploadCustomThumbnail(
    contentId: string,
    socialAccountId: string,
    thumbnailStorageKey: string,
    actorUserId: string,
    workspaceId: string
  ): Promise<void> {
    const { contentPlatform } = await this.authorizePublish(
      workspaceId,
      contentId,
      socialAccountId,
      actorUserId
    );

    if (!contentPlatform.externalContentId) {
      throw new SocialError(
        "Cannot upload thumbnail: video has not been published to YouTube yet",
        "CONTENT_VALIDATION_ERROR",
        { statusCode: 400 }
      );
    }

    if (!this.publisher.uploadThumbnail) {
      throw new SocialError(
        "Thumbnail upload is not supported by this provider",
        "SOCIAL_UNSUPPORTED_OPERATION",
        { statusCode: 400 }
      );
    }

    const thumbMeta = await this.storage.getObjectMetadata(thumbnailStorageKey);
    const thumbStream = await this.storage.getByteRangeStream(
      thumbnailStorageKey,
      0,
      thumbMeta.fileSizeBytes - 1
    );
    const thumbBuffer = await streamToBuffer(thumbStream);

    const accessToken = await this.tokenManager.getValidAccessToken(socialAccountId);

    await this.publisher.uploadThumbnail(
      contentPlatform.externalContentId,
      thumbBuffer,
      thumbMeta.mimeType,
      accessToken
    );

    await logAuditEvent({
      workspaceId,
      userId: actorUserId,
      action: "THUMBNAIL_UPDATED",
      resource: "ContentPlatform",
      resourceId: contentPlatform.id,
      details: { externalContentId: contentPlatform.externalContentId, thumbnailStorageKey },
    });
  }
}

/**
 * Helper: Converts a NodeJS.ReadableStream to Buffer.
 */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

export const publishingService = new PublishingService();
