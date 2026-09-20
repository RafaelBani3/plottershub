import { describe, it, expect } from "vitest";
import {
  PublishingStatus,
  transitionPublishingJob,
  validatePublishVideoInput,
  PublishVideoInput,
  YOUTUBE_CHUNK_UNIT_BYTES,
  DEFAULT_UPLOAD_CHUNK_BYTES,
} from "./publishing.types";

describe("Phase 3.4F: Publishing State Machine & Input Validation", () => {
  describe("Category 1 & 2: State Transitions & Invalid Transitions", () => {
    it("allows valid transitions through the complete immediate publishing lifecycle", () => {
      expect(() => transitionPublishingJob(PublishingStatus.DRAFT, PublishingStatus.QUEUED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.QUEUED, PublishingStatus.UPLOADING)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.UPLOADING, PublishingStatus.UPLOADED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.UPLOADED, PublishingStatus.PROCESSING)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.PROCESSING, PublishingStatus.PUBLISHING)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.PUBLISHING, PublishingStatus.PUBLISHED)).not.toThrow();
    });

    it("allows valid transitions for scheduled publishing", () => {
      expect(() => transitionPublishingJob(PublishingStatus.UPLOADED, PublishingStatus.SCHEDULED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.PROCESSING, PublishingStatus.SCHEDULED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.SCHEDULED, PublishingStatus.PUBLISHING)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.SCHEDULED, PublishingStatus.CANCELLED)).not.toThrow();
    });

    it("allows transitions into RECONCILING from in-flight states upon ambiguous outcome", () => {
      expect(() => transitionPublishingJob(PublishingStatus.UPLOADING, PublishingStatus.RECONCILING)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.PUBLISHING, PublishingStatus.RECONCILING)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.RECONCILING, PublishingStatus.PUBLISHED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.RECONCILING, PublishingStatus.FAILED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.RECONCILING, PublishingStatus.UPLOADING)).not.toThrow();
    });

    it("allows transitions into FAILED from active states", () => {
      expect(() => transitionPublishingJob(PublishingStatus.QUEUED, PublishingStatus.FAILED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.UPLOADING, PublishingStatus.FAILED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.PUBLISHING, PublishingStatus.FAILED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.FAILED, PublishingStatus.QUEUED)).not.toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.FAILED, PublishingStatus.UPLOADING)).not.toThrow();
    });

    it("rejects invalid transitions: jumping directly from DRAFT to PUBLISHED", () => {
      expect(() => transitionPublishingJob(PublishingStatus.DRAFT, PublishingStatus.PUBLISHED)).toThrow(
        /Invalid publishing job.*transition/
      );
    });

    it("rejects invalid transitions: modifying a PUBLISHED job", () => {
      expect(() => transitionPublishingJob(PublishingStatus.PUBLISHED, PublishingStatus.UPLOADING)).toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.PUBLISHED, PublishingStatus.FAILED)).toThrow();
      expect(() => transitionPublishingJob(PublishingStatus.PUBLISHED, PublishingStatus.CANCELLED)).toThrow();
    });

    it("rejects invalid transitions: resuming a CANCELLED job into UPLOADING", () => {
      expect(() => transitionPublishingJob(PublishingStatus.CANCELLED, PublishingStatus.UPLOADING)).toThrow();
    });
  });

  describe("Category 24, 25, 26, 32: Scheduling & Input Validation", () => {
    const baseInput: PublishVideoInput = {
      workspaceId: "ws_123",
      contentId: "content_456",
      socialAccountId: "sa_789",
      videoStorageKey: "staging/ws_123/video.mp4",
      title: "Valid Plotters Demonstration",
    };

    it("validates successful minimal input", () => {
      const res = validatePublishVideoInput(baseInput);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("rejects input with empty title", () => {
      const res = validatePublishVideoInput({ ...baseInput, title: "   " });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Video title must not be empty if provided");
    });

    it("rejects input with title exceeding YouTube limit of 100 characters", () => {
      const longTitle = "A".repeat(101);
      const res = validatePublishVideoInput({ ...baseInput, title: longTitle });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Video title exceeds 100 characters maximum limit");
    });

    it("rejects input with description exceeding 5000 characters", () => {
      const longDesc = "D".repeat(5001);
      const res = validatePublishVideoInput({ ...baseInput, description: longDesc });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Video description exceeds 5,000 characters limit");
    });

    it("rejects input with combined tags length exceeding 500 characters", () => {
      const tags = ["tag1", "B".repeat(501)];
      const res = validatePublishVideoInput({ ...baseInput, tags });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Combined tags length exceeds 500 characters limit");
    });

    it("Category 24: validates future schedule dates", () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = validatePublishVideoInput({
        ...baseInput,
        publishAt: futureDate,
        privacyStatus: "private",
      });
      expect(res.valid).toBe(true);
    });

    it("Category 24: rejects past schedule dates", () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const res = validatePublishVideoInput({
        ...baseInput,
        publishAt: pastDate,
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Scheduled publishAt timestamp must be in the future");
    });

    it("Category 26: enforces privacyStatus=private when publishAt is specified", () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = validatePublishVideoInput({
        ...baseInput,
        publishAt: futureDate,
        privacyStatus: "public", // Violation: YouTube requires private for scheduled videos
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain(
        "YouTube scheduled publishing requires privacyStatus to be 'private' until release"
      );
    });
  });

  describe("Plottershub Chunk Policy Constants", () => {
    it("ensures default chunk size is 8 MiB", () => {
      expect(DEFAULT_UPLOAD_CHUNK_BYTES).toBe(8 * 1024 * 1024);
    });

    it("ensures YouTube chunk unit is 256 KiB", () => {
      expect(YOUTUBE_CHUNK_UNIT_BYTES).toBe(256 * 1024);
    });

    it("verifies 8 MiB is an exact multiple of 256 KiB", () => {
      expect(DEFAULT_UPLOAD_CHUNK_BYTES % YOUTUBE_CHUNK_UNIT_BYTES).toBe(0);
      expect(DEFAULT_UPLOAD_CHUNK_BYTES / YOUTUBE_CHUNK_UNIT_BYTES).toBe(32);
    });
  });
});
