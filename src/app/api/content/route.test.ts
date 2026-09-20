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
    listContent: vi.fn(),
    getSummaryMetrics: vi.fn(),
  },
}));

describe("GET /api/content Route Handler", () => {
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

  it("returns 400 when workspaceId query parameter is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/content");
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required query parameter: 'workspaceId'");
  });

  it("verifies user permission for content:view in target workspace", async () => {
    (contentService.listContent as any).mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });

    const req = new NextRequest("http://localhost:3000/api/content?workspaceId=ws_test_456");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_test_456", "content:view");
  });

  it("parses and forwards filter, sorting, and bounded pagination parameters", async () => {
    (contentService.listContent as any).mockResolvedValue({
      items: [],
      total: 15,
      limit: 50,
      offset: 10,
      hasMore: false,
    });

    const req = new NextRequest(
      "http://localhost:3000/api/content?workspaceId=ws_test_456&contentType=SHORTS&status=PUBLISHED&privacy=PUBLIC&search=highlight&sortBy=views&sortOrder=asc&limit=50&offset=10"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(contentService.listContent).toHaveBeenCalledWith(
      { actorUserId: "user_123", workspaceId: "ws_test_456" },
      expect.objectContaining({
        contentType: "SHORTS",
        status: "PUBLISHED",
        privacy: "PUBLIC",
        search: "highlight",
        sortBy: "views",
        sortOrder: "asc",
        limit: 50,
        offset: 10,
      })
    );
  });

  it("clamps limit parameter between 1 and 100", async () => {
    (contentService.listContent as any).mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
      hasMore: false,
    });

    const req = new NextRequest("http://localhost:3000/api/content?workspaceId=ws_test_456&limit=9999");
    await GET(req);

    expect(contentService.listContent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 100,
      })
    );
  });
});
