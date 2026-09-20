import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireWorkspacePermission } from "@/lib/auth/guard";
import { publishingIntelligenceService } from "@/modules/analytics/publishing-intelligence/publishing-intelligence.service";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    socialAccount: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAuth: vi.fn(),
  requireWorkspacePermission: vi.fn(),
  handleApiError: vi.fn((err) => {
    const status = err.statusCode || err.status || 500;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }),
}));

vi.mock("@/modules/analytics/publishing-intelligence/publishing-intelligence.service", () => ({
  publishingIntelligenceService: {
    getPublishingIntelligence: vi.fn(),
  },
}));

describe("GET /api/analytics/publishing-intelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ id: "user_1", email: "user@test.com" } as any);
  });

  it("returns 400 when socialAccountId parameter is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/analytics/publishing-intelligence");
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Missing required query parameter: 'socialAccountId'");
  });

  it("returns 404 when social account does not exist", async () => {
    vi.mocked(prisma.socialAccount.findUnique).mockResolvedValue(null);

    const req = new NextRequest(
      "http://localhost:3000/api/analytics/publishing-intelligence?socialAccountId=nonexistent"
    );
    const res = await GET(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("not found");
  });

  it("resolves workspace from account and enforces analytics:view RBAC", async () => {
    vi.mocked(prisma.socialAccount.findUnique).mockResolvedValue({
      id: "sa_1",
      workspaceId: "ws_server_verified",
    } as any);

    vi.mocked(publishingIntelligenceService.getPublishingIntelligence).mockResolvedValue({
      meta: { channelTitle: "Channel 1" },
    } as any);

    const req = new NextRequest(
      "http://localhost:3000/api/analytics/publishing-intelligence?socialAccountId=sa_1&workspaceId=spoofed_ws"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);

    // Verify workspace was derived from the database account, NOT from spoofed query param
    expect(requireWorkspacePermission).toHaveBeenCalledWith("ws_server_verified", "analytics:view");
    expect(publishingIntelligenceService.getPublishingIntelligence).toHaveBeenCalledWith(
      "ws_server_verified",
      expect.objectContaining({ socialAccountId: "sa_1" })
    );
  });

  it("returns 400 when invalid format is provided", async () => {
    vi.mocked(prisma.socialAccount.findUnique).mockResolvedValue({
      id: "sa_1",
      workspaceId: "ws_1",
    } as any);

    const req = new NextRequest(
      "http://localhost:3000/api/analytics/publishing-intelligence?socialAccountId=sa_1&format=INVALID_FORMAT"
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid 'format' parameter");
  });

  it("returns 400 when invalid IANA timezone is provided", async () => {
    vi.mocked(prisma.socialAccount.findUnique).mockResolvedValue({
      id: "sa_1",
      workspaceId: "ws_1",
    } as any);

    const req = new NextRequest(
      "http://localhost:3000/api/analytics/publishing-intelligence?socialAccountId=sa_1&publishingTimezone=Moon/Base"
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid IANA timezone");
  });

  it("returns 200 with cache headers on valid request", async () => {
    vi.mocked(prisma.socialAccount.findUnique).mockResolvedValue({
      id: "sa_1",
      workspaceId: "ws_1",
    } as any);

    const mockDto = {
      meta: { socialAccountId: "sa_1", format: "LONG_FORM" },
      consumptionPattern: { daysOfWeek: [] },
      observedWindows: [],
    };
    vi.mocked(publishingIntelligenceService.getPublishingIntelligence).mockResolvedValue(mockDto as any);

    const req = new NextRequest(
      "http://localhost:3000/api/analytics/publishing-intelligence?socialAccountId=sa_1&format=LONG_FORM&lookbackDays=90&publishingTimezone=Asia/Jakarta"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("private, max-age=60");
    const json = await res.json();
    expect(json.meta.socialAccountId).toBe("sa_1");
  });
});
