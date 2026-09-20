import crypto from "crypto";

export interface LockOptions {
  ttlMs?: number; // Time-to-live before automatic release (default: 15,000ms)
  timeoutMs?: number; // Time to wait trying to acquire lock (default: 8,000ms)
  retryIntervalMs?: number; // Polling retry interval (default: 100ms)
  autoExtend?: boolean; // Automatically extend lock lease during long execution (default: true)
  ownerInfo?: string; // Optional metadata regarding the process holding the lock
}

export interface DistributedLock {
  acquire(key: string, options?: LockOptions): Promise<string | null>;
  release(key: string, token: string): Promise<boolean>;
  extend(key: string, token: string, additionalTtlMs?: number): Promise<boolean>;
  isLocked(key: string): Promise<boolean>;
  withLock<T>(key: string, fn: () => Promise<T>, options?: LockOptions): Promise<T>;
}

/**
 * In-Memory Distributed Lock implementation with ownership verification,
 * safe release, and automatic lease renewal (heartbeat).
 * Used for development, testing, and single-instance worker processes.
 */
export class InMemoryLock implements DistributedLock {
  private locks = new Map<string, { token: string; expiresAt: number; ttlMs: number }>();

  async acquire(key: string, options: LockOptions = {}): Promise<string | null> {
    const ttlMs = options.ttlMs ?? 15000;
    const timeoutMs = options.timeoutMs ?? 8000;
    const retryIntervalMs = options.retryIntervalMs ?? 50;
    const startTime = Date.now();
    const token = crypto.randomUUID();

    do {
      const now = Date.now();
      const current = this.locks.get(key);

      if (!current || current.expiresAt <= now) {
        this.locks.set(key, { token, expiresAt: now + ttlMs, ttlMs });
        return token;
      }

      if (Date.now() - startTime >= timeoutMs) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    } while (Date.now() - startTime <= timeoutMs);

    return null; // Timed out acquiring lock
  }

  async release(key: string, token: string): Promise<boolean> {
    const current = this.locks.get(key);
    if (!current) return true;

    // Protection against stale release: only the owner who acquired the lock can release it
    if (current.token === token) {
      this.locks.delete(key);
      return true;
    }

    // Token mismatch: lock has expired and been acquired by another worker
    return false;
  }

  async extend(key: string, token: string, additionalTtlMs?: number): Promise<boolean> {
    const current = this.locks.get(key);
    if (!current) return false;

    if (current.token === token) {
      const extension = additionalTtlMs ?? current.ttlMs;
      current.expiresAt = Date.now() + extension;
      return true;
    }

    return false;
  }

  async isLocked(key: string): Promise<boolean> {
    const current = this.locks.get(key);
    if (!current) return false;
    return current.expiresAt > Date.now();
  }

  async withLock<T>(key: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
    const token = await this.acquire(key, options);
    if (!token) {
      throw new Error(`Failed to acquire distributed lock for key '${key}' within timeout.`);
    }

    const autoExtend = options.autoExtend ?? true;
    const ttlMs = options.ttlMs ?? 15000;
    let heartbeatTimer: NodeJS.Timeout | null = null;

    if (autoExtend) {
      const heartbeatInterval = Math.max(20, Math.floor(ttlMs / 3));
      heartbeatTimer = setInterval(async () => {
        const extended = await this.extend(key, token, ttlMs);
        if (!extended && heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }
      }, heartbeatInterval);
    }

    try {
      return await fn();
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      await this.release(key, token).catch(() => {});
    }
  }

  clearAll(): void {
    this.locks.clear();
  }
}

export { PostgresDistributedLock } from "./postgres-lock";
import { PostgresDistributedLock } from "./postgres-lock";

// Global default lock singleton (PostgreSQL-backed for multi-instance production)
export const defaultLock: DistributedLock = new PostgresDistributedLock();
