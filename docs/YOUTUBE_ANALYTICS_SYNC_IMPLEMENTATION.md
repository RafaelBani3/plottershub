# YouTube Analytics Sync Implementation (Phase 3.3D)

## Overview

The `YouTubeAnalyticsSyncService` orchestrates the synchronization of YouTube Analytics data into Plottershub's normalized persistence layer (`AnalyticsObservation` via `AnalyticsRepository`). It links social accounts, distributed concurrency controls, security boundaries, query planning, HTTP reporting, transformation, batch persistence, and structured audit logs.

The service provides two primary modes of operation:
1. **Daily Incremental Sync (`DAILY`)**: Synchronizes channel overview, top video metrics, daily time series for prioritized videos, and audience/device/traffic distributions across bounded recent windows.
2. **Historical Backfill (`BACKFILL`)**: Performs a deterministic 90-day backfill divided into 3 sequential, non-overlapping slices (`[T-90, T-61]`, `[T-60, T-31]`, `[T-30, availableEndDate]`), committing progress per slice to guarantee resumability without rolling back prior work.

---

## Architecture

The orchestration pipeline follows a strict unidirectional data flow where each component maintains single-responsibility isolation:

```
SocialAccount (Workspace Verified)
        ↓
YouTubeAnalyticsSyncService (Orchestrator)
        ↓
DistributedLock (social-analytics-sync:${socialAccountId})
        ↓
SyncJob (SYNC_ANALYTICS: PENDING → PROCESSING → COMPLETED / FAILED)
        ↓
SocialTokenManager (Sanitized Access Token, 401 Force Refresh)
        ↓
YouTubeAnalyticsPlanner (Validation, Lag Clamping, Parameter Construction)
        ↓
YouTubeAnalyticsApiClient (HTTP Execution, Exponential Backoff)
        ↓
YouTubeAnalyticsMapper (Normalization into AnalyticsObservation)
        ↓
AnalyticsRepository (Bounded Batch Persistence [Batch Size = 100], Upsert Idempotency)
        ↓
Neon PostgreSQL (analytics_observations, composite workspace foreign keys)
```

### Component Boundaries
- **Sync Service**: Decides *what* patterns to run, manages execution sequencing, enforces application request budgets, handles partial success, and releases locks safely.
- **Query Planner (`YouTubeAnalyticsPlanner`)**: Source of truth for validating metrics/dimensions and calculating lag windows. Sync service does *not* build raw Analytics API query strings.
- **API Client (`YouTubeAnalyticsApiClient`)**: Manages HTTP execution, rate limit retries, backoff, and pagination. Sync service does *not* duplicate HTTP retry loops.
- **Mapper (`YouTubeAnalyticsMapper`)**: Transforms YouTube Analytics API row formats into normalized, provider-agnostic `AnalyticsObservation` records.
- **Repository (`AnalyticsRepository`)**: Guarantees atomic transaction boundaries, bounded batches (100 rows), and canonical identity hash generation.

---

## Daily Sync

Daily sync runs on an incremental schedule (e.g. daily background job or manual trigger) targeting data through the maximum available analytics date (`availableEndDate`):

$$\text{availableEndDate} = \text{currentDate} - \text{analyticsDataLagDays (default 2)}$$

### Execution Windows
- **Channel Daily Overview**: $[T-7, \text{availableEndDate}]$ with daily granularity.
- **Top Videos Performance**: $[T-30, \text{availableEndDate}]$ aggregate window.
- **Video Daily Time Series**: $[T-7, \text{availableEndDate}]$ daily granularity for selected videos.
- **Viewer Demographics**: $[T-30, \text{availableEndDate}]$ aggregate window.
- **Geographic Distribution**: $[T-30, \text{availableEndDate}]$ aggregate window.
- **Traffic Source Distribution**: $[T-30, \text{availableEndDate}]$ aggregate window.
- **Device Distribution**: $[T-30, \text{availableEndDate}]$ aggregate window.

All dates are computed using an injectable `Clock` abstraction (`defaultSystemClock`) to guarantee deterministic date arithmetic during test runs without relying on ambient system clocks.

---

## Historical Backfill

