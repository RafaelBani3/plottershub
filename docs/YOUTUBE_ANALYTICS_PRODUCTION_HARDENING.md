# YouTube Analytics Production Hardening

## 1. Overview

Phase 3.3G provides end-to-end production hardening for the YouTube Analytics synchronization pipeline in Plottershub. The primary objective is to guarantee multi-instance reliability, strict concurrency control, safe scheduler execution, robust quota enforcement, and tenant isolation using PostgreSQL infrastructure without introducing complex or heavy external dependencies such as Redis or BullMQ.

The hardening architecture ensures:
- **Mutual exclusion**: Concurrent manual and scheduled sync operations for the same social account cannot run concurrently.
- **Fail-safe scheduling**: Bounded batch size, sequential account execution, and per-account fault isolation prevent runaway loops or cascading failures.
- **Graceful degradation**: Controlled quota budgets and partial success handling allow critical metrics to be stored even if auxiliary distribution breakdowns are skipped or rate-limited.
- **Defensive security**: Constant-time cron secret authentication, zero token/secret logging in telemetry, and tenant-scoped database lookups prevent credential leakage and cross-tenant data access.

---

## 2. Scheduler Architecture

The automated synchronization scheduler is implemented as an authenticated Next.js API route that processes overdue accounts in deterministic, bounded batches.

- **Cron Route**: Exposed at `/api/cron/youtube-analytics-sync` supporting both `GET` and `POST` HTTP methods for compatibility with Vercel Cron, external cron daemons, and cloud scheduler workers.
- **Authentication**: Protected by `verifyCronSecret()` verifying the incoming `Authorization: Bearer <CRON_SECRET>` header.
- **Bounded Batch Size**: Bounded to a maximum of 5 accounts per execution (`BATCH_LIMIT = 5`) to prevent execution timeouts in serverless and containerized deployment environments.
- **Eligible-Account Selection**: Discovers YouTube accounts using strict filtering:
  - Platform code matches `"YOUTUBE"` (`platform.code = "YOUTUBE"`).
  - Account status is eligible (`status IN ("CONNECTED", "HEALTHY", "WARNING")`). Accounts in `REAUTH_REQUIRED`, `DISCONNECTED`, or `TOKEN_EXPIRED` states are strictly excluded.
  - Sync freshness rule: `lastSyncedAt IS NULL` (never synced) or `lastSyncedAt < NOW() - 24 hours` (due for refresh).
  - Deterministic priority ordering: Ordered by `lastSyncedAt ASC NULLS FIRST` so the stalest accounts are always serviced first.
- **Sequential Execution**: Discovered accounts are processed sequentially in a single loop rather than in parallel to avoid thundering-herd spikes against database connection pools and Google API quotas.
- **Per-Account Fault Isolation**: Each account synchronization is wrapped in an individual `try...catch` block. If an account encounters an error (transient network glitch, rate limit, or permanent revocation) or is skipped due to lock contention, the failure is recorded in the batch summary (`processed` array) and processing immediately proceeds to the next account without aborting the batch.
- **Manual vs Scheduled Execution**:
  - **Manual Sync** (`POST /api/social/youtube/sync`): Triggered by an authenticated user session. Enforces workspace membership, role permissions (`social_accounts:manage`), and sets `triggerMode: "MANUAL"`. Runs both `DAILY` and `BACKFILL` modes.
  - **Scheduled Sync** (`/api/cron/youtube-analytics-sync`): Triggered by scheduler with `CRON_SECRET`. Runs `DAILY` mode with `triggerMode: "SCHEDULED"`.
  - Both pathways call the exact same `YouTubeAnalyticsSyncService.sync()` engine and share the unified distributed lock namespace.

---

## 3. Lock Architecture

Distributed locking guarantees that no two workers or serverless instances synchronize the same account simultaneously.

