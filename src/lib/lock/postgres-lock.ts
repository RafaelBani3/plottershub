import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { DistributedLock, LockOptions } from "./distributed-lock";

/**
 * PostgreSQL-Backed Atomic Distributed Lock.
 *
 * Designed for multi-instance deployments, container clusters, and serverless environments.
 * Operates over Neon PostgreSQL with PgBouncer connection pooling enabled.
 * Uses atomic INSERT ... ON CONFLICT DO UPDATE WHERE expires_at <= NOW() to guarantee
 * mutual exclusion with zero race conditions.
 */
export class PostgresDistributedLock implements DistributedLock {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Attempts to acquire an exclusive lock for the specified key.
   * If timeoutMs is 0, fails fast immediately.
   * If timeoutMs > 0, retries with polling until timeout expires.
   */
  async acquire(key: string, options: LockOptions = {}): Promise<string | null> {
    const ttlMs = options.ttlMs ?? 15000;
    const timeoutMs = options.timeoutMs ?? 8000;
    const retryIntervalMs = options.retryIntervalMs ?? 100;
    const ownerInfo = options.ownerInfo ?? `pid:${process.pid}`;
    const startTime = Date.now();

    do {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + ttlMs);

      try {
        const rows = await this.prisma.$queryRaw<Array<{ key: string }>>`
          INSERT INTO "distributed_locks" ("key", "token", "expires_at", "owner_info", "created_at", "updated_at")
          VALUES (${key}, ${token}, ${expiresAt}, ${ownerInfo}, NOW(), NOW())
          ON CONFLICT ("key") DO UPDATE
            SET "token" = ${token},
                "expires_at" = ${expiresAt},
                "owner_info" = ${ownerInfo},
                "updated_at" = NOW()
            WHERE "distributed_locks"."expires_at" <= NOW()
          RETURNING "key"
        `;

        if (rows && rows.length > 0) {
          return token;
        }
      } catch {
        // If deadlock or transient connection error occurs, retry if within timeout
        if (timeoutMs === 0) {
          return null;
        }
      }

      if (timeoutMs === 0 || Date.now() - startTime >= timeoutMs) {
        break;
      }

      // Add slight jitter (0-20ms) to avoid lock contention synchronized thundering herd
      const jitter = Math.floor(Math.random() * 20);
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs + jitter));
    } while (Date.now() - startTime <= timeoutMs);

    return null;
  }

  /**
   * Releases the lock safely.
   * Stale release guard: Deletes ONLY if the key and token match the currently held lease.
   */
  async release(key: string, token: string): Promise<boolean> {
    try {
      const deletedCount = await this.prisma.$executeRaw`
        DELETE FROM "distributed_locks"
        WHERE "key" = ${key} AND "token" = ${token}
      `;
      return deletedCount > 0;
    } catch {
      return false;
    }
  }

  /**
   * Extends an active lock lease (heartbeat).
   * Renews expires_at ONLY if the caller is the current active owner and lease has not expired.
   */
  async extend(key: string, token: string, additionalTtlMs?: number): Promise<boolean> {
    const extensionMs = additionalTtlMs ?? 15000;
    const newExpiresAt = new Date(Date.now() + extensionMs);

    try {
      const updatedCount = await this.prisma.$executeRaw`
        UPDATE "distributed_locks"
        SET "expires_at" = ${newExpiresAt},
            "updated_at" = NOW()
        WHERE "key" = ${key}
          AND "token" = ${token}
          AND "expires_at" > NOW()
      `;
      return updatedCount > 0;
    } catch {
      return false;
    }
  }

  /**
   * Checks whether the lock is currently held by an unexpired lease.
   */
  async isLocked(key: string): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ key: string }>>`
        SELECT "key" FROM "distributed_locks"
        WHERE "key" = ${key} AND "expires_at" > NOW()
        LIMIT 1
      `;
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Executes an asynchronous callback while holding the distributed lock.
   * Automatically starts a heartbeat timer if autoExtend is true (default).
   * Guaranteed release in finally block.
   */
  async withLock<T>(key: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
    const token = await this.acquire(key, options);
    if (!token) {
      throw new Error(`Failed to acquire distributed lock for key '${key}' within timeout.`);
    }

    const autoExtend = options.autoExtend ?? true;
    const ttlMs = options.ttlMs ?? 15000;
    let heartbeatTimer: NodeJS.Timeout | null = null;

    if (autoExtend) {
      const heartbeatInterval = Math.max(50, Math.floor(ttlMs / 3));
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
}
