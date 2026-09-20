import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { requireAuth } from "@/lib/auth/guard";
import { socialSyncService } from "@/modules/social/sync/sync.service";
import { SocialError } from "@/modules/social/errors";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guard")>();
  return {
    ...actual,
    requireAuth: vi.fn(),
  };
});

vi.mock("@/modules/social/sync/sync.service", () => ({
  socialSyncService: {
    syncYouTubeAccount: vi.fn(),
  },
}));

describe("POST /api/social/youtube/sync Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({
      id: "user-admin-123",
      email: "admin@plottershub.com",
    });
  });

  it("accepts only accountId from client and passes actorUserId to service", async () => {
    (socialSyncService.syncYouTubeAccount as any).mockResolvedValue({
      success: true,
      accountId: "acc-yt-123",
      platform: "YOUTUBE",
      channelId: "UC_123",
      channelTitle: "Test Channel",
      videosDiscovered: 5,
      videosProcessed: 5,
      videosCreated: 2,
      videosUpdated: 3,
      snapshotsCreated: 5,
      durationMs: 120,
    });

    const request = new NextRequest("http://localhost:3000/api/social/youtube/sync", {
      method: "POST",
      body: JSON.stringify({
        accountId: "acc-yt-123",
        // workspaceId is intentionally ignored if sent by client
        workspaceId: "attacker-workspace-id",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.channelId).toBe("UC_123");

    // Verify service was called with accountId and authenticated user's ID
    expect(socialSyncService.syncYouTubeAccount).toHaveBeenCalledWith({
      accountId: "acc-yt-123",
      actorUserId: "user-admin-123",
    });
  });

  it("returns 400 when accountId is missing in request body", async () => {
    const request = new NextRequest("http://localhost:3000/api/social/youtube/sync", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Missing required field: 'accountId'");
    expect(socialSyncService.syncYouTubeAccount).not.toHaveBeenCalled();
  });

  it("returns 409 Conflict when concurrent sync is rejected by distributed lock", async () => {
    (socialSyncService.syncYouTubeAccount as any).mockRejectedValue(
      new SocialError(
        "A synchronization operation is already in progress for this account.",
        "SOCIAL_REFRESH_LOCKED",
        {
          provider: "YOUTUBE",
          statusCode: 409,
          retryable: true,
        }
      )
    );

    const request = new NextRequest("http://localhost:3000/api/social/youtube/sync", {
      method: "POST",
      body: JSON.stringify({ accountId: "acc-yt-123" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);

    const data = await response.json();
    expect(data.code).toBe("SOCIAL_REFRESH_LOCKED");
    expect(data.provider).toBe("YOUTUBE");
    expect(data.error).toBe("A synchronization operation is already in progress for this account.");
  });
});