- **`DistributedLock` Interface**: Defined in `src/lib/lock/distributed-lock.ts` establishing the contract for `acquire()`, `release()`, `extend()`, `isLocked()`, and `withLock()`.
- **`PostgresDistributedLock`**: The production implementation (`src/lib/lock/postgres-lock.ts`) backed by PostgreSQL table `distributed_locks`. Designed for multi-instance deployments and fully compatible with Neon PostgreSQL and PgBouncer transaction pooling (unlike session-level `pg_advisory_lock` which is unsafe across connection poolers). Uses atomic SQL `INSERT ... ON CONFLICT ("key") DO UPDATE ... WHERE expires_at <= NOW()` to guarantee race-free mutual exclusion.
- **`InMemoryLock` for Tests**: An in-memory Map implementation (`src/lib/lock/distributed-lock.ts`) providing identical concurrency semantics and ownership tracking for fast, deterministic unit and integration test suites.
- **Unified Lock Key**: Both manual and scheduled sync strictly use:
  ```
  social-analytics-sync:${socialAccountId}
  ```
  Manual and scheduled synchronizations share this identical namespace. If manual sync is executing, scheduled sync receives lock contention, and vice versa.
- **Ownership Token**: A unique cryptographic UUID (`crypto.randomUUID()`) is generated upon each successful acquisition and stored in the `token` column.
- **Lease**: The default TTL for analytics sync is 120,000ms (120 seconds).
- **Heartbeat**: During active synchronization, an automated background timer executes every 20 seconds, calling `lock.extend(lockKey, lockToken, 120000)` to renew the lease until work completes.
- **Safe Release**: Lock release executes in a `finally` block using atomic token matching:
  ```sql
  DELETE FROM "distributed_locks" WHERE "key" = $1 AND "token" = $2;
  ```
  If a worker's lease expired and was claimed by a new owner, the stale worker cannot delete the new owner's lock.
- **Stale Lock Recovery**: If an instance crashes while holding a lock, the row remains in `distributed_locks`. Subsequent callers attempting acquisition will trigger `ON CONFLICT DO UPDATE ... WHERE expires_at <= NOW()`, atomically reclaiming the expired lease.
- **`timeoutMs = 0` Behavior**: In `analytics-sync.service.ts`, lock acquisition uses `timeoutMs: 0` (fail-fast). If the lock is held, `acquire()` returns `null` immediately without entering a polling loop. The service logs `ANALYTICS_SYNC_LOCKED` and throws `SocialError` (`SOCIAL_REFRESH_LOCKED`, HTTP 409) with `retryable: true`. In scheduled cron, this is caught and mapped to `SKIPPED_LOCKED`.

---

## 4. SyncJob Lifecycle

Every analytics synchronization execution is tracked through the `SyncJob` model in Prisma.

- **State Transitions**:
  ```
  PENDING → PROCESSING → COMPLETED
                      ↘ FAILED
  ```
- **Atomic Processing Transition**:
  When transitioning from `PROCESSING` to `COMPLETED` or `FAILED`, the service uses conditional atomic updates:
  ```typescript
  prisma.syncJob.updateMany({
    where: { id: syncJobId, status: "PROCESSING" },
    data: { status: "COMPLETED", completedAt: completedTime, metadata: ... }
  });
  ```
  This guarantees that a slow or timed-out worker whose job was already recovered as `FAILED` cannot overwrite the terminal state back to `COMPLETED`.
- **Duplicate Prevention**: Distributed lock acquisition precedes `SyncJob.create()`, ensuring only one active job exists for an account at any given instant.
- **Stale PROCESSING Recovery**: Implemented via `YouTubeAnalyticsSyncService.recoverStaleProcessingJobs(thresholdMinutes = 15)`. It atomically reclaims lingering jobs:
  ```typescript
  prisma.syncJob.updateMany({
    where: {
      jobType: "SYNC_ANALYTICS",
      status: "PROCESSING",
      startedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
    },
    data: {
      status: "FAILED",
      errorCode: "SYNC_JOB_TIMEOUT",
      errorMessage: "Sync job timed out in PROCESSING state and was recovered.",
    },
  });
  ```
