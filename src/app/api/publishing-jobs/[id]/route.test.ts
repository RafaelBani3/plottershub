import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getJobRoute } from "./route";
import { POST as resumeRoute } from "./resume/route";
import { POST as cancelRoute } from "./cancel/route";
import { POST as reconcileRoute } from "./reconcile/route";
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
    getPublishingJob: vi.fn(),
    resumePublishingJob: vi.fn(),
    cancelPublishingJob: vi.fn(),
    reconcilePublishingJob: vi.fn(),
  },
}));

describe("Publishing Jobs API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({
      id: "user_owner_1",
      email: "owner@example.com",
    });
    (requireWorkspacePermission as any).mockResolvedValue({
      user: { id: "user_owner_1" },
      workspaceId: "ws_test_jobs",
      role: "OWNER",
    });
  });

  describe("GET /api/publishing-jobs/[id]", () => {
    it("returns 400 when workspaceId query param is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/publishing-jobs/job_123");
      const res = await getJobRoute(req, { params: Promise.resolve({ id: "job_123" }) });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("workspaceId");
    });

    it("returns publishing job details when authorized", async () => {
      (publishingService.getPublishingJob as any).mockResolvedValue({
        id: "job_123",
        publishingStatus: "UPLOADING",
        bytesUploaded: 1048576,
        totalBytes: 2097152,
      });

      const req = new NextRequest("http://localhost:3000/api/publishing-jobs/job_123?workspaceId=ws_test_jobs");
      const res = await getJobRoute(req, { params: Promise.resolve({ id: "job_123" }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.job.id).toBe("job_123");
      expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_test_jobs", "content:view");
      expect(publishingService.getPublishingJob).toHaveBeenCalledWith("job_123", "user_owner_1", "ws_test_jobs");
    });
  });

  describe("POST /api/publishing-jobs/[id]/resume", () => {
    it("enforces content:publish RBAC and resumes job", async () => {
      (publishingService.resumePublishingJob as any).mockResolvedValue({
        id: "job_123",
        publishingStatus: "UPLOADING",
      });

      const req = new NextRequest("http://localhost:3000/api/publishing-jobs/job_123/resume", {
        method: "POST",
        body: JSON.stringify({ workspaceId: "ws_test_jobs" }),
      });
      const res = await resumeRoute(req, { params: Promise.resolve({ id: "job_123" }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.job.publishingStatus).toBe("UPLOADING");
      expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_test_jobs", "content:publish");
      expect(publishingService.resumePublishingJob).toHaveBeenCalledWith("job_123", "user_owner_1", "ws_test_jobs");
    });
  });

  describe("POST /api/publishing-jobs/[id]/cancel", () => {
    it("enforces content:publish RBAC and cancels job", async () => {
      (publishingService.cancelPublishingJob as any).mockResolvedValue({
        id: "job_123",
        publishingStatus: "CANCELLED",
      });

      const req = new NextRequest("http://localhost:3000/api/publishing-jobs/job_123/cancel", {
        method: "POST",
        body: JSON.stringify({ workspaceId: "ws_test_jobs" }),
      });
      const res = await cancelRoute(req, { params: Promise.resolve({ id: "job_123" }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.job.publishingStatus).toBe("CANCELLED");
      expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_test_jobs", "content:publish");
      expect(publishingService.cancelPublishingJob).toHaveBeenCalledWith("job_123", "user_owner_1", "ws_test_jobs");
    });
  });

  describe("POST /api/publishing-jobs/[id]/reconcile", () => {
    it("enforces content:publish RBAC and reconciles job", async () => {
      (publishingService.reconcilePublishingJob as any).mockResolvedValue({
        id: "job_123",
        publishingStatus: "PUBLISHED",
      });

      const req = new NextRequest("http://localhost:3000/api/publishing-jobs/job_123/reconcile", {
        method: "POST",
        body: JSON.stringify({ workspaceId: "ws_test_jobs" }),
      });
      const res = await reconcileRoute(req, { params: Promise.resolve({ id: "job_123" }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.job.publishingStatus).toBe("PUBLISHED");
      expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_test_jobs", "content:publish");
      expect(publishingService.reconcilePublishingJob).toHaveBeenCalledWith("job_123", "user_owner_1", "ws_test_jobs");
    });
  });
});
