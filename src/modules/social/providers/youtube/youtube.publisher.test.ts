import { describe, it, expect, vi, beforeEach } from "vitest";
import { YouTubePublisher } from "./youtube.publisher";
import { SocialError } from "@/modules/social/errors";
import { PublishingSession } from "../publisher.types";

describe("Phase 3.4F: YouTubePublisher Unit Tests", () => {
  let publisher: YouTubePublisher;
  const mockSession: PublishingSession = {
    provider: "YOUTUBE",
    sessionUrl: "https://mock-upload-url",
    bytesUploaded: 0,
    totalBytes: 16 * 1024 * 1024,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    publisher = new YouTubePublisher();
  });

  describe("Category 8: Upload Session Creation", () => {
    it("creates resumable upload session with correct headers and uploadType=resumable", async () => {
      const mockLocation = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=resumable_session_abc123";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          Location: mockLocation,
        }),
      } as any);

      const session = await publisher.initPublishingSession(
        "sa_1",
        {
          title: "Test Video",
          description: "Test Description",
          tags: ["test", "plotters"],
          privacyStatus: "PRIVATE",
          scheduledAtUtc: new Date("2026-10-15T12:00:00.000Z"),
          madeForKids: false,
          mediaKey: "staging/video.mp4",
        },
        {
          storageKey: "staging/video.mp4",
          mimeType: "video/mp4",
          fileSizeBytes: 16 * 1024 * 1024,
          expiresAt: new Date(Date.now() + 3600000),
        },
        "mock_access_token"
      );

      expect(session.sessionUrl).toBe(mockLocation);
      expect(session.bytesUploaded).toBe(0);
      expect(session.totalBytes).toBe(16 * 1024 * 1024);

      // Verify request arguments
      const [calledUrl, calledInit] = (global.fetch as any).mock.calls[0];
      expect(calledUrl).toContain("uploadType=resumable");
      expect(calledInit.headers["X-Upload-Content-Type"]).toBe("video/mp4");
      expect(calledInit.headers["X-Upload-Content-Length"]).toBe(String(16 * 1024 * 1024));
      expect(calledInit.headers["Authorization"]).toBe("Bearer mock_access_token");

      // Verify request body includes status.publishAt
      const parsedBody = JSON.parse(calledInit.body);
      expect(parsedBody.snippet.title).toBe("Test Video");
      expect(parsedBody.status.privacyStatus).toBe("private");
      expect(parsedBody.status.publishAt).toBe("2026-10-15T12:00:00.000Z");
    });
  });

  describe("Category 9, 10, 11: Chunk Progress, 308 Handling, and Resuming", () => {
    it("enforces 256 KiB alignment constraint on non-final chunks", async () => {
      const invalidChunk = Buffer.alloc(300 * 1024); // Not a multiple of 256 KiB
      await expect(
        publisher.uploadNextChunk(
          mockSession,
          invalidChunk,
          { start: 0, end: 300 * 1024 - 1, total: 10 * 1024 * 1024 }, // total > chunk size => non-final
          "mock_token"
        )
      ).rejects.toThrow(/must be an exact multiple of 256 KiB/);
    });

    it("processes HTTP 308 Resume Incomplete and updates progress byte offset", async () => {
      const chunk = Buffer.alloc(8 * 1024 * 1024); // 8 MiB (32 * 256 KiB)
      global.fetch = vi.fn().mockResolvedValue({
        status: 308,
        headers: new Headers({
          Range: "bytes=0-8388607",
        }),
      } as any);

      const result = await publisher.uploadNextChunk(
        mockSession,
        chunk,
        { start: 0, end: 8 * 1024 * 1024 - 1, total: 16 * 1024 * 1024 },
        "mock_token"
      );

      expect(result.completed).toBe(false);
      expect(result.bytesUploaded).toBe(8388608); // 8 MiB uploaded
      expect(result.externalContentId).toBeUndefined();
    });

    it("detects upload completion on HTTP 200/201 and extracts canonical external video ID", async () => {
      const finalChunk = Buffer.alloc(1024);
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        json: async () => ({
          id: "youtube_video_xyz987",
          snippet: { title: "Complete Video" },
        }),
      } as any);

      const result = await publisher.uploadNextChunk(
        mockSession,
        finalChunk,
        { start: 8388608, end: 8388608 + 1023, total: 8388608 + 1024 }, // isFinalChunk = true
        "mock_token"
      );

      expect(result.completed).toBe(true);
      expect(result.externalContentId).toBe("youtube_video_xyz987");
      expect(result.bytesUploaded).toBe(8388608 + 1024);
    });
  });

  describe("Category 12-17: Error Classification & Retry Matrix", () => {
    it("Category 12: handles timeout / AbortError gracefully", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const chunk = Buffer.alloc(256 * 1024);
      await expect(
        publisher.uploadNextChunk(
          mockSession,
          chunk,
          { start: 0, end: 256 * 1024 - 1, total: 1024 * 1024 },
          "mock_token"
        )
      ).rejects.toThrow(/timed out/);
    });

    it("Category 13: handles connection reset (ECONNRESET)", async () => {
      const connError = new Error("read ECONNRESET");
      global.fetch = vi.fn().mockRejectedValue(connError);

      const chunk = Buffer.alloc(256 * 1024);
      await expect(
        publisher.uploadNextChunk(
          mockSession,
          chunk,
          { start: 0, end: 256 * 1024 - 1, total: 1024 * 1024 },
          "mock_token"
        )
      ).rejects.toThrow(/Connection reset/);
    });

    it("Category 14: classifies HTTP 429 as RATE_LIMIT_EXCEEDED", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 429,
        text: async () => "Too Many Requests",
      } as any);

      const chunk = Buffer.alloc(256 * 1024);
      try {
        await publisher.uploadNextChunk(
          mockSession,
          chunk,
          { start: 0, end: 256 * 1024 - 1, total: 1024 * 1024 },
          "mock_token"
        );
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(SocialError);
        expect(err.code).toBe("UPLOAD_RATE_LIMIT_EXCEEDED");
      }
    });

    it("Category 15: classifies HTTP 500/503 as transient SERVER_ERROR", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 503,
        text: async () => "Service Unavailable",
      } as any);

      const chunk = Buffer.alloc(256 * 1024);
      try {
        await publisher.uploadNextChunk(
          mockSession,
          chunk,
          { start: 0, end: 256 * 1024 - 1, total: 1024 * 1024 },
          "mock_token"
        );
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(SocialError);
        expect(err.code).toBe("SOCIAL_API_ERROR");
        expect(err.statusCode).toBe(503);
      }
    });

    it("Category 16: classifies HTTP 401 as AUTH_REQUIRED", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 401,
        text: async () => "Invalid Credentials",
      } as any);

      const chunk = Buffer.alloc(256 * 1024);
      try {
        await publisher.uploadNextChunk(
          mockSession,
          chunk,
          { start: 0, end: 256 * 1024 - 1, total: 1024 * 1024 },
          "mock_token"
        );
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(SocialError);
        expect(err.code).toBe("SOCIAL_AUTH_REQUIRED");
      }
    });

    it("Category 17: classifies HTTP 403 quotaExceeded as SOCIAL_RATE_LIMIT_EXCEEDED", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 403,
        text: async () => JSON.stringify({
          error: {
            errors: [{ reason: "quotaExceeded", message: "The request cannot be completed because you have exceeded your quota." }],
          },
        }),
      } as any);

      const chunk = Buffer.alloc(256 * 1024);
      try {
        await publisher.uploadNextChunk(
          mockSession,
          chunk,
          { start: 0, end: 256 * 1024 - 1, total: 1024 * 1024 },
          "mock_token"
        );
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(SocialError);
        expect(err.code).toBe("QUOTA_EXCEEDED");
      }
    });
  });

  describe("Category 27: Thumbnail Lifecycle (thumbnails.set)", () => {
    it("rejects unsupported MIME types (e.g. image/webp)", async () => {
      const buffer = Buffer.alloc(100);
      await expect(
        publisher.uploadThumbnail("video_123", buffer, "image/webp", "mock_token")
      ).rejects.toThrow(/Unsupported thumbnail MIME type/);
    });

    it("rejects thumbnails exceeding 2MB size limit", async () => {
      const oversized = Buffer.alloc(3 * 1024 * 1024);
      await expect(
        publisher.uploadThumbnail("video_123", oversized, "image/jpeg", "mock_token")
      ).rejects.toThrow(/exceeds YouTube 2MB limit/);
    });

    it("successfully uploads valid JPEG thumbnail", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ default: { url: "https://i.ytimg.com/vi/video_123/default.jpg" } }],
        }),
      } as any);

      const validThumb = Buffer.alloc(500 * 1024);
      await expect(
        publisher.uploadThumbnail("video_123", validThumb, "image/jpeg", "mock_token")
      ).resolves.not.toThrow();

      const [calledUrl, calledInit] = (global.fetch as any).mock.calls[0];
      expect(calledUrl).toContain("thumbnails/set?videoId=video_123");
      expect(calledInit.headers["Content-Type"]).toBe("image/jpeg");
    });
  });
});
