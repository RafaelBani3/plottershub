import { prisma } from "@/lib/db/prisma";
import { encryptToken, decryptToken } from "@/lib/crypto/token";
import { defaultLock, DistributedLock } from "@/lib/lock/distributed-lock";
import { SocialProviderRegistry } from "./registry";
import { PlatformCode, TokenBundle } from "./types";
import { SocialError } from "./errors";
import { logAuditEvent } from "@/modules/audit/audit-service";

const EXPIRATION_BUFFER_MS = 5 * 60 * 1000; // 5 minute buffer to trigger pre-emptive refresh

export class SocialTokenManager {
  private lock: DistributedLock;

  constructor(lock: DistributedLock = defaultLock) {
    this.lock = lock;
  }

  /**
   * Returns a guaranteed valid decrypted access token for server-side social operations.
   * Performs pre-emptive token refresh under a distributed lock if the token is expired or expiring.
   */
  async getValidAccessToken(
    socialAccountId: string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<string> {
    const tokenRecord = await prisma.socialToken.findUnique({
      where: { socialAccountId },
      include: {
        socialAccount: {
          include: {
            platform: true,
          },
        },
      },
    });

    if (!tokenRecord) {
      throw new SocialError(
        `No credentials found for social account: ${socialAccountId}`,
        "SOCIAL_AUTH_REQUIRED",
        { userActionRequired: true }
      );
    }

    const { socialAccount } = tokenRecord;
    const platformCode = socialAccount.platform.code as PlatformCode;

    // Check account status
    if (socialAccount.status === "REAUTH_REQUIRED" || socialAccount.status === "DISCONNECTED") {
      throw new SocialError(
        `Account requires re-authorization: status is ${socialAccount.status}`,
        "SOCIAL_TOKEN_REVOKED",
        { provider: platformCode, userActionRequired: true }
      );
    }

    const now = Date.now();
    const expiresAt = tokenRecord.accessTokenExpiresAt?.getTime();
    const isExpiring = expiresAt ? expiresAt - now <= EXPIRATION_BUFFER_MS : false;

    // If access token is still valid and forceRefresh is false, return decrypted token immediately
    if (!isExpiring && !options.forceRefresh) {
      try {
        return decryptToken(tokenRecord.accessTokenEncrypted);
      } catch (err) {
        throw new SocialError("Failed to decrypt stored access token.", "SOCIAL_API_ERROR", {
          provider: platformCode,
          cause: err,
        });
      }
    }

    // Access token is expired or expiring: must refresh under distributed lock
    const lockKey = `social-token-refresh:${socialAccountId}`;

    try {
      return await this.lock.withLock(
        lockKey,
        async () => {
          const refreshInitiatedAt = Date.now();

          // Re-read token record inside lock to handle race condition where another worker just refreshed it
          const freshRecord = await prisma.socialToken.findUnique({
            where: { socialAccountId },
          });

          if (!freshRecord) {
            throw new SocialError("Token record disappeared during refresh.", "SOCIAL_AUTH_REQUIRED");
          }

          const freshExpiresAt = freshRecord.accessTokenExpiresAt?.getTime();
          if (freshExpiresAt && freshExpiresAt - Date.now() > EXPIRATION_BUFFER_MS) {
            // Token was already refreshed by another concurrent worker! Return decrypted token
            return decryptToken(freshRecord.accessTokenEncrypted);
          }

          if (!freshRecord.refreshTokenEncrypted) {
            await this.markReauthRequired(
              socialAccountId,
              socialAccount.workspaceId,
              platformCode,
              "No refresh token available to refresh expired credentials."
            );
            throw new SocialError("No refresh token available. Re-authorization required.", "SOCIAL_TOKEN_REVOKED", {
              provider: platformCode,
              userActionRequired: true,
            });
          }

          let decryptedRefreshToken: string;
          try {
            decryptedRefreshToken = decryptToken(freshRecord.refreshTokenEncrypted);
          } catch (err) {
            await this.markReauthRequired(
              socialAccountId,
              socialAccount.workspaceId,
              platformCode,
              "Failed to decrypt refresh token."
            );
            throw new SocialError("Failed to decrypt refresh token.", "SOCIAL_API_ERROR", {
              provider: platformCode,
              cause: err,
            });
          }


          // Execute provider refresh call
          const provider = SocialProviderRegistry.getProvider(platformCode);
          let refreshedBundle: TokenBundle;

          try {
            refreshedBundle = await provider.refreshAccessToken(decryptedRefreshToken);
          } catch (err: any) {
            const errorMsg = err?.message || "Token refresh failed on provider.";
            const isPermanent = isPermanentTokenRefreshError(err);

            if (isPermanent) {
              await this.markReauthRequired(
                socialAccountId,
                socialAccount.workspaceId,
                platformCode,
                errorMsg
              );
              throw new SocialError(`Token refresh failed: ${errorMsg}`, "SOCIAL_TOKEN_REVOKED", {
                provider: platformCode,
                userActionRequired: true,
                cause: err,
              });
            }

            // Transient failure: preserve account status, update lastError, log audit, and throw retryable error
            await prisma.socialToken.update({
              where: { socialAccountId },
              data: { lastError: `Transient refresh error: ${errorMsg}` },
            }).catch(() => {});

            await logAuditEvent({
              workspaceId: socialAccount.workspaceId,
              action: "TOKEN_REFRESH_FAILED",
              resource: "social_account",
              resourceId: socialAccountId,
              details: { platform: platformCode, reason: errorMsg, transient: true },
            }).catch(() => {});

            throw new SocialError(`Token refresh temporarily failed: ${errorMsg}`, "SOCIAL_API_ERROR", {
              provider: platformCode,
              userActionRequired: false,
              statusCode: 503,
              cause: err,
            });
          }

          // Persist refreshed credentials safely with stale-write prevention
          await this.saveTokenBundle(socialAccountId, refreshedBundle, {
            initiatedAt: refreshInitiatedAt,
          });

          return refreshedBundle.accessToken;
        },
        { ttlMs: 15000, timeoutMs: 8000, autoExtend: true }
      );
    } catch (err) {
      if (err instanceof SocialError) throw err;
      throw new SocialError(
        err instanceof Error ? err.message : "Failed to acquire lock for token refresh.",
        "SOCIAL_LOCK_ACQUISITION_FAILED",
        { provider: platformCode, cause: err }
      );
    }
  }

  /**
   * Encrypts and persists a new or refreshed TokenBundle.
   * Handles refresh token rotation atomically and prevents stale overwrites.
   */
  async saveTokenBundle(
    socialAccountId: string,
    bundle: TokenBundle,
    options: { initiatedAt?: number } = {}
  ): Promise<void> {
    const accessTokenEncrypted = encryptToken(bundle.accessToken);
    const refreshTokenEncrypted = bundle.refreshToken
      ? encryptToken(bundle.refreshToken)
      : undefined;

    const scopesStr = Array.isArray(bundle.scopes)
      ? bundle.scopes.join(" ")
      : bundle.scopes || undefined;

    const refreshTimestamp = new Date();

    await prisma.$transaction(async (tx) => {
      const existing = await tx.socialToken.findUnique({
        where: { socialAccountId },
      });

      // Prevent stale concurrent write if existing record was refreshed after this operation started
      if (
        existing?.lastRefreshAt &&
        options.initiatedAt &&
        existing.lastRefreshAt.getTime() > options.initiatedAt
      ) {
        return; // Retain newer record
      }

      if (existing) {
        await tx.socialToken.update({
          where: { socialAccountId },
          data: {
            accessTokenEncrypted,
            ...(refreshTokenEncrypted !== undefined ? { refreshTokenEncrypted } : {}),
            accessTokenExpiresAt: bundle.accessTokenExpiresAt || null,
            ...(bundle.refreshTokenExpiresAt ? { refreshTokenExpiresAt: bundle.refreshTokenExpiresAt } : {}),
            ...(scopesStr ? { scopes: scopesStr } : {}),
            lastRefreshAt: refreshTimestamp,
            lastError: null,
          },
        });
      } else {
        await tx.socialToken.create({
          data: {
            socialAccountId,
            accessTokenEncrypted,
            refreshTokenEncrypted: refreshTokenEncrypted || null,
            accessTokenExpiresAt: bundle.accessTokenExpiresAt || null,
            refreshTokenExpiresAt: bundle.refreshTokenExpiresAt || null,
            scopes: scopesStr || null,
            lastRefreshAt: refreshTimestamp,
            lastError: null,
          },
        });
      }

      // Ensure account status is CONNECTED
      await tx.socialAccount.update({
        where: { id: socialAccountId },
        data: { status: "CONNECTED" },
      });
    });
  }

  /**
   * Transitions account state to REAUTH_REQUIRED and logs audit event.
   */
  async markReauthRequired(
    socialAccountId: string,
    workspaceId: string,
    platform: PlatformCode,
    reason?: string
  ): Promise<void> {
    await prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: { status: "REAUTH_REQUIRED" },
    }).catch(() => {});

