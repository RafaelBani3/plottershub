import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { PlatformCode } from "./types";
import { SocialError } from "./errors";

export interface OAuthStatePayload {
  userId: string;
  workspaceId: string;
  provider: PlatformCode;
  nonce: string;
  createdAt: number;
  codeVerifier?: string;
}

export const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured.");
  }
  return secret;
}

/**
 * Generates PKCE code_verifier (high-entropy cryptographic random string)
 * and code_challenge (BASE64URL-ENCODE(SHA256(code_verifier))).
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

/**
 * Creates a signed OAuth state string AND persists the single-use authorization attempt.
 */
export async function createOAuthState(params: {
  userId: string;
  workspaceId: string;
  provider: PlatformCode;
  codeVerifier?: string;
}): Promise<string> {
  const nonce = crypto.randomBytes(24).toString("hex");
  const createdAt = Date.now();
  const expiresAt = new Date(createdAt + STATE_TTL_MS);

  // 1. Persist single-use authorization attempt in database
  await prisma.oAuthAuthorizationAttempt.create({
    data: {
      nonce,
      userId: params.userId,
      workspaceId: params.workspaceId,
      provider: params.provider,
      codeVerifier: params.codeVerifier || null,
      expiresAt,
    },
  });

  // 2. Build and sign tamper-proof payload
  const payload: OAuthStatePayload = {
    userId: params.userId,
    workspaceId: params.workspaceId,
    provider: params.provider,
    nonce,
    createdAt,
    codeVerifier: params.codeVerifier,
  };

  const json = JSON.stringify(payload);
  const data = Buffer.from(json, "utf8").toString("base64url");
  const hmac = crypto
    .createHmac("sha256", getAuthSecret())
    .update(data)
    .digest("base64url");

  return `${data}.${hmac}`;
}

/**
 * Verifies HMAC signature, checks format, and decodes the state payload.
 * Throws SocialError for malformed or tampered states.
 */
export function decodeAndVerifyStateSignature(
  stateString: string,
  expectedContext?: {
    userId?: string;
    workspaceId?: string;
    provider?: PlatformCode;
  }
): OAuthStatePayload {
  if (!stateString || typeof stateString !== "string") {
    throw new SocialError("Missing or invalid OAuth state parameter.", "SOCIAL_STATE_INVALID", {
      provider: expectedContext?.provider,
    });
  }

  const parts = stateString.split(".");
  if (parts.length !== 2) {
    throw new SocialError("Malformed OAuth state format.", "SOCIAL_STATE_INVALID", {
      provider: expectedContext?.provider,
    });
  }

  const [data, signature] = parts;
  const expectedHmac = crypto
    .createHmac("sha256", getAuthSecret())
    .update(data)
    .digest("base64url");

  // Constant-time signature verification
  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedSigBuffer = Buffer.from(expectedHmac, "utf8");

  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    throw new SocialError("OAuth state signature verification failed (tampered or invalid).", "SOCIAL_STATE_INVALID", {
      provider: expectedContext?.provider,
    });
  }

  let payload: OAuthStatePayload;
  try {
    const json = Buffer.from(data, "base64url").toString("utf8");
    payload = JSON.parse(json);
  } catch {
    throw new SocialError("Failed to parse OAuth state payload.", "SOCIAL_STATE_INVALID", {
      provider: expectedContext?.provider,
    });
  }

  // Verify timestamp age
  const age = Date.now() - payload.createdAt;
  if (age > STATE_TTL_MS || age < 0) {
    throw new SocialError("OAuth state has expired. Please initiate connection again.", "SOCIAL_STATE_EXPIRED", {
      provider: payload.provider,
      userActionRequired: true,
    });
  }

  // Verify context matches if provided
  if (expectedContext?.userId && payload.userId !== expectedContext.userId) {
    throw new SocialError("OAuth state user mismatch.", "SOCIAL_STATE_INVALID", {
      provider: payload.provider,
    });
  }

  if (expectedContext?.workspaceId && payload.workspaceId !== expectedContext.workspaceId) {
    throw new SocialError("OAuth state workspace mismatch.", "SOCIAL_STATE_INVALID", {
      provider: payload.provider,
    });
  }

  if (expectedContext?.provider && payload.provider !== expectedContext.provider) {
    throw new SocialError("OAuth state provider mismatch.", "SOCIAL_STATE_INVALID", {
      provider: payload.provider,
    });
  }

  return payload;
}

/**
 * Validates incoming OAuth state AND atomically consumes the server-side authorization attempt.
 * Prevents replay attacks, race conditions, expired states, and context mismatches.
 */
export async function verifyAndConsumeOAuthState(
  stateString: string,
  expectedContext?: {
    userId?: string;
    workspaceId?: string;
    provider?: PlatformCode;
  }
): Promise<OAuthStatePayload> {
  // 1. Verify cryptographic HMAC signature and payload
  const payload = decodeAndVerifyStateSignature(stateString, expectedContext);

  // 2. Atomically consume the authorization attempt in PostgreSQL
  const now = new Date();
  const updateResult = await prisma.oAuthAuthorizationAttempt.updateMany({
    where: {
      nonce: payload.nonce,
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      provider: payload.provider,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      consumedAt: now,
    },
  });

  // 3. Handle failure if already consumed or expired
  if (updateResult.count === 0) {
    const existing = await prisma.oAuthAuthorizationAttempt.findUnique({
      where: { nonce: payload.nonce },
    });

    if (existing) {
      if (existing.consumedAt) {
        throw new SocialError(
          "OAuth state has already been consumed (replay attack prevented).",
          "SOCIAL_STATE_REPLAYED",
          { provider: payload.provider, userActionRequired: true }
        );
      }
      if (existing.expiresAt <= now) {
        throw new SocialError(
          "OAuth authorization attempt has expired. Please initiate connection again.",
          "SOCIAL_STATE_EXPIRED",
          { provider: payload.provider, userActionRequired: true }
        );
      }
    }

    throw new SocialError(
      "OAuth authorization attempt not found or invalid.",
      "SOCIAL_STATE_INVALID",
      { provider: payload.provider }
    );
  }

  return payload;
}

/**
 * Maintenance helper to clean up old consumed or expired OAuth authorization attempts.
 */
export async function cleanupExpiredOAuthAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  const result = await prisma.oAuthAuthorizationAttempt.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { consumedAt: { lt: cutoff } },
      ],
    },
  });
  return result.count;
}
