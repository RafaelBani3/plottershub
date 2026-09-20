import crypto from "crypto";

/**
 * Constant-time verification of the Bearer authorization header against CRON_SECRET.
 * Uses SHA-256 digest hashing to eliminate length-dependent timing side channels.
 */
export function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim().length === 0) {
    return false;
  }
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.slice(7).trim();
  if (token.length === 0) {
    return false;
  }

  const secretHash = crypto.createHash("sha256").update(secret).digest();
  const tokenHash = crypto.createHash("sha256").update(token).digest();

  return crypto.timingSafeEqual(secretHash, tokenHash);
}
