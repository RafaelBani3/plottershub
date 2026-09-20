import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createOAuthState,
  decodeAndVerifyStateSignature,
  verifyAndConsumeOAuthState,
  cleanupExpiredOAuthAttempts,
  generatePKCE,
} from "./oauth-state";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    oAuthAuthorizationAttempt: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe("OAuth State, PKCE & Replay Protection", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const TEST_SECRET = "super_secret_auth_token_for_testing_12345";

  beforeEach(() => {
    process.env.AUTH_SECRET = TEST_SECRET;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.AUTH_SECRET = originalAuthSecret;
    vi.useRealTimers();
  });

  describe("PKCE Generation", () => {
    it("generates valid code_verifier and code_challenge pair", () => {
      const { codeVerifier, codeChallenge } = generatePKCE();

      expect(codeVerifier).toBeDefined();
      expect(codeVerifier.length).toBeGreaterThan(40);
      expect(codeChallenge).toBeDefined();
      expect(codeChallenge.length).toBeGreaterThan(40);
      expect(codeVerifier).not.toEqual(codeChallenge);
    });
  });

  describe("A. Valid OAuth State Generation & Signature Verification", () => {
    it("generates signed OAuth state, persists attempt record, and verifies signature", async () => {
      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});

      const state = await createOAuthState({
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "YOUTUBE",
        codeVerifier: "mock_pkce_verifier",
      });

      expect(state).toBeDefined();
      expect(state).toContain(".");
      expect(prisma.oAuthAuthorizationAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-123",
            workspaceId: "ws-456",
            provider: "YOUTUBE",
            codeVerifier: "mock_pkce_verifier",
          }),
        })
      );

      const decoded = decodeAndVerifyStateSignature(state, {
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "YOUTUBE",
      });

      expect(decoded.userId).toBe("user-123");
      expect(decoded.workspaceId).toBe("ws-456");
      expect(decoded.provider).toBe("YOUTUBE");
      expect(decoded.codeVerifier).toBe("mock_pkce_verifier");
      expect(decoded.nonce).toBeDefined();
    });
  });

  describe("B. Expired OAuth State", () => {
    it("throws SOCIAL_STATE_EXPIRED when state exceeds 15-minute TTL", async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});

      const state = await createOAuthState({
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "TIKTOK",
      });

      // Advance time by 16 minutes (> 15 minutes TTL)
      vi.setSystemTime(startTime + 16 * 60 * 1000);

      expect(() =>
        decodeAndVerifyStateSignature(state, {
          userId: "user-123",
          workspaceId: "ws-456",
          provider: "TIKTOK",
        })
      ).toThrowError(
        expect.objectContaining({
          name: "SocialError",
          code: "SOCIAL_STATE_EXPIRED",
        })
      );
    });
  });

  describe("C. Invalid Signature / Tampering", () => {
    it("throws SOCIAL_STATE_INVALID when state payload or signature is tampered", async () => {
      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});

      const state = await createOAuthState({
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "INSTAGRAM",
      });

      const [payload, sig] = state.split(".");
      // Tamper signature
      const tamperedSig = sig.slice(0, -2) + "ab";
      const tamperedState = `${payload}.${tamperedSig}`;

      expect(() =>
        decodeAndVerifyStateSignature(tamperedState, {
          userId: "user-123",
          workspaceId: "ws-456",
          provider: "INSTAGRAM",
        })
      ).toThrowError(
        expect.objectContaining({
          code: "SOCIAL_STATE_INVALID",
        })
      );
    });

    it("throws SOCIAL_STATE_INVALID for malformed state string", () => {
      expect(() =>
        decodeAndVerifyStateSignature("not-a-valid-state", {
          userId: "user-123",
          workspaceId: "ws-456",
          provider: "INSTAGRAM",
        })
      ).toThrowError(
        expect.objectContaining({
          code: "SOCIAL_STATE_INVALID",
        })
      );
    });
  });

  describe("D. Provider Mismatch, E. Workspace Mismatch, F. User Mismatch", () => {
    it("throws SOCIAL_STATE_INVALID when callback provider differs from state provider", async () => {
      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});

      const state = await createOAuthState({
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "YOUTUBE",
      });

      expect(() =>
        decodeAndVerifyStateSignature(state, {
          userId: "user-123",
          workspaceId: "ws-456",
          provider: "TIKTOK", // Mismatched provider
        })
      ).toThrowError(
        expect.objectContaining({
          code: "SOCIAL_STATE_INVALID",
        })
      );
    });

    it("throws SOCIAL_STATE_INVALID when workspaceId does not match state", async () => {
      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});

      const state = await createOAuthState({
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "YOUTUBE",
      });

      expect(() =>
        decodeAndVerifyStateSignature(state, {
          userId: "user-123",
          workspaceId: "ws-other-789", // Mismatched workspace
          provider: "YOUTUBE",
        })
      ).toThrowError(
        expect.objectContaining({
          code: "SOCIAL_STATE_INVALID",
        })
      );
    });

    it("throws SOCIAL_STATE_INVALID when userId does not match state", async () => {
      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});

      const state = await createOAuthState({
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "YOUTUBE",
      });

      expect(() =>
        decodeAndVerifyStateSignature(state, {
          userId: "user-attacker-999", // Mismatched user
          workspaceId: "ws-456",
          provider: "YOUTUBE",
        })
      ).toThrowError(
        expect.objectContaining({
          code: "SOCIAL_STATE_INVALID",
        })
      );
    });
  });

  describe("G. First Successful State Consumption & H. Replay Attack Prevention", () => {
    it("atomically consumes authorization attempt on first callback", async () => {
      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});
      (prisma.oAuthAuthorizationAttempt.updateMany as any).mockResolvedValue({ count: 1 });

      const state = await createOAuthState({
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "YOUTUBE",
        codeVerifier: "pkce_verifier_secret",
      });

      const result = await verifyAndConsumeOAuthState(state, {
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "YOUTUBE",
      });

      expect(result.userId).toBe("user-123");
      expect(result.codeVerifier).toBe("pkce_verifier_secret");
      expect(prisma.oAuthAuthorizationAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-123",
            workspaceId: "ws-456",
            provider: "YOUTUBE",
            consumedAt: null,
          }),
          data: expect.objectContaining({
            consumedAt: expect.any(Date),
          }),
        })
      );
    });

    it("throws SOCIAL_STATE_REPLAYED when the same state is presented a second time", async () => {
      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});
      // updateMany returns 0 because consumedAt is already populated
      (prisma.oAuthAuthorizationAttempt.updateMany as any).mockResolvedValue({ count: 0 });
      (prisma.oAuthAuthorizationAttempt.findUnique as any).mockResolvedValue({
        id: "att-1",
        nonce: "some_nonce",
        consumedAt: new Date(Date.now() - 5000), // Already consumed!
        expiresAt: new Date(Date.now() + 60000),
      });

      const state = await createOAuthState({
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "YOUTUBE",
      });

      await expect(
        verifyAndConsumeOAuthState(state, {
          userId: "user-123",
          workspaceId: "ws-456",
          provider: "YOUTUBE",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SOCIAL_STATE_REPLAYED",
          userActionRequired: true,
        })
      );
    });
  });

  describe("I. Concurrent Double-Consumption Prevention", () => {
    it("guarantees only one worker consumes the state when two requests arrive simultaneously", async () => {
      (prisma.oAuthAuthorizationAttempt.create as any).mockResolvedValue({});

      let consumptionCount = 0;
      (prisma.oAuthAuthorizationAttempt.updateMany as any).mockImplementation(() => {
        if (consumptionCount === 0) {
          consumptionCount++;
          return Promise.resolve({ count: 1 }); // Worker 1 wins
        }
        return Promise.resolve({ count: 0 }); // Worker 2 loses race
      });

      (prisma.oAuthAuthorizationAttempt.findUnique as any).mockResolvedValue({
        id: "att-1",
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
      });

      const state = await createOAuthState({
        userId: "user-123",
        workspaceId: "ws-456",
        provider: "YOUTUBE",
      });

      // Launch simultaneous verification
      const results = await Promise.allSettled([
        verifyAndConsumeOAuthState(state),
        verifyAndConsumeOAuthState(state),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.code).toBe("SOCIAL_STATE_REPLAYED");
    });
  });

  describe("Maintenance & Cleanup", () => {
    it("cleans up expired authorization attempt records", async () => {
      (prisma.oAuthAuthorizationAttempt.deleteMany as any).mockResolvedValue({ count: 15 });

      const cleanedCount = await cleanupExpiredOAuthAttempts();
      expect(cleanedCount).toBe(15);
      expect(prisma.oAuthAuthorizationAttempt.deleteMany).toHaveBeenCalled();
    });
  });
});
