import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommentService } from "./comment.service";
import { InMemoryLock } from "@/lib/lock/distributed-lock";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { validateCommentText } from "./comment.types";

vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Phase 3.4E — YouTube Comment Service Suite", () => {
  let mockDb: any;
  let lock: InMemoryLock;
  let mockTokenManager: any;
  let mockDataApiClient: any;
  let service: CommentService;

  const validWorkspaceId = "ws-comment-100";
  const validAccountId = "sa-comment-200";
  const validUserId = "user-comment-300";
  const validVideoId = "video-yt-555";

  const defaultMockAccount = {
    id: validAccountId,
    workspaceId: validWorkspaceId,
    externalAccountId: "channel-yt-123",
    status: "HEALTHY",
    platform: { code: "YOUTUBE", name: "YouTube" },
    token: {
      scopes: ["https://www.googleapis.com/auth/youtube"],
    },
  };

  const sampleCommentResource = {
    kind: "youtube#comment" as const,
    id: "comment-top-111",
    snippet: {
      authorDisplayName: "Alice Creator",
      authorProfileImageUrl: "https://yt.example.com/alice.jpg",
      textDisplay: "Great video tutorial!",
      textOriginal: "Great video tutorial!",
      publishedAt: "2026-09-19T02:00:00Z",
      likeCount: 12,
      moderationStatus: "published" as const,
    },
  };

  const sampleReplyResource = {
    kind: "youtube#comment" as const,
    id: "comment-reply-222",
    snippet: {
      authorDisplayName: "Bob Viewer",
      textDisplay: "Thanks for the feedback!",
      textOriginal: "Thanks for the feedback!",
      parentId: "comment-top-111",
      publishedAt: "2026-09-19T02:30:00Z",
      likeCount: 2,
    },
  };

  const sampleThreadResource = {
    kind: "youtube#commentThread" as const,
    id: "thread-top-111",
    snippet: {
      videoId: validVideoId,
      topLevelComment: sampleCommentResource,
      totalReplyCount: 1,
      canReply: true,
      isPublic: true,
    },
    replies: {
      comments: [sampleReplyResource],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      workspaceMember: {
        findUnique: vi.fn().mockResolvedValue({ role: "EDITOR" }),
      },
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue(defaultMockAccount),
      },
    };

    lock = new InMemoryLock();

    mockTokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
    };

    mockDataApiClient = {
      listCommentThreads: vi.fn().mockResolvedValue({
        items: [sampleThreadResource],
        nextPageToken: "next-comments-token",
      }),
      insertCommentThread: vi.fn().mockResolvedValue(sampleThreadResource),
      listComments: vi.fn().mockResolvedValue({
        items: [sampleReplyResource],
        nextPageToken: undefined,
      }),
      insertComment: vi.fn().mockResolvedValue(sampleReplyResource),
      updateComment: vi.fn().mockResolvedValue({
        ...sampleCommentResource,
        snippet: {
          ...sampleCommentResource.snippet,
          textOriginal: "Updated comment text!",
          textDisplay: "Updated comment text!",
        },
      }),
      deleteComment: vi.fn().mockResolvedValue(true),
      setModerationStatus: vi.fn().mockResolvedValue(true),
    };

    service = new CommentService(
      mockDb as any,
      lock,
      mockTokenManager as any,
      mockDataApiClient as any
    );
  });

  // =========================================================================
  // Validation
  // =========================================================================
  describe("Validation", () => {
    it("validates comment text", () => {
      expect(validateCommentText("").valid).toBe(false);
      expect(validateCommentText("   ").valid).toBe(false);
      expect(validateCommentText(undefined).valid).toBe(false);
      expect(validateCommentText("a".repeat(10001)).valid).toBe(false);
      expect(validateCommentText("Valid comment text").valid).toBe(true);
    });
  });

  // =========================================================================
  // Authorization & RBAC
  // =========================================================================
  describe("Authorization & RBAC", () => {
    it("denies VIEWER from posting comments (requires content:edit)", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValueOnce({ role: "VIEWER" });

      await expect(
        service.createComment(
          { actorUserId: validUserId, workspaceId: validWorkspaceId },
          validAccountId,
          validVideoId,
          { text: "Unauthorized comment" }
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: "SOCIAL_AUTH_REQUIRED",
        })
      );
    });

    it("denies EDITOR from moderating comments (strictly requires content:moderate)", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValueOnce({ role: "EDITOR" });

      await expect(
        service.moderateComment(
          { actorUserId: validUserId, workspaceId: validWorkspaceId },
          validAccountId,
          "comment-top-111",
          "REJECT"
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: "SOCIAL_AUTH_REQUIRED",
        })
      );
    });

    it("allows ADMIN to moderate comments (has content:moderate)", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValueOnce({ role: "ADMIN" });

      const result = await service.moderateComment(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "comment-top-111",
        "HOLD"
      );

      expect(result.success).toBe(true);
      expect(mockDataApiClient.setModerationStatus).toHaveBeenCalledWith(
        "mock-access-token",
        ["comment-top-111"],
        "heldForReview",
        false
      );
    });

    it("allows OWNER to moderate comments (has content:moderate)", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValueOnce({ role: "OWNER" });

      const result = await service.moderateComment(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "comment-top-111",
        "PUBLISH"
      );

      expect(result.success).toBe(true);
      expect(mockDataApiClient.setModerationStatus).toHaveBeenCalledWith(
        "mock-access-token",
        ["comment-top-111"],
        "published",
        false
      );
    });
  });

  // =========================================================================
  // Comment Lifecycle Operations
  // =========================================================================
  describe("Comment Lifecycle Operations", () => {
    it("lists comment threads for a video", async () => {
      const result = await service.listCommentThreads(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        validVideoId
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("thread-top-111");
      expect(result.items[0].topLevelComment.textOriginal).toBe("Great video tutorial!");
      expect(result.items[0].replies).toHaveLength(1);
      expect(result.nextPageToken).toBe("next-comments-token");
    });

    it("lists replies for a parent comment using comments.list(parentId)", async () => {
      const result = await service.listReplies(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "comment-top-111"
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("comment-reply-222");
      expect(result.items[0].parentId).toBe("comment-top-111");
      expect(mockDataApiClient.listComments).toHaveBeenCalledWith(
        "mock-access-token",
        "comment-top-111",
        undefined
      );
    });

    it("creates top-level comment via commentThreads.insert and logs audit event", async () => {
      const thread = await service.createComment(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        validVideoId,
        { text: "Awesome content!" }
      );

      expect(thread.id).toBe("thread-top-111");
      expect(mockDataApiClient.insertCommentThread).toHaveBeenCalledWith("mock-access-token", {
        snippet: {
          videoId: validVideoId,
          topLevelComment: {
            snippet: {
              textOriginal: "Awesome content!",
            },
          },
        },
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COMMENT_CREATED",
          resource: "comment",
          resourceId: "thread-top-111",
          details: expect.objectContaining({
            videoId: validVideoId,
            quotaUnitsEstimated: 50,
          }),
        })
      );
    });

    it("creates reply to existing comment via comments.insert and logs audit event", async () => {
      const reply = await service.replyToComment(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "comment-top-111",
        { text: "Glad to help!" }
      );

      expect(reply.id).toBe("comment-reply-222");
      expect(mockDataApiClient.insertComment).toHaveBeenCalledWith("mock-access-token", {
        snippet: {
          parentId: "comment-top-111",
          textOriginal: "Glad to help!",
        },
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COMMENT_REPLIED",
          resource: "comment",
          resourceId: "comment-reply-222",
        })
      );
    });

    it("edits an existing comment via comments.update and logs audit event", async () => {
      const updated = await service.editComment(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "comment-top-111",
        { text: "Updated comment text!" }
      );

      expect(updated.textOriginal).toBe("Updated comment text!");
      expect(mockDataApiClient.updateComment).toHaveBeenCalledWith("mock-access-token", {
        id: "comment-top-111",
        snippet: {
          textOriginal: "Updated comment text!",
        },
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COMMENT_UPDATED",
          resourceId: "comment-top-111",
        })
      );
    });

    it("deletes an existing comment via comments.delete and logs audit event", async () => {
      const result = await service.deleteComment(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "comment-top-111"
      );

      expect(result.success).toBe(true);
      expect(mockDataApiClient.deleteComment).toHaveBeenCalledWith(
        "mock-access-token",
        "comment-top-111"
      );

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COMMENT_DELETED",
          resourceId: "comment-top-111",
        })
      );
    });
  });

  // =========================================================================
  // Concurrency & Comment Mutation Locking (Decision 4)
  // =========================================================================
  describe("Concurrency & Comment Mutation Locking", () => {
    it("Decision 4: enforces comment-mutation lock key for mutations against an existing comment", async () => {
      const lockKey = `comment-mutation:${validAccountId}:comment-top-111`;
      // Pre-acquire lock
      const token = await lock.acquire(lockKey, { ttlMs: 30000 });
      expect(token).toBeTruthy();

      await expect(
        service.editComment(
          { actorUserId: validUserId, workspaceId: validWorkspaceId },
          validAccountId,
          "comment-top-111",
          { text: "Contended edit" }
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_REFRESH_LOCKED",
          statusCode: 409,
        })
      );

      await expect(
        service.deleteComment(
          { actorUserId: validUserId, workspaceId: validWorkspaceId },
          validAccountId,
          "comment-top-111"
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_REFRESH_LOCKED",
          statusCode: 409,
        })
      );

      // Release lock and verify edit succeeds
      await lock.release(lockKey, token as string);
      const edited = await service.editComment(
        { actorUserId: validUserId, workspaceId: validWorkspaceId },
        validAccountId,
        "comment-top-111",
        { text: "Updated comment text!" }
      );
      expect(edited.id).toBe("comment-top-111");
    });

    it("enforces comment-create lock key for top-level comments on video", async () => {
      const lockKey = `comment-create:${validAccountId}:${validVideoId}`;
      const token = await lock.acquire(lockKey, { ttlMs: 30000 });
      expect(token).toBeTruthy();

      await expect(
        service.createComment(
          { actorUserId: validUserId, workspaceId: validWorkspaceId },
          validAccountId,
          validVideoId,
          { text: "Contended create" }
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_REFRESH_LOCKED",
          statusCode: 409,
        })
      );

      await lock.release(lockKey, token as string);
    });
  });
});
