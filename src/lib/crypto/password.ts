import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password securely using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hashedPassword?: string | null
): Promise<boolean> {
  if (!hashedPassword) return false;
  return bcrypt.compare(password, hashedPassword);
}