Historical backfill syncs up to 90 days of metrics. Rather than sending a monolithic 90-day query (which risks timeouts, pagination limits, and total loss upon failure), the service splits the timeline into three sequential, non-overlapping slices:

1. **Slice 1**: $[T-90, T-61]$
2. **Slice 2**: $[T-60, T-31]$
3. **Slice 3**: $[T-30, \text{availableEndDate}]$

### Resumability & Partial Progress
- Each slice executes the full pattern pipeline, normalizes, and persists observations in its own database transactions.
- If Slice 1 succeeds and Slice 2 fails, observations from Slice 1 remain permanently persisted in Neon PostgreSQL.
- Slices do not overlap, eliminating redundant API calls and unnecessary quota consumption.

---

## Query Patterns

The service supports all seven approved product-level query patterns:

| Pattern | Granularity | Dimensions | Primary Metrics | Failure Classification |
|---|---|---|---|---|
| `CHANNEL_DAILY_OVERVIEW` | `DAY` | `day` | views, redViews, comments, likes, dislikes, shares, estimatedMinutesWatched, averageViewDuration, subscribersGained, subscribersLost | **CRITICAL** |
| `TOP_VIDEOS_PERFORMANCE` | `ALL` | `video` | views, estimatedMinutesWatched, averageViewDuration, likes, comments, shares | **HIGH** |
| `VIDEO_DAILY_TIME_SERIES` | `DAY` | `day`, filter: `video=={id}` | views, estimatedMinutesWatched, averageViewDuration, likes, comments, shares, subscribersGained | **NON-CRITICAL** |
| `VIEWER_DEMOGRAPHICS` | `ALL` | `ageGroup`, `gender` | viewerPercentage | **NON-CRITICAL** |
| `GEOGRAPHIC_DISTRIBUTION` | `ALL` | `country` | views, estimatedMinutesWatched, likes, subscribersGained | **NON-CRITICAL** |
| `TRAFFIC_SOURCE_DISTRIBUTION` | `ALL` | `insightTrafficSourceType` | views, estimatedMinutesWatched | **NON-CRITICAL** |
| `DEVICE_DISTRIBUTION` | `ALL` | `deviceType` | views, estimatedMinutesWatched | **NON-CRITICAL** |

---

## Video Selection

To eliminate the risk of an $O(N)$ API request explosion, `VIDEO_DAILY_TIME_SERIES` is never executed for all channel videos.

### Selection Strategy
1. **Top Performers**: Retrieve top videos from `TOP_VIDEOS_PERFORMANCE` sorted by views descending (default `topVideosLimit = 10`).
2. **Recent Uploads**: Query database for videos published within the last 14 days (`recentVideoDays = 14`).
3. **Deduplication & Sorting**: Merge both lists, deduplicate by `videoId`, and sort lexicographically to guarantee deterministic execution order across multiple runs.
4. **Explicit Override (`videoIds`)**: When an explicit list of video IDs is passed:
   - Verifies each video belongs to the authenticated `socialAccountId`.
   - Rejects unverified or foreign video IDs with `SYNC_INVALID_VIDEOS`.
   - Deduplicates and deterministically sorts verified IDs.
5. **Circuit Breaker on Failure**: If `TOP_VIDEOS_PERFORMANCE` fails and no explicit `videoIds` were provided, `VIDEO_DAILY_TIME_SERIES` is automatically skipped to prevent unconstrained queries.

---

## Quota Policy

> [!IMPORTANT]
> **Application Request Safety Budget is NOT YouTube's Official Quota.**
> The YouTube Analytics API does not publish a standard fixed request-per-day quota like the YouTube Data API v3 (10,000 units/day). The `maxRequestsBudget` parameter (default `100`) is strictly an **internal application guardrail** to prevent runaway loops or budget exhaustion in multi-tenant environments.

### Enforcement Mechanism
- The sync engine tracks every API request issued.
- Before initiating any pattern (or video time-series item), the remaining budget is checked:
  $$\text{remainingBudget} = \text{maxRequestsBudget} - \text{requestsIssued}$$
