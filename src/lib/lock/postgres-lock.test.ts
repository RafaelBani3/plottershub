import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgresDistributedLock } from "./postgres-lock";
import { PrismaClient } from "@prisma/client";

describe("PostgresDistributedLock Unit Tests", () => {
  let mockPrisma: any;
  let lock: PostgresDistributedLock;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
    };
    lock = new PostgresDistributedLock(mockPrisma as unknown as PrismaClient);
  });

  describe("acquire", () => {
    it("successfully acquires lock and returns a unique token when available", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ key: "test-key" }]);

      const token = await lock.acquire("test-key", { timeoutMs: 0, ttlMs: 15000 });

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("returns null immediately when lock is currently held and timeoutMs is 0", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const token = await lock.acquire("test-key", { timeoutMs: 0 });

      expect(token).toBeNull();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("retries until acquired when timeoutMs > 0 and lock is initially contested", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // First attempt: held
        .mockResolvedValueOnce([{ key: "test-key" }]); // Second attempt: acquired

      const token = await lock.acquire("test-key", {
        timeoutMs: 500,
        retryIntervalMs: 20,
      });

      expect(token).toBeTruthy();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it("times out and returns null when lock remains held past timeoutMs", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const token = await lock.acquire("test-key", {
        timeoutMs: 250,
        retryIntervalMs: 20,
      });

      expect(token).toBeNull();
      expect(mockPrisma.$queryRaw.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("handles database query error gracefully with timeoutMs 0 by returning null", async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("Connection pool timeout"));

      const token = await lock.acquire("test-key", { timeoutMs: 0 });

      expect(token).toBeNull();
    });
  });

  describe("release", () => {
    it("returns true when releasing with correct key and token (deletedCount > 0)", async () => {
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      const result = await lock.release("test-key", "valid-token-123");

      expect(result).toBe(true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("returns false when releasing with mismatching token or expired lease (deletedCount = 0)", async () => {
      mockPrisma.$executeRaw.mockResolvedValueOnce(0);

      const result = await lock.release("test-key", "stale-token-456");

      expect(result).toBe(false);
    });

    it("returns false when database error occurs during release", async () => {
      mockPrisma.$executeRaw.mockRejectedValueOnce(new Error("Database disconnected"));

      const result = await lock.release("test-key", "valid-token");

      expect(result).toBe(false);
    });
  });

  describe("extend (heartbeat)", () => {
    it("returns true when lease is successfully extended for active token", async () => {
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      const result = await lock.extend("test-key", "owner-token", 30000);

      expect(result).toBe(true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("returns false when attempting to extend with wrong token or expired lease", async () => {
      mockPrisma.$executeRaw.mockResolvedValueOnce(0);

      const result = await lock.extend("test-key", "wrong-token", 30000);

      expect(result).toBe(false);
    });

    it("returns false on database error during extension", async () => {
      mockPrisma.$executeRaw.mockRejectedValueOnce(new Error("DB error"));

      const result = await lock.extend("test-key", "token", 30000);

      expect(result).toBe(false);
    });
  });

  describe("isLocked", () => {
    it("returns true when active unexpired lease exists in database", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ key: "test-key" }]);

      const locked = await lock.isLocked("test-key");

      expect(locked).toBe(true);
    });

    it("returns false when no active unexpired lease exists", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const locked = await lock.isLocked("test-key");

      expect(locked).toBe(false);
    });

    it("returns false when query fails", async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("DB query failed"));

      const locked = await lock.isLocked("test-key");

      expect(locked).toBe(false);
    });
  });

  describe("withLock", () => {
    it("executes callback and releases lock upon completion", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ key: "test-key" }]);
      mockPrisma.$executeRaw.mockResolvedValueOnce(1); // For release

      let executed = false;
      const result = await lock.withLock(
        "test-key",
        async () => {
          executed = true;
          return "success-value";
        },
        { autoExtend: false }
      );

      expect(executed).toBe(true);
      expect(result).toBe("success-value");
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("throws error when lock cannot be acquired", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await expect(
        lock.withLock("test-key", async () => "work", { timeoutMs: 0 })
      ).rejects.toThrow("Failed to acquire distributed lock for key 'test-key'");
    });

    it("releases lock even if callback throws an error", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ key: "test-key" }]);
      mockPrisma.$executeRaw.mockResolvedValueOnce(1); // For release

      await expect(
        lock.withLock(
          "test-key",
          async () => {
            throw new Error("Worker failed");
          },
          { autoExtend: false }
        )
      ).rejects.toThrow("Worker failed");

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