    if (reason) {
      await prisma.socialToken.update({
        where: { socialAccountId },
        data: { lastError: reason },
      }).catch(() => {});
    }

    await logAuditEvent({
      workspaceId,
      action: "SOCIAL_REAUTH_REQUIRED",
      resource: "social_account",
      resourceId: socialAccountId,
      details: { platform, reason },
    });
  }
}

export const socialTokenManager = new SocialTokenManager();
 
/**
 * Classifies whether a token refresh exception represents a permanent revocation
 * (invalid_grant, client_secret mismatch, revoked token) requiring REAUTH_REQUIRED,
 * or a transient network/server failure (500-504, timeout, network error).
 */
export function isPermanentTokenRefreshError(err: any): boolean {
  if (!err) return false;

  const msg = String(err.message || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();
  const status =
    typeof err.statusCode === "number"
      ? err.statusCode
      : typeof err.status === "number"
      ? err.status
      : 0;

  // Transient HTTP statuses: 429, 500, 502, 503, 504
  if (status === 429 || (status >= 500 && status <= 504)) {
    return false;
  }

  // Transient Node.js network error codes
  if (
    code === "etimedout" ||
    code === "econnreset" ||
    code === "econnrefused" ||
    code === "ehostunreach" ||
    code === "enotfound" ||
    code === "esockettimedout" ||
    code === "und_err_connect_timeout"
  ) {
    return false;
  }

  // Transient message keywords
  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("fetch failed") ||
    msg.includes("network error") ||
    msg.includes("connection reset") ||
    msg.includes("econnreset") ||
    msg.includes("service unavailable") ||
    msg.includes("internal server error") ||
    msg.includes("bad gateway")
  ) {
    return false;
  }

  // Permanent OAuth error indicators
  if (
    msg.includes("invalid_grant") ||
    msg.includes("revoked") ||
    msg.includes("unauthorized_client") ||
    msg.includes("invalid_client") ||
    msg.includes("account_disabled") ||
    msg.includes("access_denied") ||
    status === 400 ||
    status === 401
  ) {
    return true;
  }

  // If status is 4xx other than 429, treat as permanent
  if (status >= 400 && status < 500 && status !== 429) {
    return true;
  }

  // Default: if error code is explicitly SOCIAL_TOKEN_REVOKED or SOCIAL_AUTH_REQUIRED
  if (code === "social_token_revoked" || code === "social_auth_required") {
    return true;
  }

  return false;
}
