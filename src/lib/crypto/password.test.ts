import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("Password Security & Hashing", () => {
  it("hashes password and verifies successfully with correct input", async () => {
    const rawPassword = "SuperSecretPassword123!";
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith("$2")).toBe(true);

    const isValid = await verifyPassword(rawPassword, hash);
    expect(isValid).toBe(true);
  });

  it("rejects incorrect password verification", async () => {
    const rawPassword = "CorrectPassword123!";
    const hash = await hashPassword(rawPassword);

    const isValid = await verifyPassword("WrongPassword!", hash);
    expect(isValid).toBe(false);
  });

  it("handles null or undefined stored hashes gracefully", async () => {
    const isValidNull = await verifyPassword("Password123!", null);
    expect(isValidNull).toBe(false);

    const isValidUndefined = await verifyPassword("Password123!", undefined);
    expect(isValidUndefined).toBe(false);
  });
});
