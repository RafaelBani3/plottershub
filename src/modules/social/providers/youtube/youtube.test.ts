import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { YouTubeOAuthClient } from "./youtube.oauth";
import { YouTubeDataApiClient } from "./youtube.data-api";
import { YouTubeMapper } from "./youtube.mapper";
import { SocialProviderRegistry } from "@/modules/social/registry";
import { createOAuthState, verifyAndConsumeOAuthState, generatePKCE } from "@/modules/social/oauth-state";
import { socialAccountService } from "@/modules/social/account-service";
import { prisma } from "@/lib/db/prisma";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { socialTokenManager } from "@/modules/social/token-manager";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    oAuthAuthorizationAttempt: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
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
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/modules/audit/audit-service", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("@/modules/social/token-manager", () => ({
  socialTokenManager: {
    saveTokenBundle: vi.fn(),
    getValidAccessToken: vi.fn(),
  },
}));

describe("Phase 3.1: YouTube OAuth & Channel Identity Foundation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      AUTH_SECRET: "mock-auth-secret-at-least-32-characters-long-key-12345",
      GOOGLE_CLIENT_ID: "mock-google-client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "mock-google-client-secret",
      GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/social/callback/youtube",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // 1 & 2 & 3 & 7: Generate YouTube OAuth URL, Scopes, Redirect URI, PKCE
  describe("1-3 & 7. OAuth URL, Scopes, Redirect URI & PKCE Challenge", () => {
    it("generates correct Google OAuth URL with offline access, PKCE S256 challenge, and minimum least-privilege scopes", async () => {
      const oauthClient = new YouTubeOAuthClient();
      const { codeChallenge } = generatePKCE();
      const state = "signed_state_token_xyz";
      const redirectUri = "http://localhost:3000/api/social/callback/youtube";

      const authUrlStr = await oauthClient.getAuthorizationUrl({
        state,
        redirectUri,
        codeChallenge,
      });

      const url = new URL(authUrlStr);

      // Endpoint
      expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");

      // Client ID & Redirect URI
      expect(url.searchParams.get("client_id")).toBe("mock-google-client-id.apps.googleusercontent.com");
      expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("access_type")).toBe("offline");
      expect(url.searchParams.get("prompt")).toBe("consent");
      expect(url.searchParams.get("include_granted_scopes")).toBe("true");

      // State & PKCE
      expect(url.searchParams.get("state")).toBe(state);
      expect(url.searchParams.get("code_challenge")).toBe(codeChallenge);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");

      // Required Scopes (least-privilege read-only)
      const requestedScopes = url.searchParams.get("scope")?.split(" ") || [];
      expect(requestedScopes).toContain("openid");
      expect(requestedScopes).toContain("https://www.googleapis.com/auth/userinfo.profile");
      expect(requestedScopes).toContain("https://www.googleapis.com/auth/youtube.readonly");
      expect(requestedScopes).toContain("https://www.googleapis.com/auth/yt-analytics.readonly");

      // Ensure write/upload scopes are NOT requested in Phase 3.1
      expect(requestedScopes).not.toContain("https://www.googleapis.com/auth/youtube.upload");
      expect(requestedScopes).not.toContain("https://www.googleapis.com/auth/youtube.force-ssl");
      expect(requestedScopes).not.toContain("https://www.googleapis.com/auth/youtube");
    });
  });

  // 4 & 5 & 6: OAuth State Creation, Validation, and Replay Rejection
  describe("4-6. OAuth State Management & Replay Protection", () => {
    it("creates, validates, and atomically consumes single-use state attempt", async () => {
      const { codeVerifier } = generatePKCE();
      const mockAttempt = {
        id: "att-123",
        nonce: "nonce_abc_123",
        userId: "user-1",
        workspaceId: "ws-1",
        provider: "YOUTUBE",
        codeVerifier,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
      };

      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue(mockAttempt);
      (prisma.oAuthAuthorizationAttempt.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.oAuthAuthorizationAttempt.findUnique as any).mockResolvedValue(mockAttempt);

      const stateToken = await createOAuthState({
        userId: "user-1",
        workspaceId: "ws-1",
        provider: "YOUTUBE",
        codeVerifier,
      });

      expect(stateToken).toBeDefined();

      // Validate and consume state
      const consumed = await verifyAndConsumeOAuthState(stateToken);
      expect(consumed.userId).toBe("user-1");
      expect(consumed.workspaceId).toBe("ws-1");
      expect(consumed.provider).toBe("YOUTUBE");
      expect(consumed.codeVerifier).toBe(codeVerifier);

      // Verify atomic consumption (updateMany)
      expect(prisma.oAuthAuthorizationAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            workspaceId: "ws-1",
            provider: "YOUTUBE",
            consumedAt: null,
          }),
        })
      );
    });

    it("rejects replayed or consumed OAuth state on subsequent attempt", async () => {
      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});
      (prisma.oAuthAuthorizationAttempt.updateMany as any).mockResolvedValue({ count: 0 });
      (prisma.oAuthAuthorizationAttempt.findUnique as any).mockResolvedValue({
        id: "att-1",
        nonce: "some_nonce",
        consumedAt: new Date(Date.now() - 5000),
        expiresAt: new Date(Date.now() + 60000),
      });

      const stateToken = await createOAuthState({
        userId: "user-1",
        workspaceId: "ws-1",
        provider: "YOUTUBE",
      });

      await expect(verifyAndConsumeOAuthState(stateToken)).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_STATE_REPLAYED",
        })
      );
    });
  });

  // 8 & 9: Authorization Code Exchange & Token Response Passing
  describe("8-9. Server-Side Token Exchange & SocialTokenManager Persistence", () => {
    it("exchanges authorization code with Google token endpoint with PKCE verifier", async () => {
      const oauthClient = new YouTubeOAuthClient();
      const mockTokenResponse = {
        access_token: "ya29.mock_google_access_token",
        refresh_token: "1//0mock_google_refresh_token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
      };

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      } as Response);

      const bundle = await oauthClient.exchangeAuthorizationCode({
        code: "4/0AeanS0_mock_code",
        redirectUri: "http://localhost:3000/api/social/callback/youtube",
        codeVerifier: "pkce_verifier_secret_value",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        })
      );

      expect(bundle.accessToken).toBe("ya29.mock_google_access_token");
      expect(bundle.refreshToken).toBe("1//0mock_google_refresh_token");
      expect(bundle.accessTokenExpiresAt).toBeInstanceOf(Date);
      expect(bundle.scopes).toContain("https://www.googleapis.com/auth/youtube.readonly");
    });
  });

  // 10 & 11: YouTube Channel Lookup & Canonical ID Mapping
  describe("10-11. YouTube Channel Lookup & Canonical Channel ID Identity", () => {
    it("queries channels.list(mine=true) and maps Channel ID (UC...) as externalAccountId", async () => {
      const dataApi = new YouTubeDataApiClient();
      const mockChannelResponse = {
        kind: "youtube#channelListResponse",
        items: [
          {
            id: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
            snippet: {
              title: "Google for Developers",
              description: "Official developer channel",
              customUrl: "@googledevelopers",
              thumbnails: {
                default: { url: "https://yt3.ggpht.com/avatar_default.jpg" },
                high: { url: "https://yt3.ggpht.com/avatar_high.jpg" },
              },
            },
            statistics: {
              viewCount: "250000000",
              subscriberCount: "2300000",
              videoCount: "5400",
            },
            contentDetails: {
              relatedPlaylists: {
                uploads: "UU_x5XG1OV2P6uZZ5FSM9Ttw",
              },
            },
            status: {
              privacyStatus: "public",
              isLinked: true,
              longUploadsStatus: "eligible",
            },
          },
        ],
      };

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockChannelResponse,
      } as Response);

      const channel = await dataApi.getAuthenticatedChannel("mock_access_token");
      expect(channel.id).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");

      const normalized = YouTubeMapper.toNormalizedAccount(channel);
      expect(normalized.externalAccountId).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
      expect(normalized.username).toBe("googledevelopers");
      expect(normalized.displayName).toBe("Google for Developers");
      expect(normalized.avatarUrl).toBe("https://yt3.ggpht.com/avatar_high.jpg");

      // Invariant: externalAccountId MUST NOT be an email or arbitrary Google ID
      expect(normalized.externalAccountId.startsWith("UC")).toBe(true);
      expect(normalized.externalAccountId).not.toContain("@");
    });

    it("throws SOCIAL_ACCOUNT_RESTRICTED when user Google account has no YouTube channel", async () => {
      const dataApi = new YouTubeDataApiClient();
      const mockEmptyResponse = {
        kind: "youtube#channelListResponse",
        items: [],
      };

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockEmptyResponse,
      } as Response);

      await expect(dataApi.getAuthenticatedChannel("mock_access_token")).rejects.toThrowError(
        expect.objectContaining({
          name: "SocialError",
          code: "SOCIAL_ACCOUNT_RESTRICTED",
        })
      );
    });
  });

  // 12: Duplicate YouTube Account Handling
  describe("12. Duplicate YouTube Account Connection (Upsert Behavior)", () => {
    it("updates existing account gracefully when reconnecting same channel to workspace", async () => {
      (prisma.socialPlatform.findUnique as any).mockResolvedValue({
        id: "plat-yt",
        code: "YOUTUBE",
        name: "YouTube",
      });

      const existingAccount = {
        id: "acc-existing-yt",
        workspaceId: "ws-1",
        platformId: "plat-yt",
        externalAccountId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
        username: "googledevelopers",
        displayName: "Google for Developers Updated",
        avatarUrl: "https://yt3.ggpht.com/avatar_new.jpg",
        status: "CONNECTED",
        platform: { code: "YOUTUBE", name: "YouTube" },
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date(),
      };

      (prisma.socialAccount.upsert as any).mockResolvedValue(existingAccount);

      const connected = await socialAccountService.connectAccount({
        workspaceId: "ws-1",
        platformCode: "YOUTUBE",
        externalAccountId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
        username: "googledevelopers",
        displayName: "Google for Developers Updated",
        avatarUrl: "https://yt3.ggpht.com/avatar_new.jpg",
        tokenBundle: {
          accessToken: "ya29.new_access_token",
          refreshToken: "1//new_refresh_token",
          scopes: ["youtube.readonly"],
        },
        actorUserId: "user-1",
      });

      expect(connected.id).toBe("acc-existing-yt");
      expect(connected.externalAccountId).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
      expect(prisma.socialAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId_platformId_externalAccountId: {
              workspaceId: "ws-1",
              platformId: "plat-yt",
              externalAccountId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
            },
          },
        })
      );
      expect(socialTokenManager.saveTokenBundle).toHaveBeenCalledWith("acc-existing-yt", expect.anything());
    });
  });

  // 13 & 14 & 15: Error Handling (OAuth Denial, invalid_grant, Error Sanitization)
  describe("13-15. Error Handling, invalid_grant & Error Sanitization", () => {
    it("handles invalid_grant error from Google and maps to SOCIAL_TOKEN_REVOKED", async () => {
      const oauthClient = new YouTubeOAuthClient();

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: "invalid_grant",
          error_description: "Token has been expired or revoked.",
        }),
      } as Response);

      await expect(
        oauthClient.refreshAccessToken("revoked_refresh_token")
      ).rejects.toThrowError(
        expect.objectContaining({
          name: "SocialError",
          code: "SOCIAL_TOKEN_REVOKED",
        })
      );
    });

    it("sanitizes Google API quota errors without exposing secrets or raw response structures", async () => {
      const dataApi = new YouTubeDataApiClient();

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 403,
            message: "The request cannot be completed because you have exceeded your quota.",
            errors: [{ reason: "quotaExceeded" }],
          },
        }),
      } as Response);

      await expect(dataApi.getAuthenticatedChannel("token_xyz")).rejects.toThrowError(
        expect.objectContaining({
          name: "SocialError",
          code: "SOCIAL_RATE_LIMITED",
        })
      );
    });
  });

  // 16: Zero-Exposure Invariant (Tokens / Secrets never exposed)
  describe("16. Zero-Exposure Security Guarantee", () => {
    it("verifies SocialAccount representation exposes zero tokens, secrets, or encryption payloads", () => {
      const dbAccount = {
        id: "acc-yt-safe",
        workspaceId: "ws-1",
        platform: { code: "YOUTUBE", name: "YouTube" },
        externalAccountId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
        username: "googledevelopers",
        displayName: "Google for Developers",
        avatarUrl: "https://yt3.ggpht.com/avatar.jpg",
        status: "CONNECTED" as const,
        token: { scopes: "openid youtube.readonly yt-analytics.readonly" },
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sanitized = (socialAccountService.constructor as any).sanitizeAccount(dbAccount);

      expect(sanitized.id).toBe("acc-yt-safe");
      expect(sanitized.externalAccountId).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
      expect(sanitized.scopes).toEqual(["openid", "youtube.readonly", "yt-analytics.readonly"]);

      // Verify no sensitive keys exist
      const sensitiveKeys = [
        "accessToken",
        "refreshToken",
        "accessTokenEncrypted",
        "refreshTokenEncrypted",
        "clientSecret",
        "iv",
        "authTag",
      ];
      for (const key of sensitiveKeys) {
        expect((sanitized as any)[key]).toBeUndefined();
      }
    });
  });

  // 17: Workspace Isolation
  describe("17. Workspace Isolation", () => {
    it("queries social accounts strictly bounded by workspaceId", async () => {
      (prisma.socialAccount.findMany as any).mockResolvedValue([
        {
          id: "acc-ws-1",
          workspaceId: "ws-1",
          platform: { code: "YOUTUBE", name: "YouTube" },
          externalAccountId: "UC_ws1",
          username: "ws1_channel",
          displayName: "WS 1 Channel",
          avatarUrl: null,
          status: "CONNECTED",
          token: null,
          lastSyncedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const accounts = await socialAccountService.getWorkspaceAccounts("ws-1");
      expect(accounts).toHaveLength(1);
      expect(accounts[0].workspaceId).toBe("ws-1");
      expect(prisma.socialAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: "ws-1" },
        })
      );
    });
  });

  // 18: Audit Event Creation
  describe("18. Audit Logging During YouTube Connection", () => {
    it("records ACCOUNT_CONNECTED audit event upon successful YouTube channel binding", async () => {
      (prisma.socialPlatform.findUnique as any).mockResolvedValue({
        id: "plat-yt",
        code: "YOUTUBE",
        name: "YouTube",
      });
      (prisma.socialAccount.upsert as any).mockResolvedValue({
        id: "acc-audit-test",
        workspaceId: "ws-audit",
        platformId: "plat-yt",
        externalAccountId: "UC_audit_channel",
        username: "audit_yt",
        displayName: "Audit YT",
        avatarUrl: null,
        status: "CONNECTED",
        platform: { code: "YOUTUBE", name: "YouTube" },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await socialAccountService.connectAccount({
        workspaceId: "ws-audit",
        platformCode: "YOUTUBE",
        externalAccountId: "UC_audit_channel",
        username: "audit_yt",
        tokenBundle: {
          accessToken: "sample_token",
          scopes: ["youtube.readonly"],
        },
        actorUserId: "user-auditor",
      });

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-audit",
          userId: "user-auditor",
          action: "ACCOUNT_CONNECTED",
          resource: "social_account",
          resourceId: "acc-audit-test",
          details: expect.objectContaining({
            platform: "YOUTUBE",
            externalAccountId: "UC_audit_channel",
          }),
        })
      );
    });
  });

  // Registry validation
  describe("Registry Integration", () => {
    it("returns canonical YouTubeSocialProvider from registry", () => {
      const provider = SocialProviderRegistry.getProvider("YOUTUBE");
      expect(provider).toBeDefined();
      expect(provider.platformCode).toBe("YOUTUBE");
      expect(provider.platformName).toBe("YouTube");
      expect(provider.getCapabilities().canReadContent).toBe(true);
      expect(provider.getCapabilities().canReadContentMetrics).toBe(true);
    });
  });
});
