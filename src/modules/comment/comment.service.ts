import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { DistributedLock, defaultLock } from "@/lib/lock/distributed-lock";
import { SocialTokenManager, socialTokenManager } from "@/modules/social/token-manager";
import { YouTubeDataApiClient } from "@/modules/social/providers/youtube/youtube.data-api";
import { SocialProviderRegistry } from "@/modules/social/registry";
import { hasYouTubeWriteScope, hasYouTubeCommentScope } from "@/modules/social/providers/youtube/youtube.oauth";
import { SocialError } from "@/modules/social/errors";
import { hasPermission, Permission } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/modules/audit/audit-service";
import {
  CommentDTO,
  CommentThreadDTO,
  CreateCommentInput,
  EditCommentInput,
  ModerationAction,
  ReplyCommentInput,
  validateCommentText,
} from "./comment.types";
import { YouTubeCommentResource } from "@/modules/social/providers/youtube/youtube.comment.types";

export interface CommentServiceOptions {
  actorUserId?: string;
  workspaceId: string;
}

export class CommentService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly lock: DistributedLock = defaultLock,
    private readonly tokenManager: SocialTokenManager = socialTokenManager,
    private readonly dataApiClient: YouTubeDataApiClient = new YouTubeDataApiClient()
  ) {}

  /**
   * Validates actor membership and permission in target workspace.
   */
  private async validateAccess(
    actorUserId: string | undefined,
    workspaceId: string,
    permission: Permission
  ): Promise<void> {
    if (!actorUserId) {
      return;
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
      throw new SocialError("User is not a member of this workspace.", "SOCIAL_AUTH_REQUIRED", {
        statusCode: 403,
      });
    }

    if (!hasPermission(membership.role, permission)) {
      throw new SocialError(
        `User lacks required permission '${permission}'.`,
        "SOCIAL_AUTH_REQUIRED",
        { statusCode: 403 }
      );
    }
  }

  /**
   * Resolves and verifies the SocialAccount belonging to the workspace.
   */
  private async resolveSocialAccount(socialAccountId: string, workspaceId: string) {
    const account = await this.db.socialAccount.findFirst({
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
      throw new SocialError("Social account not found in this workspace.", "SOCIAL_INVALID_REQUEST", {
        statusCode: 404,
      });
    }

    if (account.platform.code !== "YOUTUBE") {
      throw new SocialError(
        `Unsupported platform for YouTube comments: ${account.platform.code}`,
        "SOCIAL_UNSUPPORTED_OPERATION",
        { provider: account.platform.code, statusCode: 400 }
      );
    }

    if (account.status === "REAUTH_REQUIRED" || account.status === "DISCONNECTED") {
      throw new SocialError(
        `Social account requires re-authorization: status is ${account.status}`,
        "SOCIAL_TOKEN_REVOKED",
        { provider: "YOUTUBE", statusCode: 401, userActionRequired: true }
      );
    }

    return account;
  }

  /**
   * Helper to map YouTubeCommentResource to CommentDTO.
   */
  private mapCommentResourceToDTO(res: YouTubeCommentResource): CommentDTO {
    return {
      id: res.id,
      author: {
        displayName: res.snippet.authorDisplayName,
        profileImageUrl: res.snippet.authorProfileImageUrl,
        channelUrl: res.snippet.authorChannelUrl,
        channelId: res.snippet.authorChannelId?.value,
      },
      textDisplay: res.snippet.textDisplay,
      textOriginal: res.snippet.textOriginal,
      publishedAt: res.snippet.publishedAt,
      updatedAt: res.snippet.updatedAt,
      likeCount: res.snippet.likeCount || 0,
      moderationStatus: res.snippet.moderationStatus,
      parentId: res.snippet.parentId,
    };
  }

  /**
   * Lists comment threads for a video.
   */
  async listCommentThreads(
    options: CommentServiceOptions,
    socialAccountId: string,
    videoId: string,
    pageToken?: string,
    order: "time" | "relevance" = "time"
  ): Promise<{ items: CommentThreadDTO[]; nextPageToken?: string }> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:view");

    if (!videoId || videoId.trim() === "") {
      throw new SocialError("Video ID is required to list comments.", "SOCIAL_INVALID_REQUEST", {
        statusCode: 400,
      });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canViewComments) {
      throw new SocialError("Provider does not support viewing comments.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (account.token?.scopes && !hasYouTubeCommentScope(account.token.scopes)) {
      throw new SocialError(
        "Your YouTube connection lacks required comment permissions. Please reconnect your YouTube channel to view and manage comments.",
        "SOCIAL_PERMISSION_MISSING",
        {
          provider: "YOUTUBE",
          statusCode: 403,
          userActionRequired: true,
        }
      );
    }

    const accessToken = await this.tokenManager.getValidAccessToken(account.id);
    const response = await this.dataApiClient.listCommentThreads(accessToken, {
      videoId,
      pageToken,
      order,
      maxResults: 20,
    });

    const items: CommentThreadDTO[] = (response.items || []).map((thread) => ({
      id: thread.id,
      videoId: thread.snippet.videoId || videoId,
      channelId: thread.snippet.channelId,
      topLevelComment: this.mapCommentResourceToDTO(thread.snippet.topLevelComment),
      totalReplyCount: thread.snippet.totalReplyCount || 0,
      canReply: thread.snippet.canReply ?? true,
      isPublic: thread.snippet.isPublic ?? true,
      replies: thread.replies?.comments?.map((c) => this.mapCommentResourceToDTO(c)) || [],
    }));

    return {
      items,
      nextPageToken: response.nextPageToken,
    };
  }

  /**
   * Lists replies for a parent comment.
   */
  async listReplies(
    options: CommentServiceOptions,
    socialAccountId: string,
    parentCommentId: string,
    pageToken?: string
  ): Promise<{ items: CommentDTO[]; nextPageToken?: string }> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:view");

    if (!parentCommentId || parentCommentId.trim() === "") {
      throw new SocialError("Parent Comment ID is required.", "SOCIAL_INVALID_REQUEST", {
        statusCode: 400,
      });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canViewComments) {
      throw new SocialError("Provider does not support viewing comments.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    const accessToken = await this.tokenManager.getValidAccessToken(account.id);
    const response = await this.dataApiClient.listComments(accessToken, parentCommentId, pageToken);

    const items: CommentDTO[] = (response.items || []).map((c) => this.mapCommentResourceToDTO(c));

    return {
      items,
      nextPageToken: response.nextPageToken,
    };
  }

  /**
   * Creates a top-level comment thread on a video.
   */
  async createComment(
    options: CommentServiceOptions,
    socialAccountId: string,
    videoId: string,
    input: CreateCommentInput
  ): Promise<CommentThreadDTO> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    if (!videoId || videoId.trim() === "") {
      throw new SocialError("Video ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const validation = validateCommentText(input?.text);
    if (!validation.valid) {
      throw new SocialError(validation.error || "Invalid comment text.", "COMMENT_VALIDATION_ERROR", {
        statusCode: 400,
      });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canCreateComment) {
      throw new SocialError("Provider does not support creating comments.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    // Concurrency lock for comment creation on video
    const lockKey = `comment-create:${account.id}:${videoId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A comment submission is already in progress for this video. Please wait.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      const thread = await this.dataApiClient.insertCommentThread(accessToken, {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: {
              textOriginal: input.text,
            },
          },
        },
      });

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "COMMENT_CREATED",
        resource: "comment",
        resourceId: thread.id,
        details: {
          socialAccountId: account.id,
          videoId,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return {
        id: thread.id,
        videoId: thread.snippet.videoId || videoId,
        channelId: thread.snippet.channelId,
        topLevelComment: this.mapCommentResourceToDTO(thread.snippet.topLevelComment),
        totalReplyCount: 0,
        canReply: thread.snippet.canReply ?? true,
        isPublic: thread.snippet.isPublic ?? true,
        replies: [],
      };
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Inserts a reply to an existing comment.
   */
  async replyToComment(
    options: CommentServiceOptions,
    socialAccountId: string,
    parentCommentId: string,
    input: ReplyCommentInput
  ): Promise<CommentDTO> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    if (!parentCommentId || parentCommentId.trim() === "") {
      throw new SocialError("Parent Comment ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const validation = validateCommentText(input?.text);
    if (!validation.valid) {
      throw new SocialError(validation.error || "Invalid comment text.", "COMMENT_VALIDATION_ERROR", {
        statusCode: 400,
      });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canReplyToComment) {
      throw new SocialError("Provider does not support replying to comments.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    // Concurrency lock for replying to parent comment
    const lockKey = `comment-create:${account.id}:${parentCommentId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A reply is already in progress for this comment. Please wait.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      const reply = await this.dataApiClient.insertComment(accessToken, {
        snippet: {
          parentId: parentCommentId,
          textOriginal: input.text,
        },
      });

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "COMMENT_REPLIED",
        resource: "comment",
        resourceId: reply.id,
        details: {
          socialAccountId: account.id,
          parentCommentId,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return this.mapCommentResourceToDTO(reply);
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Edits an existing comment.
   */
  async editComment(
    options: CommentServiceOptions,
    socialAccountId: string,
    commentId: string,
    input: EditCommentInput
  ): Promise<CommentDTO> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    if (!commentId || commentId.trim() === "") {
      throw new SocialError("Comment ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const validation = validateCommentText(input?.text);
    if (!validation.valid) {
      throw new SocialError(validation.error || "Invalid comment text.", "COMMENT_VALIDATION_ERROR", {
        statusCode: 400,
      });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canEditOwnComment) {
      throw new SocialError("Provider does not support editing comments.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    // Concurrency lock for mutating existing comment (Decision 4: comment-mutation:${socialAccountId}:${commentId})
    const lockKey = `comment-mutation:${account.id}:${commentId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A mutation is already in progress for this comment. Please wait.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      const updated = await this.dataApiClient.updateComment(accessToken, {
        id: commentId,
        snippet: {
          textOriginal: input.text,
        },
      });

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "COMMENT_UPDATED",
        resource: "comment",
        resourceId: commentId,
        details: {
          socialAccountId: account.id,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return this.mapCommentResourceToDTO(updated);
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Deletes an existing comment.
   */
  async deleteComment(
    options: CommentServiceOptions,
    socialAccountId: string,
    commentId: string
  ): Promise<{ success: boolean }> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    if (!commentId || commentId.trim() === "") {
      throw new SocialError("Comment ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canDeleteOwnComment) {
      throw new SocialError("Provider does not support deleting comments.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    // Concurrency lock for mutating existing comment (Decision 4: comment-mutation:${socialAccountId}:${commentId})
    const lockKey = `comment-mutation:${account.id}:${commentId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A mutation is already in progress for this comment. Please wait.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      await this.dataApiClient.deleteComment(accessToken, commentId);

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "COMMENT_DELETED",
        resource: "comment",
        resourceId: commentId,
        details: {
          socialAccountId: account.id,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return { success: true };
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Sets moderation status for a comment (Requires content:moderate permission).
   */
  async moderateComment(
    options: CommentServiceOptions,
    socialAccountId: string,
    commentId: string,
    action: ModerationAction,
    banAuthor = false
  ): Promise<{ success: boolean }> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:moderate");

    if (!commentId || commentId.trim() === "") {
      throw new SocialError("Comment ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canModerateComments) {
      throw new SocialError("Provider does not support comment moderation.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    const moderationStatusMap: Record<ModerationAction, "published" | "heldForReview" | "rejected"> = {
      PUBLISH: "published",
      HOLD: "heldForReview",
      REJECT: "rejected",
    };

    const statusToSet = moderationStatusMap[action];
    if (!statusToSet) {
      throw new SocialError(`Invalid moderation action: ${action}`, "SOCIAL_INVALID_REQUEST", {
        statusCode: 400,
      });
    }

    // Concurrency lock for mutating existing comment (Decision 4: comment-mutation:${socialAccountId}:${commentId})
    const lockKey = `comment-mutation:${account.id}:${commentId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A mutation is already in progress for this comment. Please wait.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      await this.dataApiClient.setModerationStatus(accessToken, [commentId], statusToSet, banAuthor);

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "COMMENT_MODERATION_CHANGED",
        resource: "comment",
        resourceId: commentId,
        details: {
          socialAccountId: account.id,
          action,
          banAuthor,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return { success: true };
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }
}

export const commentService = new CommentService();
