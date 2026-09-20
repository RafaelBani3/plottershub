import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { requireAuth, requireWorkspacePermission } from "@/lib/auth/guard";
import { contentService } from "@/modules/content/content.service";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guard")>();
  return {
    ...actual,
    requireAuth: vi.fn(),
    requireWorkspacePermission: vi.fn(),
  };
});

vi.mock("@/modules/content/content.service", () => ({
  contentService: {
    getContentById: vi.fn(),
  },
}));

describe("GET /api/content/[id] Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
    });
    (requireWorkspacePermission as any).mockResolvedValue({
      user: { id: "user_123" },
      workspaceId: "ws_test_456",
      role: "MEMBER",
    });
  });

  it("returns 400 when workspaceId is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/content/c_123");
    const res = await GET(req, { params: Promise.resolve({ id: "c_123" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required query parameter: 'workspaceId'");
  });

  it("returns item when authorized", async () => {
    (contentService.getContentById as any).mockResolvedValue({
      id: "c_123",
      title: "Test Video",
      contentType: "LONG_FORM",
    });

    const req = new NextRequest("http://localhost:3000/api/content/c_123?workspaceId=ws_test_456");
    const res = await GET(req, { params: Promise.resolve({ id: "c_123" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.id).toBe("c_123");
    expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_test_456", "content:view");
  });
});

describe("PATCH /api/content/[id] Route Handler (Phase 3.4D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
    });
    (requireWorkspacePermission as any).mockResolvedValue({
      user: { id: "user_123" },
      workspaceId: "ws_test_456",
      role: "EDITOR",
    });
  });

  it("returns 400 when workspaceId is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/content/c_123", {
      method: "PATCH",
      body: JSON.stringify({ title: "New Title" }),
    });
    const res = await (await import("./route")).PATCH(req, { params: Promise.resolve({ id: "c_123" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required parameter: 'workspaceId'");
  });

  it("enforces content:edit permission and calls updateContent on success", async () => {
    const { contentService } = await import("@/modules/content/content.service");
    (contentService.updateContent as any) = vi.fn().mockResolvedValue({
      id: "c_123",
      title: "Updated Title on YouTube",
    });

    const req = new NextRequest("http://localhost:3000/api/content/c_123?workspaceId=ws_test_456", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated Title on YouTube" }),
    });

    const res = await (await import("./route")).PATCH(req, { params: Promise.resolve({ id: "c_123" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.title).toBe("Updated Title on YouTube");
    expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_test_456", "content:edit");
    expect(contentService.updateContent).toHaveBeenCalledWith(
      { actorUserId: "user_123", workspaceId: "ws_test_456" },
      "c_123",
      { title: "Updated Title on YouTube" }
    );
  });
});
