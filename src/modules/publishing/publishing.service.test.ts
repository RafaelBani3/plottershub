import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublishingService } from "./publishing.service";
import { PublishingStatus } from "./publishing.types";
import { InMemoryMediaStorage } from "../storage/media-storage";
import { SocialPublisher, PublishingSession, ChunkUploadResult, SessionStatusResult } from "../social/providers/publisher.types";
import { SocialError } from "../social/errors";
import { prisma } from "@/lib/db/prisma";

// Mock audit service to prevent Postgres FK violations in unit tests
vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn().mockResolvedValue({}),
}));

// Mock lock recording order of calls
class MockOrderTrackingLock {
  public acquiredLocks: string[] = [];
  public releasedLocks: string[] = [];
  public simulateContention = false;

  async acquire(key: string, _options?: any): Promise<string | null> {
    if (this.simulateContention) {
      return null;
    }
    this.acquiredLocks.push(key);
    return "token_" + key;
  }

  async release(key: string, _token?: string): Promise<boolean> {
    this.releasedLocks.push(key);
    return true;
  }

  async extend(): Promise<boolean> {
    return true;
  }

  async isLocked(): Promise<boolean> {
    return false;
  }

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const token = await this.acquire(key);
    if (!token) throw new Error("Lock contention");
    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }
}

// Mock SocialPublisher
class MockPublisher implements SocialPublisher {
  readonly platformCode = "YOUTUBE";
  public initSessionMock = vi.fn();
  public uploadChunkMock = vi.fn();
  public checkSessionMock = vi.fn();
  public uploadThumbnailMock = vi.fn();
  public reconcileRecentUploadMock = vi.fn();

  async initPublishingSession(socialAccountId: string, payload: any, mediaInfo: any, accessToken: string): Promise<PublishingSession> {
    return this.initSessionMock(socialAccountId, payload, mediaInfo, accessToken);
  }

  async uploadNextChunk(
    session: any,
    chunkBuffer: Buffer,
    range: any,
    accessToken: string
  ): Promise<ChunkUploadResult> {
    return this.uploadChunkMock(session, chunkBuffer, range, accessToken);
  }

  async checkSessionStatus(session: any, totalBytes: number, accessToken: string): Promise<SessionStatusResult> {
    return this.checkSessionMock(session, totalBytes, accessToken);
  }

  async uploadThumbnail(externalVideoId: string, imageBuffer: Buffer, mimeType: string, accessToken: string): Promise<void> {
    return this.uploadThumbnailMock(externalVideoId, imageBuffer, mimeType, accessToken);
  }

  async reconcileRecentUpload(socialAccountId: string, payload: any, windowMinutes: number, accessToken: string): Promise<any> {
    return this.reconcileRecentUploadMock(socialAccountId, payload, windowMinutes, accessToken);
  }
}

// Mock TokenManager
class MockTokenManager {
  public validToken = "mock_youtube_token_xyz";
  public throwOnGet = false;

  async getValidAccessToken(_socialAccountId: string): Promise<string> {
    if (this.throwOnGet) {
      throw new SocialError("Token expired and refresh failed", "SOCIAL_AUTH_REQUIRED", { statusCode: 401 });
    }
    return this.validToken;
  }
}

