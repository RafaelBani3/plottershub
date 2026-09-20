import { describe, it, expect } from "vitest";
import { validateUpdateContentInput } from "./content.types";

describe("Content Write Validation (Phase 3.4D)", () => {
  it("rejects empty payload with no fields", () => {
    const result = validateUpdateContentInput({});
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least one mutable field/i);
  });

  it("accepts valid title", () => {
    const result = validateUpdateContentInput({ title: "My New Video Title" });
    expect(result.valid).toBe(true);
  });

  it("rejects title exceeding 100 characters", () => {
    const longTitle = "a".repeat(101);
    const result = validateUpdateContentInput({ title: longTitle });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/between 1 and 100/i);
  });

  it("rejects title containing '<' or '>' characters", () => {
    const result1 = validateUpdateContentInput({ title: "Bad <Title>" });
    expect(result1.valid).toBe(false);
    expect(result1.error).toMatch(/cannot contain '<' or '>'/i);

    const result2 = validateUpdateContentInput({ title: "Bad > Title" });
    expect(result2.valid).toBe(false);
    expect(result2.error).toMatch(/cannot contain '<' or '>'/i);
  });

  it("accepts valid description and rejects description exceeding 5,000 characters", () => {
    const validDesc = "This is a detailed description of the video.";
    expect(validateUpdateContentInput({ description: validDesc }).valid).toBe(true);

    const longDesc = "b".repeat(5001);
    const result = validateUpdateContentInput({ description: longDesc });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/exceeds maximum allowed limit of 5,000/i);
  });

  it("rejects description containing '<' or '>' characters", () => {
    const result = validateUpdateContentInput({ description: "Contains <script>alert(1)</script>" });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot contain '<' or '>'/i);
  });

  it("validates tags array and total characters <= 500", () => {
    const validTags = ["tech", "coding", "nextjs", "react"];
    expect(validateUpdateContentInput({ tags: validTags }).valid).toBe(true);

    // Cumulative characters exceeding 500
    const longTags = Array.from({ length: 26 }, () => "abcdefghijklmnopqrst"); // 26 * 20 = 520 chars
    const result = validateUpdateContentInput({ tags: longTags });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/exceeds maximum limit of 500 characters/i);
  });

  it("rejects tags containing '<' or '>'", () => {
    const result = validateUpdateContentInput({ tags: ["validTag", "<badTag>"] });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot contain '<' or '>'/i);
  });

  it("validates numeric category ID", () => {
    expect(validateUpdateContentInput({ categoryId: "28" }).valid).toBe(true);
    expect(validateUpdateContentInput({ categoryId: "non-numeric" }).valid).toBe(false);
  });

  it("validates privacy status enum values", () => {
    expect(validateUpdateContentInput({ privacyStatus: "public" }).valid).toBe(true);
    expect(validateUpdateContentInput({ privacyStatus: "unlisted" }).valid).toBe(true);
    expect(validateUpdateContentInput({ privacyStatus: "private" }).valid).toBe(true);
    // @ts-expect-error invalid enum
    expect(validateUpdateContentInput({ privacyStatus: "draft" }).valid).toBe(false);
  });

  it("validates publishAt ISO 8601 string and requires private privacy if privacyStatus supplied", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    expect(validateUpdateContentInput({ publishAt: futureDate, privacyStatus: "private" }).valid).toBe(true);
    expect(validateUpdateContentInput({ publishAt: null }).valid).toBe(true);

    const invalidDate = validateUpdateContentInput({ publishAt: "not-a-date" });
    expect(invalidDate.valid).toBe(false);
    expect(invalidDate.error).toMatch(/valid ISO 8601 date string/i);

    const conflict = validateUpdateContentInput({ publishAt: futureDate, privacyStatus: "public" });
    expect(conflict.valid).toBe(false);
    expect(conflict.error).toMatch(/requires privacyStatus to be 'private'/i);
  });

  it("validates boolean flags (selfDeclaredMadeForKids and containsSyntheticMedia)", () => {
    expect(validateUpdateContentInput({ selfDeclaredMadeForKids: true }).valid).toBe(true);
    expect(validateUpdateContentInput({ selfDeclaredMadeForKids: false }).valid).toBe(true);
    expect(validateUpdateContentInput({ containsSyntheticMedia: true }).valid).toBe(true);
    expect(validateUpdateContentInput({ containsSyntheticMedia: false }).valid).toBe(true);

    // @ts-expect-error invalid type
    expect(validateUpdateContentInput({ selfDeclaredMadeForKids: "yes" }).valid).toBe(false);
    // @ts-expect-error invalid type
    expect(validateUpdateContentInput({ containsSyntheticMedia: "no" }).valid).toBe(false);
  });
});
