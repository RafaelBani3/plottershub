import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptToken, decryptToken } from "./token";

describe("AES-256-GCM Token Encryption", () => {
  const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const originalEnv = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = originalEnv;
  });

  it("encrypts and decrypts OAuth access token correctly", () => {
    const originalToken = "ya29.a0AfH6SMD_SampleYouTubeOAuthAccessToken12345";
    const encrypted = encryptToken(originalToken);

    expect(encrypted).toBeDefined();
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(encrypted).not.toContain(originalToken);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  it("produces unique ciphertexts for identical inputs due to random IVs", () => {
    const token = "tiktok_refresh_token_sample_abc123";
    const enc1 = encryptToken(token);
    const enc2 = encryptToken(token);

    expect(enc1).not.toBe(enc2);
    expect(decryptToken(enc1)).toBe(token);
    expect(decryptToken(enc2)).toBe(token);
  });

  it("throws error when trying to decrypt tampered ciphertext or wrong auth tag", () => {
    const token = "secret_access_token";
    const encrypted = encryptToken(token);
    const parts = encrypted.split(":");
    // Tamper ciphertext
    parts[3] = parts[3].slice(0, -2) + "ff";
    const tampered = parts.join(":");

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("throws error for malformed encrypted string", () => {
    expect(() => decryptToken("invalid-payload-string")).toThrow();
    expect(() => decryptToken("v2:12:34:56")).toThrow();
  });
});