describe("Phase 3.4F: PublishingService Comprehensive Test Suite", () => {
  let lock: MockOrderTrackingLock;
  let publisher: MockPublisher;
  let storage: InMemoryMediaStorage;
  let tokenManager: MockTokenManager;
  let service: PublishingService;

  beforeEach(async () => {
    vi.restoreAllMocks();
    lock = new MockOrderTrackingLock();
    publisher = new MockPublisher();
    storage = new InMemoryMediaStorage();
    tokenManager = new MockTokenManager();

    service = new PublishingService({
      lock: lock as any,
      publisher,
      storage,
      tokenManager: tokenManager as any,
    });

    // Seed mock staged video
    await storage.saveStagedMedia("staging/ws_test/sample_video.mp4", Buffer.alloc(1024 * 1024), {
      mimeType: "video/mp4",
      expiresAt: new Date(Date.now() + 3600000),
    });

    vi.spyOn(prisma.content, "update").mockResolvedValue({} as any);
  });

  describe("Category 3, 4, 5, 7: RBAC, Isolation, Account Ownership & Scope", () => {
    it("Category 3: rejects publishing when user role is VIEWER or ANALYST", async () => {
      vi.spyOn(prisma.workspaceMember, "findUnique").mockResolvedValue({
        id: "mem_1",
        workspaceId: "ws_test",
        userId: "user_viewer",
        role: "VIEWER",
      } as any);

      await expect(
        service.createAndStartPublishingJob(
          {
            workspaceId: "ws_test",
            contentId: "content_1",
            socialAccountId: "sa_1",
            videoStorageKey: "staging/ws_test/sample_video.mp4",
          },
          "user_viewer"
        )
      ).rejects.toThrow(/does not have content:publish permission/);
    });

    it("Category 4: rejects publishing when content is not found in specified workspace", async () => {
      vi.spyOn(prisma.workspaceMember, "findUnique").mockResolvedValue({
        id: "mem_admin",
        workspaceId: "ws_test",
        userId: "user_admin",
        role: "ADMIN",
      } as any);

      vi.spyOn(prisma.content, "findFirst").mockResolvedValue(null); // Not found

      await expect(
        service.createAndStartPublishingJob(
          {
            workspaceId: "ws_test",
            contentId: "content_other_ws",
            socialAccountId: "sa_1",
            videoStorageKey: "staging/ws_test/sample_video.mp4",
          },
          "user_admin"
        )
      ).rejects.toThrow(/Content not found in this workspace/);
    });

    it("Category 5: rejects publishing when social account does not belong to workspace", async () => {
      vi.spyOn(prisma.workspaceMember, "findUnique").mockResolvedValue({
        id: "mem_admin",
        workspaceId: "ws_test",
        userId: "user_admin",
        role: "ADMIN",
      } as any);

      vi.spyOn(prisma.content, "findFirst").mockResolvedValue({
        id: "content_1",
        workspaceId: "ws_test",
      } as any);

      vi.spyOn(prisma.socialAccount, "findFirst").mockResolvedValue(null); // Not found

      await expect(
        service.createAndStartPublishingJob(
          {
            workspaceId: "ws_test",
            contentId: "content_1",
            socialAccountId: "sa_unowned",
            videoStorageKey: "staging/ws_test/sample_video.mp4",
          },
          "user_admin"
        )
      ).rejects.toThrow(/Social account not found in this workspace/);
    });

    it("Category 7: rejects publishing if social account lacks YouTube upload OAuth scope", async () => {
      vi.spyOn(prisma.workspaceMember, "findUnique").mockResolvedValue({
        id: "mem_admin",
        workspaceId: "ws_test",
        userId: "user_admin",
        role: "ADMIN",
      } as any);

      vi.spyOn(prisma.content, "findFirst").mockResolvedValue({
        id: "content_1",
        workspaceId: "ws_test",
      } as any);

      vi.spyOn(prisma.socialAccount, "findFirst").mockResolvedValue({
        id: "sa_1",
        workspaceId: "ws_test",
        provider: "YOUTUBE",
        token: {
          scopes: ["https://www.googleapis.com/auth/youtube.readonly"], // Only read scope!
        },
      } as any);

      await expect(
        service.createAndStartPublishingJob(
          {
            workspaceId: "ws_test",
            contentId: "content_1",
            socialAccountId: "sa_1",
            videoStorageKey: "staging/ws_test/sample_video.mp4",
          },
          "user_admin"
        )
      ).rejects.toThrow(/lacks YouTube video upload OAuth scope/);
    });
  });

  describe("Category 20, 21, 22, 23: Idempotency, Locking & Concurrency", () => {
    it("Category 20: safely returns existing job if idempotency key matches", async () => {
      vi.spyOn(prisma.workspaceMember, "findUnique").mockResolvedValue({
        role: "EDITOR",
      } as any);

      vi.spyOn(prisma.content, "findFirst").mockResolvedValue({
        id: "content_1",
        workspaceId: "ws_test",
      } as any);

      vi.spyOn(prisma.socialAccount, "findFirst").mockResolvedValue({
        id: "sa_1",
        token: { scopes: ["https://www.googleapis.com/auth/youtube.upload"] },
      } as any);

      vi.spyOn(prisma.contentPlatform, "findUnique").mockResolvedValue({
        id: "cp_1",
        contentId: "content_1",
        socialAccountId: "sa_1",
      } as any);

      const existingJob = {
        id: "job_existing_123",
        contentPlatformId: "cp_1",
        idempotencyKey: "idem_abc",
        publishingStatus: PublishingStatus.UPLOADING,
        bytesUploaded: BigInt(512 * 1024),
        totalBytes: BigInt(1024 * 1024),
        thumbnailStatus: null,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        metadata: null,
        createdAt: new Date(),
      };

      vi.spyOn(prisma.publishingJob, "findFirst").mockResolvedValue(existingJob as any);
      vi.spyOn(prisma.publishingJob, "findUnique").mockResolvedValue(existingJob as any);

      const job = await service.createAndStartPublishingJob(
        {
          workspaceId: "ws_test",
          contentId: "content_1",
          socialAccountId: "sa_1",
          videoStorageKey: "staging/ws_test/sample_video.mp4",
          idempotencyKey: "idem_abc",
        },
        "user_editor"
      );

      expect(job.id).toBe("job_existing_123");
      expect(job.idempotencyKey).toBe("idem_abc");
      // Publisher should NOT have been invoked again
      expect(publisher.initSessionMock).not.toHaveBeenCalled();
    });

    it("Category 23: enforces strict Lock Acquisition Order: publishing-job first, then content-publish, and LIFO release", async () => {
      vi.spyOn(prisma.workspaceMember, "findUnique").mockResolvedValue({ role: "ADMIN" } as any);
      vi.spyOn(prisma.content, "findFirst").mockResolvedValue({ id: "c1", workspaceId: "ws_1" } as any);
      vi.spyOn(prisma.socialAccount, "findFirst").mockResolvedValue({
        id: "sa_1",
        token: { scopes: ["https://www.googleapis.com/auth/youtube.upload"] },
      } as any);
      vi.spyOn(prisma.contentPlatform, "findUnique").mockResolvedValue({
        id: "cp_1",
        contentId: "c1",
        socialAccountId: "sa_1",
      } as any);
      vi.spyOn(prisma.publishingJob, "findFirst").mockResolvedValue(null);

      const createdJob = {
        id: "job_order_test_456",
        contentPlatformId: "cp_1",
        idempotencyKey: "key_order",
        publishingStatus: PublishingStatus.QUEUED,
        bytesUploaded: BigInt(0),
        totalBytes: BigInt(1024 * 1024),
        storageKey: "staging/ws_test/sample_video.mp4",
        thumbnailStatus: null,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        metadata: { title: "Order Test Video" },
        createdAt: new Date(),
      };

      vi.spyOn(prisma.publishingJob, "create").mockResolvedValue(createdJob as any);
      vi.spyOn(prisma.publishingJob, "findUnique").mockResolvedValue({
        ...createdJob,
        contentPlatform: { id: "cp_1", contentId: "c1", socialAccountId: "sa_1", externalContentId: "yt_123" },
      } as any);
      vi.spyOn(prisma.publishingJob, "update").mockResolvedValue(createdJob as any);
      vi.spyOn(prisma.contentPlatform, "update").mockResolvedValue({} as any);

      publisher.initSessionMock.mockResolvedValue({
        sessionUrl: "https://upload.youtube.com/session/order",
        bytesUploaded: 0,
        totalBytes: 1024 * 1024,
      });

      publisher.uploadChunkMock.mockResolvedValue({
        bytesUploaded: 1024 * 1024,
        completed: true,
        externalContentId: "yt_order_123",
      });

      await service.createAndStartPublishingJob(
        {
          workspaceId: "ws_1",
          contentId: "c1",
          socialAccountId: "sa_1",
          videoStorageKey: "staging/ws_test/sample_video.mp4",
          idempotencyKey: "key_order",
        },
        "user_admin"
      );

      // Verify Lock Acquisition Order:
      // 1st: publishing-job:job_order_test_456
      // 2nd: content-publish:sa_1:cp_1
      expect(lock.acquiredLocks[0]).toBe("publishing-job:job_order_test_456");
      expect(lock.acquiredLocks[1]).toBe("content-publish:sa_1:cp_1");

      // Verify LIFO Release Order:
      // 1st released: content-publish:sa_1:cp_1
      // 2nd released: publishing-job:job_order_test_456
      expect(lock.releasedLocks[0]).toBe("content-publish:sa_1:cp_1");
      expect(lock.releasedLocks[1]).toBe("publishing-job:job_order_test_456");
    });

    it("Category 22: handles lock contention gracefully when another worker holds the job lock", async () => {
      vi.spyOn(prisma.workspaceMember, "findUnique").mockResolvedValue({ role: "ADMIN" } as any);
      vi.spyOn(prisma.content, "findFirst").mockResolvedValue({ id: "c1", workspaceId: "ws_1" } as any);
      vi.spyOn(prisma.socialAccount, "findFirst").mockResolvedValue({
        id: "sa_1",
        token: { scopes: ["https://www.googleapis.com/auth/youtube.upload"] },
      } as any);
      vi.spyOn(prisma.contentPlatform, "findUnique").mockResolvedValue({
        id: "cp_1",
        contentId: "c1",
        socialAccountId: "sa_1",
      } as any);
      vi.spyOn(prisma.publishingJob, "findFirst").mockResolvedValue(null);

      const createdJob = {
        id: "job_contention_789",
        contentPlatformId: "cp_1",
        idempotencyKey: "key_contention",
        publishingStatus: PublishingStatus.QUEUED,
        bytesUploaded: BigInt(0),
        totalBytes: BigInt(1024 * 1024),
        thumbnailStatus: null,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        metadata: null,
        createdAt: new Date(),
        contentPlatform: {
          id: "cp_1",
          contentId: "c1",
          socialAccountId: "sa_1",
        },
      };

      vi.spyOn(prisma.publishingJob, "create").mockResolvedValue(createdJob as any);
      vi.spyOn(prisma.publishingJob, "findUnique").mockResolvedValue(createdJob as any);

      // Simulate lock contention
      lock.simulateContention = true;

      const jobResult = await service.createAndStartPublishingJob(
        {
          workspaceId: "ws_1",
          contentId: "c1",
          socialAccountId: "sa_1",
          videoStorageKey: "staging/ws_test/sample_video.mp4",
          idempotencyKey: "key_contention",
        },
        "user_admin"
      );

      // Job is created and queued, but pipeline execution yields without crashing
      expect(jobResult.publishingStatus).toBe(PublishingStatus.QUEUED);
      expect(publisher.initSessionMock).not.toHaveBeenCalled();
    });
  });

  describe("Category 28, 33, 34: Thumbnail Failure Isolation & Canonical ID", () => {
    it("Category 28: thumbnail failure does NOT fail the video; video is PUBLISHED while thumbnail is FAILED", async () => {
      vi.spyOn(prisma.workspaceMember, "findUnique").mockResolvedValue({ role: "ADMIN" } as any);
      vi.spyOn(prisma.content, "findFirst").mockResolvedValue({ id: "c1", workspaceId: "ws_1" } as any);
      vi.spyOn(prisma.socialAccount, "findFirst").mockResolvedValue({
        id: "sa_1",
        token: { scopes: ["https://www.googleapis.com/auth/youtube.upload"] },
      } as any);
      vi.spyOn(prisma.contentPlatform, "findUnique").mockResolvedValue({
        id: "cp_1",
        contentId: "c1",
        socialAccountId: "sa_1",
      } as any);
      vi.spyOn(prisma.publishingJob, "findFirst").mockResolvedValue(null);

      // Stage thumbnail
      await storage.saveStagedMedia("staging/ws_1/thumb.jpg", Buffer.alloc(100), {
        mimeType: "image/jpeg",
        expiresAt: new Date(Date.now() + 3600000),
      });

      let updatedJobStatus: string = PublishingStatus.QUEUED;
      let updatedThumbnailStatus: string = "PENDING";
      let capturedExternalId: string | null = null;

      vi.spyOn(prisma.publishingJob, "create").mockResolvedValue({
        id: "job_thumb_iso",
        contentPlatformId: "cp_1",
        idempotencyKey: "thumb_iso_key",
        publishingStatus: PublishingStatus.QUEUED,
        bytesUploaded: BigInt(0),
        totalBytes: BigInt(1024 * 1024),
        storageKey: "staging/ws_test/sample_video.mp4",
        thumbnailStatus: "PENDING",
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        metadata: null,
        createdAt: new Date(),
      } as any);

      vi.spyOn(prisma.publishingJob, "findUnique").mockImplementation((() => ({
        id: "job_thumb_iso",
        contentPlatformId: "cp_1",
        idempotencyKey: "thumb_iso_key",
        publishingStatus: updatedJobStatus,
        storageKey: "staging/ws_test/sample_video.mp4",
        bytesUploaded: BigInt(0),
        totalBytes: BigInt(1024 * 1024),
        thumbnailStatus: updatedThumbnailStatus,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        metadata: { thumbnailStorageKey: "staging/ws_1/thumb.jpg" },
        createdAt: new Date(),
        contentPlatform: {
          id: "cp_1",
          contentId: "c1",
          socialAccountId: "sa_1",
          externalContentId: capturedExternalId,
          content: { workspaceId: "ws_1" },
        },
      })) as any);

      vi.spyOn(prisma.publishingJob, "update").mockImplementation(((args: any) => {
        if (args.data.publishingStatus) updatedJobStatus = args.data.publishingStatus;
        if (args.data.thumbnailStatus) updatedThumbnailStatus = args.data.thumbnailStatus;
        return {
          id: "job_thumb_iso",
          contentPlatformId: "cp_1",
          publishingStatus: updatedJobStatus,
          thumbnailStatus: updatedThumbnailStatus,
          bytesUploaded: BigInt(1024 * 1024),
          totalBytes: BigInt(1024 * 1024),
          createdAt: new Date(),
        };
      }) as any);

      vi.spyOn(prisma.contentPlatform, "update").mockImplementation(((args: any) => {
        if (args.data.externalContentId) capturedExternalId = args.data.externalContentId;
        return {};
      }) as any);

      publisher.initSessionMock.mockResolvedValue({
        sessionUrl: "https://upload.youtube.com/session/thumb_iso",
        bytesUploaded: 0,
        totalBytes: 1024 * 1024,
      });

      publisher.uploadChunkMock.mockResolvedValue({
        bytesUploaded: 1024 * 1024,
        completed: true,
        externalContentId: "yt_vid_success_999",
      });

      // Force thumbnail upload to fail
      publisher.uploadThumbnailMock.mockRejectedValue(new Error("Thumbnail quota exceeded or invalid dimensions"));

      const result = await service.createAndStartPublishingJob(
        {
          workspaceId: "ws_1",
          contentId: "c1",
          socialAccountId: "sa_1",
          videoStorageKey: "staging/ws_test/sample_video.mp4",
          thumbnailStorageKey: "staging/ws_1/thumb.jpg",
          idempotencyKey: "thumb_iso_key",
        },
        "user_admin"
      );

      // Category 33: External video ID set on ContentPlatform
      expect(capturedExternalId).toBe("yt_vid_success_999");

      // Category 28: Video reached PUBLISHED, but thumbnail marked FAILED
      expect(result.publishingStatus).toBe(PublishingStatus.PUBLISHED);
      expect(result.thumbnailStatus).toBe("FAILED");
    });
  });

  describe("Category 18 & 19: Unknown Outcome & Deterministic Reconciliation", () => {
    it("Category 19: recovers externalContentId when high confidence match is found on YouTube channel", async () => {
      let savedExternalId: string | null = null;
      let currentStatus: string = PublishingStatus.FAILED;

      vi.spyOn(prisma.publishingJob, "findUnique").mockImplementation((() => ({
        id: "job_reconcile_test",
        contentPlatformId: "cp_rec",
        publishingStatus: currentStatus,
        storageKey: "staging/ws_1/video.mp4",
        uploadSessionUrlEncrypted: null, // session URL expired
        bytesUploaded: BigInt(500),
        totalBytes: BigInt(1000),
        thumbnailStatus: null,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: null,
        errorCode: "UNKNOWN_PROVIDER_RESULT",
        errorMessage: "Connection dropped during final chunk",
        metadata: { requiresManualReview: true },
        createdAt: new Date(),
        contentPlatform: {
          id: "cp_rec",
          contentId: "content_rec",
          socialAccountId: "sa_rec",
          externalContentId: null,
          content: {
            id: "content_rec",
            title: "Generative AxiDraw Plot",
            description: "Detailed plotter description",
            workspaceId: "ws_1",
          },
          socialAccount: {
            id: "sa_rec",
            workspaceId: "ws_1",
            accountId: "channel_rec_123",
          },
        },
      })) as any);

      vi.spyOn(prisma.publishingJob, "update").mockImplementation(((args: any) => {
        if (args.data.publishingStatus) currentStatus = args.data.publishingStatus;
        return {
          id: "job_reconcile_test",
          publishingStatus: currentStatus,
          bytesUploaded: BigInt(1000),
          totalBytes: BigInt(1000),
          createdAt: new Date(),
        };
      }) as any);

      vi.spyOn(prisma.contentPlatform, "update").mockImplementation(((args: any) => {
        if (args.data.externalContentId) savedExternalId = args.data.externalContentId;
        return {};
      }) as any);

      // Mock high confidence recovery from channel uploads
      publisher.reconcileRecentUploadMock.mockResolvedValue({
        matched: true,
        externalContentId: "recovered_yt_video_888",
        confidence: "HIGH",
      });

      const reconciledJob = await service.reconcilePublishingJob(
        "job_reconcile_test",
        "user_admin",
        "ws_1"
      );

      expect(savedExternalId).toBe("recovered_yt_video_888");
      expect(reconciledJob.publishingStatus).toBe(PublishingStatus.PUBLISHED);
    });

    it("Category 18 & 19: flags requiresManualReview and remains FAILED when no high-confidence match is found", async () => {
      let currentStatus: string = PublishingStatus.FAILED;
      let savedMetadata: any = null;

      vi.spyOn(prisma.publishingJob, "findUnique").mockImplementation((() => ({
        id: "job_ambig_test",
        contentPlatformId: "cp_ambig",
        publishingStatus: currentStatus,
        storageKey: "staging/ws_1/video.mp4",
        uploadSessionUrlEncrypted: null,
        bytesUploaded: BigInt(500),
        totalBytes: BigInt(1000),
        thumbnailStatus: null,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: null,
        errorCode: "UNKNOWN_PROVIDER_RESULT",
        errorMessage: "Network drop",
        metadata: savedMetadata,
        createdAt: new Date(),
        contentPlatform: {
          id: "cp_ambig",
          contentId: "c_ambig",
          socialAccountId: "sa_ambig",
          externalContentId: null,
          content: {
            id: "c_ambig",
            title: "Ambiguous Video",
            description: "",
            workspaceId: "ws_1",
          },
          socialAccount: {
            id: "sa_ambig",
            workspaceId: "ws_1",
            accountId: "channel_ambig",
          },
        },
      })) as any);

      vi.spyOn(prisma.publishingJob, "update").mockImplementation(((args: any) => {
        if (args.data.publishingStatus) currentStatus = args.data.publishingStatus;
        if (args.data.metadata) savedMetadata = args.data.metadata;
        return {
          id: "job_ambig_test",
          publishingStatus: currentStatus,
          metadata: savedMetadata,
          bytesUploaded: BigInt(500),
          totalBytes: BigInt(1000),
          createdAt: new Date(),
        };
      }) as any);

      // No match found
      publisher.reconcileRecentUploadMock.mockResolvedValue({
        matched: false,
        confidence: "NONE",
      });

      const job = await service.reconcilePublishingJob(
        "job_ambig_test",
        "user_admin",
        "ws_1"
      );

      expect(job.publishingStatus).toBe(PublishingStatus.FAILED);
      expect(job.metadata?.requiresManualReview).toBe(true);
      expect(job.metadata?.failureCode).toBe("RECONCILIATION_UNCONFIRMED");
    });
  });
});
