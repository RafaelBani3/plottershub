import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryLock } from "./distributed-lock";

describe("Distributed Lock & Lease Ownership", () => {
  let lock: InMemoryLock;

  beforeEach(() => {
    lock = new InMemoryLock();
    vi.useRealTimers();
  });

  describe("J. Lock Expiry & Timeouts", () => {
    it("allows another worker to acquire lock after TTL expires", async () => {
      // Worker 1 acquires lock with short 50ms TTL
      const token1 = await lock.acquire("resource-1", { ttlMs: 50 });
      expect(token1).toBeTruthy();

      // Immediately, Worker 2 cannot acquire lock without timeout
      const token2Immediate = await lock.acquire("resource-1", { timeoutMs: 10, retryIntervalMs: 5 });
      expect(token2Immediate).toBeNull();

      // Wait 60ms for TTL expiration
      await new Promise((r) => setTimeout(r, 60));

      // Worker 2 acquires lock now that Worker 1's lock expired
      const token2AfterExpiry = await lock.acquire("resource-1", { timeoutMs: 50 });
      expect(token2AfterExpiry).toBeTruthy();
      expect(token2AfterExpiry).not.toEqual(token1);
    });
  });

  describe("K. Lock Ownership Mismatch & Stale Release Prevention", () => {
    it("prevents a stale worker from releasing a lock acquired by another worker", async () => {
      // 1. Worker 1 acquires lock with 50ms TTL
      const worker1Token = await lock.acquire("resource-key", { ttlMs: 50 });
      expect(worker1Token).toBeTruthy();

      // 2. Worker 1 takes too long; lock expires after 60ms
      await new Promise((r) => setTimeout(r, 60));

      // 3. Worker 2 acquires the lock with fresh token
      const worker2Token = await lock.acquire("resource-key", { ttlMs: 1000 });
      expect(worker2Token).toBeTruthy();
      expect(worker2Token).not.toEqual(worker1Token);

      // 4. Worker 1 finally finishes and attempts to release lock with its expired worker1Token
      const releaseSuccess = await lock.release("resource-key", worker1Token!);
      // Release must fail because Worker 1 is no longer the owner
      expect(releaseSuccess).toBe(false);

      // 5. Verify Worker 2's lock is still active and untouched
      expect(await lock.isLocked("resource-key")).toBe(true);

      // 6. Worker 2 releases its lock cleanly
      const worker2Release = await lock.release("resource-key", worker2Token!);
      expect(worker2Release).toBe(true);
      expect(await lock.isLocked("resource-key")).toBe(false);
    });
  });

  describe("L. Safe Lock Release & Auto-Renew Lease Heartbeat", () => {
    it("safely executes withLock and releases lock upon completion", async () => {
      let executed = false;
      await lock.withLock("safe-key", async () => {
        expect(await lock.isLocked("safe-key")).toBe(true);
        executed = true;
      });

      expect(executed).toBe(true);
      expect(await lock.isLocked("safe-key")).toBe(false);
    });

    it("automatically extends lock lease for long-running execution", async () => {
      // Long running operation (300ms) with 150ms initial TTL
      await lock.withLock(
        "heartbeat-key",
        async () => {
          // Sleep for 200ms (> 150ms initial TTL)
          await new Promise((r) => setTimeout(r, 200));
          expect(await lock.isLocked("heartbeat-key")).toBe(true);
        },
        { ttlMs: 150, autoExtend: true }
      );

      // After withLock finishes, lock must be released
      expect(await lock.isLocked("heartbeat-key")).toBe(false);
    });
  });
});
