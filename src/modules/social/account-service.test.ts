import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SocialAccountService } from "./account-service";
import { prisma } from "@/lib/db/prisma";
import { socialTokenManager } from "./token-manager";
import { logAuditEvent } from "@/modules/audit/audit-service";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    socialPlatform: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    socialAccount: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    socialToken: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("./token-manager", () => ({
  socialTokenManager: {
    saveTokenBundle: vi.fn(),
  },
}));

vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn(),
}));

describe("SocialAccountService", () => {
  let service: SocialAccountService;

  beforeEach(() => {
    service = new SocialAccountService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Q. Account Sanitization (Zero-Exposure Invariant)", () => {
    it("sanitizes account database entity and guarantees zero token or secret exposure", () => {
      const dbAccount = {
        id: "acc-123",
        workspaceId: "ws-456",
        platform: { code: "YOUTUBE", name: "YouTube" },
        externalAccountId: "channel-yt-999",
        username: "techreview",
        displayName: "Tech Review Official",
        avatarUrl: "https://example.com/avatar.jpg",
        status: "CONNECTED" as const,
        token: { scopes: "read_profile upload_video" },
        lastSyncedAt: new Date("2026-03-01T10:00:00Z"),
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-03-01T10:00:00Z"),
      };

      const sanitized = SocialAccountService.sanitizeAccount(dbAccount);

      expect(sanitized.id).toBe("acc-123");
      expect(sanitized.workspaceId).toBe("ws-456");
      expect(sanitized.platformCode).toBe("YOUTUBE");
      expect(sanitized.platformName).toBe("YouTube");
      expect(sanitized.externalAccountId).toBe("channel-yt-999");
      expect(sanitized.username).toBe("techreview");
      expect(sanitized.displayName).toBe("Tech Review Official");
      expect(sanitized.avatarUrl).toBe("https://example.com/avatar.jpg");
      expect(sanitized.status).toBe("CONNECTED");
      expect(sanitized.scopes).toEqual(["read_profile", "upload_video"]);
      expect(sanitized.capabilities).toBeDefined();
      expect(sanitized.capabilities.canPublishVideo).toBe(true);

      // Verify that sensitive tokens or database relations do NOT exist on the object
      expect((sanitized as any).accessToken).toBeUndefined();
      expect((sanitized as any).refreshToken).toBeUndefined();
      expect((sanitized as any).accessTokenEncrypted).toBeUndefined();
      expect((sanitized as any).refreshTokenEncrypted).toBeUndefined();
      expect((sanitized as any).clientSecret).toBeUndefined();
    });
  });

  describe("Account Connection Flow", () => {
    it("connects a social account, saves token bundle, and logs audit event", async () => {
      (prisma.socialPlatform.findUnique as any).mockResolvedValue({
        id: "plat-yt",
        code: "YOUTUBE",
        name: "YouTube",
      });

      const mockAccountRecord = {
        id: "acc-new",
        workspaceId: "ws-1",
        platformId: "plat-yt",
        externalAccountId: "yt-channel-1",
        username: "creator_yt",
        displayName: "Creator YT",
        avatarUrl: "https://example.com/p.jpg",
        status: "CONNECTED",
        createdAt: new Date(),
        updatedAt: new Date(),
        platform: { code: "YOUTUBE", name: "YouTube" },
      };

      (prisma.socialAccount.upsert as any).mockResolvedValue(mockAccountRecord);
      (socialTokenManager.saveTokenBundle as any).mockResolvedValue(undefined);

      const result = await service.connectAccount({
        workspaceId: "ws-1",
        platformCode: "YOUTUBE",
        externalAccountId: "yt-channel-1",
        username: "creator_yt",
        displayName: "Creator YT",
        avatarUrl: "https://example.com/p.jpg",
        tokenBundle: {
          accessToken: "sample_access_token",
          refreshToken: "sample_refresh_token",
          scopes: ["youtube.readonly", "youtube.upload"],
        },
        actorUserId: "user-1",
      });

      expect(result.id).toBe("acc-new");
      expect(result.status).toBe("CONNECTED");
      expect(socialTokenManager.saveTokenBundle).toHaveBeenCalledWith("acc-new", {
        accessToken: "sample_access_token",
        refreshToken: "sample_refresh_token",
        scopes: ["youtube.readonly", "youtube.upload"],
      });
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          userId: "user-1",
          action: "ACCOUNT_CONNECTED",
          resource: "social_account",
        })
      );
    });
  });

  describe("O. Account Disconnect & P. Token Deletion", () => {
    it("soft-disconnects the account, purges tokens, and preserves historical data", async () => {
      (prisma.socialAccount.findFirst as any).mockResolvedValue({
        id: "acc-123",
        workspaceId: "ws-1",
        username: "creator_yt",
        platform: { code: "YOUTUBE" },
      });
      (prisma.socialAccount.update as any).mockResolvedValue({});
      (prisma.socialToken.deleteMany as any).mockResolvedValue({ count: 1 });

      await service.disconnectAccount({
        accountId: "acc-123",
        workspaceId: "ws-1",
        actorUserId: "user-admin",
        purgeToken: true,
      });

      // 1. Verify soft-disconnect
      expect(prisma.socialAccount.update).toHaveBeenCalledWith({
        where: { id: "acc-123" },
        data: { status: "DISCONNECTED" },
      });

      // 2. Verify token deletion
      expect(prisma.socialToken.deleteMany).toHaveBeenCalledWith({
        where: { socialAccountId: "acc-123" },
      });

      // 3. Verify audit log
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          userId: "user-admin",
          action: "ACCOUNT_DISCONNECTED",
          resource: "social_account",
        })
      );
    });
  });

  describe("Workspace Accounts Retrieval", () => {
    it("fetches and sanitizes all workspace accounts", async () => {
      (prisma.socialAccount.findMany as any).mockResolvedValue([
        {
          id: "acc-1",
          workspaceId: "ws-1",
          platform: { code: "YOUTUBE", name: "YouTube" },
          externalAccountId: "yt-1",
          username: "yt_user",
          displayName: "YT User",
          avatarUrl: null,
          status: "CONNECTED",
          token: { scopes: "read publish" },
          lastSyncedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "acc-2",
          workspaceId: "ws-1",
          platform: { code: "TIKTOK", name: "TikTok" },
          externalAccountId: "tt-1",
          username: "tt_user",
          displayName: "TT User",
          avatarUrl: null,
          status: "DISCONNECTED",
          token: null,
          lastSyncedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const accounts = await service.getWorkspaceAccounts("ws-1");

      expect(accounts).toHaveLength(2);
      expect(accounts[0].platformCode).toBe("YOUTUBE");
      expect(accounts[0].capabilities.canPublishVideo).toBe(true);
      expect(accounts[1].platformCode).toBe("TIKTOK");
      expect(accounts[1].status).toBe("DISCONNECTED");
    });
  });
});