- **Timeout Behavior**: The stale job recovery runs automatically at the very beginning of each scheduled cron invocation before new accounts are discovered.

---

## 5. Retry Ownership

To prevent retry amplification and cascading thundering herds, retry responsibilities are strictly separated across three non-overlapping architectural layers:

### Layer 1: YouTube Analytics API Client (`YouTubeAnalyticsApiClient`)
- **Scope**: Low-level HTTP communication with Google APIs.
- **Owned Errors**: Transient network blips, HTTP 429 (Rate Limit Exceeded), and HTTP 5xx (500, 502, 503, 504).
- **Mechanism**: Bounded exponential backoff with random jitter (maximum 3 attempts, base backoff 1000ms).
- **Boundary**: Does not refresh tokens and does not loop over analytics patterns.

### Layer 2: Token / Sync Service (`SocialTokenManager` & `YouTubeAnalyticsSyncService`)
- **Scope**: Authentication lifecycle and session validity during synchronization.
- **Owned Errors**: HTTP 401 Unauthorized during report execution.
- **Mechanism**: Forces token refresh exactly once via `tokenManager.getValidAccessToken(socialAccountId, { forceRefresh: true })`. If the refreshed token succeeds, report execution continues. If the refresh fails or a second 401 occurs, it aborts immediately.
- **Boundary**: Does not perform multi-step backoff retries (Layer 1 already handled transient HTTP retries).

### Layer 3: Scheduler (`/api/cron/youtube-analytics-sync`)
- **Scope**: Batch orchestration and account scheduling.
- **Owned Errors**: None. The scheduler does **NOT** retry failed accounts.
- **Mechanism**: Per-account fault isolation. If `sync()` throws an error, the scheduler logs the failure, records status `FAILED` in the batch response, and proceeds to the next account.
- **Lock Contention**: Mapped to `SKIPPED_LOCKED` without raising an error.
- **Permanent Auth Failure**: When an account transitions to `REAUTH_REQUIRED`, the scheduler does not retry it, and subsequent scheduler discovery runs automatically exclude it.

---

## 6. Token Failure Classification

Token refresh and API errors are classified by `isPermanentTokenRefreshError()` in `src/modules/social/token-manager.ts` into permanent and transient categories:

### Permanent Errors
Errors indicating that credentials have been revoked, expired beyond renewal, or authorization has been altered:
- `invalid_grant` (refresh token revoked, expired, or user changed password)
- `revoked` (explicit token revocation)
- `unauthorized_client` (client mismatch or project configuration error)
- `invalid_client` (credentials invalid)
- `account_disabled`
- `access_denied`
- HTTP 400 Bad Request, HTTP 401 Unauthorized, and other non-429 4xx responses.
- **Action**: The account's status is updated to `REAUTH_REQUIRED`, `ANALYTICS_SYNC_REAUTH_REQUIRED` is logged, and sync halts. The account is excluded from future cron discovery until the user re-authorizes.

### Transient Errors
Errors indicating temporary network or remote provider infrastructure degradation:
- HTTP 429 Too Many Requests
- HTTP 500 Internal Server Error
- HTTP 502 Bad Gateway
- HTTP 503 Service Unavailable
- HTTP 504 Gateway Timeout
- Network timeouts (`ETIMEDOUT`), connection resets (`ECONNRESET`), connection refused (`ECONNREFUSED`), host unreachable (`EHOSTUNREACH`), DNS resolution failures (`ENOTFOUND`), and generic `fetch failed`.
- **Action**: The account's status is preserved (e.g. `HEALTHY` or `CONNECTED`), `lastError` is updated for diagnostic visibility, `TOKEN_REFRESH_FAILED` or `ANALYTICS_SYNC_FAILED` audit event is emitted, and a retryable error is thrown.

---

## 7. Quota Policy