- If executing a pattern would exceed `maxRequestsBudget`:
  - Execution stops immediately.
  - The pattern is marked `SKIPPED_BUDGET`.
  - An `ANALYTICS_QUOTA_EXHAUSTED` audit event is emitted.
  - All previously persisted observations are retained.
  - Sync completes with structured partial warning status.

---

## Locking

Concurrent sync operations for the same social account are prevented using `DistributedLock`:

- **Lock Key**: `social-analytics-sync:${socialAccountId}`
- **TTL**: 120 seconds.
- **Heartbeat Interval**: 20 seconds.
- **Acquire Timeout**: 0 seconds (fail fast).

### Safety Guarantees
- If another sync holds the lock, the service fails fast with `locked: true`, `isRetryable: true`, and emits `ANALYTICS_SYNC_LOCKED` audit log without creating orphaned `SyncJob` records.
- Lock release uses ownership verification tokens (`lock.release()`), ensuring a node cannot accidentally release a lock whose lease has expired and been acquired by another instance.
- The lock is unconditionally released in a `finally` block even when unexpected errors, re-auth triggers, or network aborts occur.

---

## SyncJob

The service lifecycle is mapped to the Prisma `SyncJob` entity:
- **Type**: `JobType.SYNC_ANALYTICS`
- **Transitions**:
  - `PENDING` $\rightarrow$ `PROCESSING` upon lock acquisition and parameter validation.
  - `PROCESSING` $\rightarrow$ `COMPLETED` upon overall success or non-critical partial success.
  - `PROCESSING` $\rightarrow$ `FAILED` upon critical pattern failure or fatal system errors.

