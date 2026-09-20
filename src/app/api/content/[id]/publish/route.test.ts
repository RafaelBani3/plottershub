import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as publishRoute } from "./route";
import { POST as thumbnailRoute } from "../thumbnail/route";
import { requireAuth, requireWorkspacePermission } from "@/lib/auth/guard";
import { publishingService } from "@/modules/publishing/publishing.service";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guard")>();
  return {
    ...actual,
    requireAuth: vi.fn(),
    requireWorkspacePermission: vi.fn(),
  };
});

vi.mock("@/modules/publishing/publishing.service", () => ({
  publishingService: {
    createAndStartPublishingJob: vi.fn(),
    uploadCustomThumbnail: vi.fn(),
  },
}));

describe("POST /api/content/[id]/publish & thumbnail Route Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({
      id: "user_editor_123",
      email: "editor@example.com",
    });
    (requireWorkspacePermission as any).mockResolvedValue({
      user: { id: "user_editor_123" },
      workspaceId: "ws_publish_789",
      role: "EDITOR",
    });
  });

  describe("POST /api/content/[id]/publish", () => {
    it("returns 400 when missing workspaceId, socialAccountId, or videoStorageKey", async () => {
      const req = new NextRequest("http://localhost:3000/api/content/c_1/publish", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "ws_publish_789",
          // missing socialAccountId and videoStorageKey
        }),
      });

      const res = await publishRoute(req, { params: Promise.resolve({ id: "c_1" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Missing required parameter");
    });

    it("enforces content:publish RBAC and calls publishingService on valid payload", async () => {
      (publishingService.createAndStartPublishingJob as any).mockResolvedValue({
        id: "job_created_123",
        publishingStatus: "QUEUED",
      });

      const req = new NextRequest("http://localhost:3000/api/content/c_1/publish", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "ws_publish_789",
          socialAccountId: "sa_yt_1",
          videoStorageKey: "staging/ws_publish_789/video.mp4",
          title: "My New Video",
          privacyStatus: "private",
        }),
      });

      const res = await publishRoute(req, { params: Promise.resolve({ id: "c_1" }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.job.id).toBe("job_created_123");

      expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_publish_789", "content:publish");
      expect(publishingService.createAndStartPublishingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws_publish_789",
          contentId: "c_1",
          socialAccountId: "sa_yt_1",
          videoStorageKey: "staging/ws_publish_789/video.mp4",
          title: "My New Video",
          privacyStatus: "private",
        }),
        "user_editor_123"
      );
    });
  });

  describe("POST /api/content/[id]/thumbnail", () => {
    it("validates parameters and calls uploadCustomThumbnail", async () => {
      (publishingService.uploadCustomThumbnail as any).mockResolvedValue(undefined);

      const req = new NextRequest("http://localhost:3000/api/content/c_1/thumbnail", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "ws_publish_789",
          socialAccountId: "sa_yt_1",
          thumbnailStorageKey: "staging/ws_publish_789/thumb.jpg",
        }),
      });

      const res = await thumbnailRoute(req, { params: Promise.resolve({ id: "c_1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_publish_789", "content:publish");
      expect(publishingService.uploadCustomThumbnail).toHaveBeenCalledWith(
        "c_1",
        "sa_yt_1",
        "staging/ws_publish_789/thumb.jpg",
        "user_editor_123",
        "ws_publish_789"
      );
    });
  });
});
