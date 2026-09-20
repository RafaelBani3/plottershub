import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SocialTokenManager } from "./token-manager";
import { SocialProviderRegistry, BaseSocialProvider } from "./registry";
import { encryptToken, decryptToken } from "@/lib/crypto/token";
import { InMemoryLock } from "@/lib/lock/distributed-lock";
import { prisma } from "@/lib/db/prisma";

// Mock prisma and audit logging
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn((fn: any) =>
      fn({
        socialToken: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        socialAccount: {
          update: vi.fn(),
        },
      })
    ),
    socialToken: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    socialAccount: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn(),
}));

describe("SocialTokenManager & Token Lifecycle", () => {
  const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let tokenManager: SocialTokenManager;
  let lock: InMemoryLock;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    lock = new InMemoryLock();
    tokenManager = new SocialTokenManager(lock);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("A. Token Encryption & Valid Non-Expired Token Retrieval", () => {
    it("returns decrypted access token immediately if not expired", async () => {
      const rawAccessToken = "valid_access_token_12345";
      const encryptedAccess = encryptToken(rawAccessToken);

      (prisma.socialToken.findUnique as any).mockResolvedValue({
        id: "tok-1",
        socialAccountId: "acc-1",
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour ahead
        socialAccount: {
          id: "acc-1",
          workspaceId: "ws-1",
          status: "CONNECTED",
          platform: { code: "YOUTUBE" },
        },
      });

      const token = await tokenManager.getValidAccessToken("acc-1");
      expect(token).toBe(rawAccessToken);
    });
  });

  describe("B. Expired Token Detection & C. Refresh Success", () => {
    it("triggers refresh when access token is expiring within 5 minute buffer", async () => {
      const oldRawAccess = "expiring_access_token";
      const oldRawRefresh = "mock_refresh_token";
      const encryptedAccess = encryptToken(oldRawAccess);
      const encryptedRefresh = encryptToken(oldRawRefresh);

      // Token expiring in 2 minutes (< 5 min buffer)
      const expiringDate = new Date(Date.now() + 2 * 60 * 1000);

      const mockTokenRecord = {
        id: "tok-1",
        socialAccountId: "acc-1",
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        accessTokenExpiresAt: expiringDate,
        socialAccount: {
          id: "acc-1",
          workspaceId: "ws-1",
          status: "CONNECTED",
          platform: { code: "YOUTUBE" },
        },
      };

      (prisma.socialToken.findUnique as any).mockResolvedValue(mockTokenRecord);
      (prisma.socialAccount.update as any).mockResolvedValue({});

      // Mock provider refresh
      const mockProvider = new BaseSocialProvider("YOUTUBE", "YouTube");
      const refreshSpy = vi.spyOn(mockProvider, "refreshAccessToken").mockResolvedValue({
        accessToken: "new_refreshed_access_token_999",
        refreshToken: oldRawRefresh,
        accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      });
      SocialProviderRegistry.registerProvider("YOUTUBE", mockProvider);

      const validToken = await tokenManager.getValidAccessToken("acc-1");

      expect(validToken).toBe("new_refreshed_access_token_999");
      expect(refreshSpy).toHaveBeenCalledWith(oldRawRefresh);
    });
  });

  describe("D. Refresh Failure & Account Re-Auth State", () => {
    it("marks account REAUTH_REQUIRED when provider refresh fails", async () => {
      const encryptedAccess = encryptToken("expired_access");
      const encryptedRefresh = encryptToken("invalid_refresh");

      const mockTokenRecord = {
        id: "tok-1",
        socialAccountId: "acc-1",
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        accessTokenExpiresAt: new Date(Date.now() - 1000), // expired
        socialAccount: {
          id: "acc-1",
          workspaceId: "ws-1",
          status: "CONNECTED",
          platform: { code: "YOUTUBE" },
        },
      };

      (prisma.socialToken.findUnique as any).mockResolvedValue(mockTokenRecord);
      (prisma.socialAccount.update as any).mockResolvedValue({});
      (prisma.socialToken.update as any).mockResolvedValue({});

      const mockProvider = new BaseSocialProvider("YOUTUBE", "YouTube");
      vi.spyOn(mockProvider, "refreshAccessToken").mockRejectedValue(
        new Error("Invalid grant: refresh token has been revoked.")
      );
      SocialProviderRegistry.registerProvider("YOUTUBE", mockProvider);

      await expect(tokenManager.getValidAccessToken("acc-1")).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_TOKEN_REVOKED",
          userActionRequired: true,
        })
      );

      expect(prisma.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "acc-1" },
          data: { status: "REAUTH_REQUIRED" },
        })
      );
    });
  });

  describe("E. Revoked Token Handling / Missing Refresh Token", () => {
    it("throws and marks REAUTH_REQUIRED when expired token has no refresh token", async () => {
      const encryptedAccess = encryptToken("expired_access");

      const mockTokenRecord = {
        id: "tok-1",
        socialAccountId: "acc-1",
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: null, // No refresh token
        accessTokenExpiresAt: new Date(Date.now() - 5000),
        socialAccount: {
          id: "acc-1",
          workspaceId: "ws-1",
          status: "CONNECTED",
          platform: { code: "YOUTUBE" },
        },
      };

      (prisma.socialToken.findUnique as any).mockResolvedValue(mockTokenRecord);
      (prisma.socialAccount.update as any).mockResolvedValue({});
      (prisma.socialToken.update as any).mockResolvedValue({});

      await expect(tokenManager.getValidAccessToken("acc-1")).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_TOKEN_REVOKED",
          userActionRequired: true,
        })
      );
    });
  });

  describe("M. Concurrent Refresh Locking", () => {
    it("prevents multiple concurrent refresh calls using distributed lock", async () => {
      const oldRawAccess = "expired_access_token";
      const oldRawRefresh = "mock_refresh_token";
      const encryptedAccess = encryptToken(oldRawAccess);
      const encryptedRefresh = encryptToken(oldRawRefresh);

      let refreshCallCount = 0;
      const freshAccessToken = "new_token_1";

      const mockTokenRecord = {
        id: "tok-1",
        socialAccountId: "acc-1",
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        accessTokenExpiresAt: new Date(Date.now() - 1000), // Expired
        socialAccount: {
          id: "acc-1",
          workspaceId: "ws-1",
          status: "CONNECTED",
          platform: { code: "YOUTUBE" },
        },
      };

      (prisma.socialToken.findUnique as any).mockImplementation(() => {
        if (refreshCallCount > 0) {
          // Second read inside lock after first worker finished
          return Promise.resolve({
            ...mockTokenRecord,
            accessTokenEncrypted: encryptToken(freshAccessToken),
            accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
          });
        }
        return Promise.resolve(mockTokenRecord);
      });

      (prisma.socialAccount.update as any).mockResolvedValue({});

      const mockProvider = new BaseSocialProvider("YOUTUBE", "YouTube");
      vi.spyOn(mockProvider, "refreshAccessToken").mockImplementation(async () => {
        refreshCallCount++;
        // Simulate slight network delay
        await new Promise((res) => setTimeout(res, 50));
        return {
          accessToken: freshAccessToken,
          refreshToken: oldRawRefresh,
          accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        };
      });
      SocialProviderRegistry.registerProvider("YOUTUBE", mockProvider);

      // Launch 3 simultaneous getValidAccessToken calls for the same account
      const results = await Promise.all([
        tokenManager.getValidAccessToken("acc-1"),
        tokenManager.getValidAccessToken("acc-1"),
        tokenManager.getValidAccessToken("acc-1"),
      ]);

      // All 3 callers must receive the valid token
      expect(results).toEqual([freshAccessToken, freshAccessToken, freshAccessToken]);

      // Provider refresh should only have been called ONCE due to lock protection
      expect(refreshCallCount).toBe(1);
    });
  });

  describe("N. Refresh Token Rotation", () => {
    it("atomically replaces the refresh token when the provider issues a new rotated refresh token", async () => {
      let updatedData: any = null;

      (prisma.$transaction as any).mockImplementation(async (txFn: any) => {
        return txFn({
          socialToken: {
            findUnique: vi.fn().mockResolvedValue({
              id: "tok-1",
              socialAccountId: "acc-1",
              refreshTokenEncrypted: encryptToken("old_refresh_token"),
              lastRefreshAt: new Date(Date.now() - 60000),
            }),
            update: vi.fn().mockImplementation((args: any) => {
              updatedData = args.data;
              return Promise.resolve(args.data);
            }),
          },
          socialAccount: {
            update: vi.fn().mockResolvedValue({}),
          },
        });
      });

      await tokenManager.saveTokenBundle("acc-1", {
        accessToken: "new_access_token",
        refreshToken: "rotated_new_refresh_token",
        accessTokenExpiresAt: new Date(Date.now() + 3600000),
      });

      expect(updatedData).toBeDefined();
      expect(updatedData.refreshTokenEncrypted).toBeDefined();
      // Decrypt stored rotated refresh token to verify exact value
      const decrypted = decryptToken(updatedData.refreshTokenEncrypted);
      expect(decrypted).toBe("rotated_new_refresh_token");
    });
  });

  describe("O. Stale Token Update Prevention", () => {
    it("discards stale token updates initiated before the latest refresh", async () => {
      let updateCalled = false;

      (prisma.$transaction as any).mockImplementation(async (txFn: any) => {
        return txFn({
          socialToken: {
            findUnique: vi.fn().mockResolvedValue({
              id: "tok-1",
              socialAccountId: "acc-1",
              lastRefreshAt: new Date(2000), // Newer refresh at timestamp 2000
            }),
            update: vi.fn().mockImplementation(() => {
              updateCalled = true;
            }),
          },
          socialAccount: {
            update: vi.fn().mockResolvedValue({}),
          },
        });
      });

      // Older concurrent operation that was initiated at timestamp 1000 (< 2000)
      await tokenManager.saveTokenBundle(
        "acc-1",
        {
          accessToken: "stale_access_token",
        },
        { initiatedAt: 1000 }
      );

      // Must NOT update because newer record exists
      expect(updateCalled).toBe(false);
    });
  });
});