### Representation of Partial Success
The Prisma `JobStatus` enum does not contain a `PARTIAL` status (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`). Conforming to domain rules:
- Non-critical pattern failures mark the `SyncJob` as `COMPLETED`.
- Structured execution summaries (failed patterns, warnings, request counts) are serialized to JSON in `SyncJob.errorMessage` and recorded in `AuditLog`.

---

## Partial Success & Failure Priority

Pattern failures are strictly classified to determine overall job health:

1. **CRITICAL (`CHANNEL_DAILY_OVERVIEW`)**:
   - If this pattern fails, the entire sync fails (`JobStatus.FAILED`). Channel-level totals are fundamental to dashboard integrity.
2. **HIGH (`TOP_VIDEOS_PERFORMANCE`)**:
   - If top videos retrieval fails, automatic video time-series sync is bypassed, but the job continues for audience distributions.
3. **NON-CRITICAL (`VIDEO_DAILY_TIME_SERIES`, Distributions)**:
   - If demographic, device, traffic source, or individual video queries fail, they are recorded as `FAILED` with specific error codes.
   - The overall job status remains `COMPLETED` with warnings.

---

## Error Handling

| Scenario | Service Behavior | Result Status |
|---|---|---|
| **HTTP 401 (Expired Token)** | Triggers `SocialTokenManager.getValidAccessToken({ forceRefresh: true })` and retries the pattern once. If retry fails, flags `REAUTH_REQUIRED`. | `REAUTH_REQUIRED` / `FAILED` |
| **HTTP 403 (Revoked / Insufficient Scope)** | Marks account disconnected or flagging re-auth; records `ANALYTICS_SYNC_REAUTH_REQUIRED` audit event. | `REAUTH_REQUIRED` |
| **HTTP 429 (Rate Limit)** | Handled transparently by `YouTubeAnalyticsApiClient` exponential backoff. If retry budget exhausted, marks pattern failed. | `FAILED` |
| **HTTP 5xx / Network Error** | Handled by `YouTubeAnalyticsApiClient` bounded retries. | `FAILED` |
| **Empty Analytics Response** | YouTube returned empty rows (new channels or zero activity). Processed normally without error. | `EMPTY` |
| **Privacy Threshold (NULLs)** | Preserved as `null` in metrics JSONB and relational columns (not coerced to 0). | `SUCCESS` |

---

## Persistence

All persistence is delegated directly to `AnalyticsRepository`:
- **Direct Prisma updates of `AnalyticsObservation` within the sync service are strictly prohibited.**
- **Bounded Batches**: Observations are committed in batches of 100 rows (`BATCH_SIZE = 100`).
- **Batch Isolation**: Each backfill slice has its own persistence boundary, committing before proceeding to subsequent slices.

---

## Idempotency

Idempotency is guaranteed by the fixed-width SHA-256 identity hash generated by `AnalyticsRepository`:

$$\text{identityHash} = \text{SHA-256}(\text{provider} + \text{socialAccountId} + \text{queryPattern} + \text{granularity} + \text{observationDate} + \text{canonicalDimensions})$$

Re-running the same daily sync or historical backfill slice executes `UPSERT` statements matching on `identity_hash`, updating values in place without producing duplicate records.

---

## Security

1. **Workspace / RBAC Isolation**:
   - The sync service enforces that the invoking user has `social_accounts:manage` permission within the specified `workspaceId`.
   - The `SocialAccount` must belong to `workspaceId`. Cross-tenant requests immediately fail with `403 Forbidden`.
2. **Token Sanitization**:
   - No access tokens, refresh tokens, client secrets, or auth codes are ever stored, logged, or included in `AnalyticsSyncResult` / `AuditLog`.
   - All token retrieval flows through `SocialTokenManager`.
3. **Foreign Video Protection**:
   - External video ID overrides are validated against the database to confirm they belong to the authorized YouTube account before querying.

---

## Audit Logging

Structured, token-sanitized audit events are emitted for key lifecycle events:
- `ANALYTICS_SYNC_STARTED`: Records workspace, account, mode, and date range.
- `ANALYTICS_SYNC_COMPLETED`: Records execution metrics, observation counts, request counts, and pattern statuses.
- `ANALYTICS_SYNC_FAILED`: Records error classifications and failed pattern details.
- `ANALYTICS_SYNC_LOCKED`: Records lock contention events.
- `ANALYTICS_SYNC_REAUTH_REQUIRED`: Records OAuth consent revocation or token expiry.
- `ANALYTICS_QUOTA_EXHAUSTED`: Records application request budget exhaustion.

---

## Testing

The implementation is verified with **42 comprehensive Vitest unit tests** covering:
- **Authorization**: Invalid roles, missing context, cross-tenant account mismatch, non-YouTube platform.
- **Distributed Locking**: Lock acquisition, fail-fast on contention, heartbeat intervals, unconditional release, ownership preservation.
- **SyncJob Lifecycle**: State transitions (`PENDING` $\rightarrow$ `PROCESSING` $\rightarrow$ `COMPLETED` / `FAILED`), metadata serialization.
- **Date Windows & Injectable Clock**: Clamped dates, daily $T-7$ windows, rolling $T-30$ windows, 3 non-overlapping 90-day backfill slices.
- **Query Patterns**: Execution of all 7 patterns via `YouTubeAnalyticsPlanner`.
- **Deterministic Video Selection**: Top 10 + 14-day recent videos, deduplication, sorting, and explicit video ID ownership validation.
- **Quota & Application Budget**: Budget enforcement, pattern skip, and preservation of completed slices.
- **Partial Success & Failure Priorities**: Channel overview failure propagation, optional pattern fault isolation, empty report handling.
- **Token Lifecycle**: Single 401 force-refresh retry, revoked authorization classification.
- **Persistence & Idempotency**: Bounded batch delegation to `AnalyticsRepository`, idempotent re-syncs.
- **Security**: Zero credential leakage in return types or logs.

---

## Known Limitations

1. **Single-Instance In-Memory Locking in Development**: `InMemoryLock` is suitable for local testing and single-node instances. Production multi-instance deployments will require upgrading to Redis or database-backed distributed locking (scheduled for future infra phase).
2. **YouTube Reporting Lag**: YouTube Analytics data has a native 24–72 hour lag. Same-day real-time metrics are not available from the YouTube Analytics API.
3. **Small Channel Demographics Threshold**: Channels with low traffic may return empty demographic or geographic reports due to YouTube privacy thresholds.

---

## Future Work

1. **Phase 3.3E**: Analytics Dashboard API & Aggregation Layer.
2. **Phase 3.4**: Automated background scheduling and cron trigger workers.
3. **Phase 3.5**: Multi-instance Redis lock driver.
4. **Phase 4**: Multi-platform analytics adapters (Instagram Graph API, TikTok Commercial API).