Plottershub applies an application-level quota policy to prevent synchronization from exhausting Google YouTube Analytics API quota limits:

- **Configurable `maxRequestsBudget`**: Default budget is 100 requests per sync run (`options.maxRequestsBudget ?? 100`), passed into `YouTubeAnalyticsSyncService.sync()`.
- **Safe Exhaustion Behavior**: Monitored before every query pattern execution using `canProceedWithBudget(patternName)`. When `totalRequestCount >= maxBudget`:
  - Remaining query patterns are skipped.
  - `status: "SKIPPED_BUDGET"` is recorded for skipped patterns.
  - A structured warning is appended to `warnings`.
  - No further API requests are sent to the provider.
- **Structured Telemetry**: An `ANALYTICS_QUOTA_EXHAUSTED` audit event is logged once per sync with the budget limit and job ID.
- **Preserved Completion**: When the budget is exhausted after critical queries have succeeded, the `SyncJob` is completed with status `COMPLETED` (with warnings), rather than being marked as `FAILED`.
- **Dynamic Policy**: Does not rely on hardcoded historical quota assumptions; the budget is configurable per execution or environment.

---

## 8. Partial Success

YouTube Analytics synchronizations retrieve multiple distinct query patterns. The service categorizes patterns into critical and non-critical tiers:

### Critical Pattern
- **`CHANNEL_DAILY_OVERVIEW`**: Fetches foundational daily channel-level metrics (views, watch time, subscribers, likes, comments, shares).
- If this critical query fails, the sync cannot produce valid core time-series data; the entire sync operation aborts, marking the `SyncJob` as `FAILED`.

### Non-Critical Patterns
- **`TOP_VIDEOS_PERFORMANCE`**: Top performing video identifiers.
- **`VIDEO_DAILY_TIME_SERIES`**: Daily video-level metrics for top videos.
- **`VIEWER_DEMOGRAPHICS`**: Audience age group and gender breakdown.
- **`GEOGRAPHIC_DISTRIBUTION`**: Audience geographic distribution by country.
- **`TRAFFIC_SOURCE_DISTRIBUTION`**: Traffic sources (search, suggested, external, etc.).
- **`DEVICE_DISTRIBUTION`**: Device types and operating systems.

### Warning & Completion Representation
When a non-critical pattern fails (due to insufficient channel data, quota budget exhaustion, or schema incompatibility), the error is caught locally. A descriptive warning is added to `warnings` (e.g. `"VIEWER_DEMOGRAPHICS failed: ..."`), the pattern status is recorded as `FAILED` or `SKIPPED_BUDGET` in `patternResultsSummary`, and sync continues.
Upon completion:
- `SyncJob.status` is set to `COMPLETED`.
- `SyncJob.errorMessage` stores a JSON string of warnings and execution totals.
- `SyncJob.metadata` contains the complete `patternResultsSummary`.
- `SocialAccount.lastSyncedAt` is updated to the completion time.

---

## 9. Stale Job Recovery

To prevent jobs from remaining stuck in `PROCESSING` if a worker crashes, serverless execution times out, or node restarts occur:

- **Threshold**: Defaults to 15 minutes (`thresholdMinutes = 15`).
- **Detection**: Identifies jobs with:
  ```typescript
  where: {
    jobType: "SYNC_ANALYTICS",
    status: "PROCESSING",
    startedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
  }
  ```
- **Atomic Recovery**: Uses `prisma.syncJob.updateMany()` to transition all matching records to:
  - `status: "FAILED"`
  - `errorCode: "SYNC_JOB_TIMEOUT"`
  - `errorMessage: "Sync job timed out in PROCESSING state and was recovered."`
- **Scheduler Invocation**: Automatically executed as Step 2 of `/api/cron/youtube-analytics-sync` before account discovery runs.

---

## 10. Audit Events

All key lifecycle events are recorded through `logAuditEvent()` in `src/modules/audit/audit-service.ts`:

| Action | Emitted When | Details Captured |
| :--- | :--- | :--- |
| `ANALYTICS_SYNC_STARTED` | Lock acquired, `SyncJob` created | `provider`, `syncJobId`, `mode`, `triggerMode` |
| `ANALYTICS_SYNC_COMPLETED` | Observations persisted, job finished | `provider`, `syncJobId`, `mode`, `triggerMode`, `requestCount`, `observationCount`, `durationMs`, `warnings` |
| `ANALYTICS_SYNC_FAILED` | Unrecoverable error during sync | `provider`, `syncJobId`, `mode`, `triggerMode`, `durationMs`, `error`, `errorCode` |
| `ANALYTICS_SYNC_LOCKED` | Concurrency lock contention detected | `provider`, `reason: "Concurrent analytics sync in progress"` |
| `ANALYTICS_QUOTA_EXHAUSTED` | Application request budget reached | `provider`, `syncJobId`, `budget`, `message` |
| `ANALYTICS_SYNC_REAUTH_REQUIRED` | Permanent auth failure occurs | `provider`, `error`, `errorCode` |
| `TOKEN_REFRESHED` | Token successfully refreshed | `provider`, `expiresAt` |
| `TOKEN_REFRESH_FAILED` | Token refresh fails | `provider`, `error`, `isPermanent` |

> **Security Rule**: Tokens, client secrets, bearer credentials, and private keys are **never** logged in audit event details or console logs.

---

## 11. Cron Security

Scheduled cron endpoints are secured against unauthorized access and timing attacks:

- **Bearer Token Authentication**: The caller must provide an `Authorization: Bearer <CRON_SECRET>` header matching the server's `CRON_SECRET` environment variable.
- **Constant-Time Comparison**: Implemented in `src/lib/auth/cron-auth.ts`:
  ```typescript
  const expectedHash = crypto.createHash("sha256").update(cronSecret).digest();
  const actualHash = crypto.createHash("sha256").update(providedToken).digest();
  return crypto.timingSafeEqual(expectedHash, actualHash);
  ```
  Both strings are hashed using SHA-256 to ensure fixed-length byte buffers before comparison via `crypto.timingSafeEqual`, preventing timing attacks regardless of string length.
- **Fail-Closed Behavior**: If `CRON_SECRET` is unset, null, empty string, or whitespace in the environment, `verifyCronSecret()` immediately returns `false`.
- **Zero Credential Exposure**: The cron secret is never reflected in error messages, JSON responses, or system logs.

---

## 12. Why Redis/BullMQ Is Deferred

Phase 3.3G deliberately defers Redis and BullMQ to Phase 4 for well-defined architectural reasons:

1. **Adequacy of PostgreSQL Distributed Locks**:
   - The PostgreSQL-backed `PostgresDistributedLock` uses atomic `INSERT ... ON CONFLICT DO UPDATE WHERE expires_at <= NOW()`, offering identical mutual-exclusion and lease-expiration guarantees as Redis Redlock for multi-instance deployments.
   - It operates natively on Neon PostgreSQL and works reliably with PgBouncer transaction-mode connection poolers.
2. **Batch Scale & Workload Characteristics**:
   - YouTube Analytics sync runs at 24-hour intervals per channel with a bounded batch limit (5 accounts per run).
   - The volume does not justify running, monitoring, securing, and paying for a separate Redis cluster at this stage.
3. **Operational Simplicity & Single Source of Truth**:
   - PostgreSQL maintains atomic transaction integrity across locks, `sync_jobs`, `social_accounts`, and `analytics_observations`.
   - Eliminating an external queue avoids dual-write consistency hazards, network partition handling between Postgres and Redis, and additional operational failure points.
4. **Clean Upgrade Path to Phase 4**:
   - The `DistributedLock` abstraction cleanly decouples the locking interface from its storage engine. In Phase 4, `RedisDistributedLock` can be swapped in without modifying any analytics sync business logic.
