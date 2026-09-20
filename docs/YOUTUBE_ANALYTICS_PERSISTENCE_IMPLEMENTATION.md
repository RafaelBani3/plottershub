# YouTube Analytics Persistence Implementation Specification

**Phase 3.3C — Analytics Data Model & Persistence Architecture**  
**Document Version:** 1.0  
**Status:** IMPLEMENTED  
**Date:** 2026-09-11  

---

## 1. Overview & Architecture

Phase 3.3C establishes the **Persistent Analytics Storage Layer** for Plottershub. It maps the normalized, provider-agnostic `AnalyticsObservation` domain contract (Phase 3.3B) to PostgreSQL via Prisma, supporting daily time-series, arbitrary aggregated ranges, video telemetry, and multi-dimensional breakdowns.

### Dual-Layer Storage Pattern:
1. **Lossless JSONB Metrics Layer (`metrics: Json`):** Preserves full fidelity of all provider metrics, large BigInt counts as string integers, exact decimal representations, and strict `null` values.
2. **Promoted Relational Layer:** High-frequency dashboard metrics (`views`, `estimatedMinutesWatched`, `averageViewDuration`, `averageViewPercentage`, `likes`, `comments`, `shares`, `subscribersGained`, `subscribersLost`, `engagementRate`) are mapped to typed PostgreSQL columns (`BIGINT`, `INTEGER`, `DECIMAL`), enabling blazing-fast SQL aggregations and index-only scans.

```
[ Normalized Domain AnalyticsObservation ]
                   ↓
   (Single Atomic Normalization Step)
       ├── metrics (JSONB Lossless Projection)
       └── promoted columns (Relational Projection)
                   ↓
       [ Same Database Transaction ]
                   ↓
      [ analytics_observations Table ]
```

---

## 2. Database Schema (`analytics_observations`)

```prisma
enum MetricGranularity {
  DAILY
  AGGREGATED
}

enum MetricSource {
  DATA_API
  ANALYTICS_API
  REPORTING_API
  ESTIMATED
}

model AnalyticsObservation {
  id                String            @id @default(cuid())
  workspaceId       String            @map("workspace_id")
  socialAccountId   String            @map("social_account_id")
  externalAccountId String?           @map("external_account_id")
  externalContentId String?           @map("external_content_id")

  provider          String            @map("provider") // "YOUTUBE", "TIKTOK", "INSTAGRAM"
  source            MetricSource      @default(ANALYTICS_API) @map("source")
  queryPattern      String            @map("query_pattern") // "CHANNEL_DAILY_OVERVIEW", "TOP_VIDEOS_PERFORMANCE", etc.
  granularity       MetricGranularity @default(DAILY) @map("granularity")

  startDate         DateTime          @map("start_date") @db.Date
  endDate           DateTime          @map("end_date") @db.Date
  observationDate   DateTime?         @map("observation_date") @db.Date // Populated for DAILY; NULL for AGGREGATED

  identityKey       String            @map("identity_key") @db.Text
  identityHash      String            @unique @map("identity_hash") @db.VarChar(64)

  dimensions        Json?             @map("dimensions")
  metrics           Json              @map("metrics")

  views                   BigInt?
  estimatedMinutesWatched BigInt?   @map("estimated_minutes_watched")
  averageViewDuration     Int?      @map("average_view_duration") // seconds
  averageViewPercentage   Decimal?  @map("average_view_percentage") @db.Decimal(5, 2) // 0.00 - 100.00%
  likes                   BigInt?
  comments                BigInt?
  shares                  BigInt?
  saves                   BigInt?
  subscribersGained       BigInt?   @map("subscribers_gained")
  subscribersLost         BigInt?   @map("subscribers_lost")
  engagementRate          Decimal?  @map("engagement_rate") @db.Decimal(8, 4)

  capturedAt        DateTime          @default(now()) @map("captured_at")
  syncJobId         String?           @map("sync_job_id")
  dataLagDays       Int?              @map("data_lag_days")

  workspace     Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  socialAccount SocialAccount @relation(fields: [socialAccountId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  syncJob       SyncJob?      @relation(fields: [syncJobId], references: [id], onDelete: SetNull)

  @@index([workspaceId, socialAccountId, queryPattern, observationDate(sort: Desc)])
  @@index([workspaceId, externalContentId, observationDate(sort: Desc)])
  @@index([workspaceId, socialAccountId, granularity, startDate, endDate])
  @@index([socialAccountId, capturedAt(sort: Desc)])
  @@map("analytics_observations")
}
```

---

## 3. Multi-Tenant Workspace & Ownership Integrity

To guarantee that an observation cannot be written under Workspace A while referencing a SocialAccount belonging to Workspace B:
1. **Database-Level Composite FK:**
   - `SocialAccount` enforces `@@unique([id, workspaceId])`.
   - `AnalyticsObservation` references `[socialAccountId, workspaceId]` $\rightarrow$ `SocialAccount([id, workspaceId])`.
   - PostgreSQL rejects any row insertion if the foreign account does not belong to the matching `workspaceId`.
2. **Server-Side Verification:**
   - `AnalyticsRepository.verifyWorkspaceOwnership(socialAccountId, workspaceId)` validates the account's workspace before proceeding with persistence.

---

## 4. Observation Identity & Idempotency

$$\text{identityKey} = \text{provider}:\text{source}:\text{socialAccountId}:\text{queryPattern}:\text{granularity}:\text{startDate}:\text{endDate}:\text{observationDate}:\text{canonicalDimensions}$$

- **`identityHash` (`VARCHAR(64)`):** Stores the SHA-256 hex digest of `identityKey`.
- **Cryptographic Precision:** *SHA-256 provides a fixed-width deterministic identity hash with negligible collision probability for this application.*
- **Database Unique Constraint:** `@@unique([identityHash])` serves as the atomic upsert anchor.
- **Dimension Ordering Invariance:** Dimension keys are sorted alphabetically before generating `identityKey`, ensuring `{ country: "ID", deviceType: "MOBILE" }` and `{ deviceType: "MOBILE", country: "ID" }` map to the identical `identityHash`.

---

## 5. Metrics Source of Truth & Precision

- **Source-of-Truth Rule:** The normalized `AnalyticsObservation` domain object is canonical. `metrics` JSONB and promoted columns are projections generated synchronously and committed in the same transaction.
- **Strict $NULL \neq 0$:**
  - Explicit `0` is stored as `0n` / `0` (relational) and `"0"` / `0` (JSONB).
  - Missing, suppressed, or unsupported metrics remain strictly `null`.
- **BigInt Safety:** BigInt counts are preserved as string representations in JSONB (e.g. `"views": "9007199254740993"`) and as native `BIGINT` in relational columns.
- **Decimal Safety:** Percentages and rates are preserved as Prisma `Decimal` without JavaScript 64-bit float precision distortion.

---

## 6. Dimension Strategy & `externalContentId`

- **`dimensions` (JSONB):** Flexible multi-dimensional key-value attributes (e.g. `{"country": "ID"}`, `{"ageGroup": "18-24", "gender": "FEMALE"}`).
- **`externalContentId` (`String?`):** When `dimensions.video` is present, it is extracted as an **indexed external content identifier used to resolve/join against `ContentPlatform`** (not a hard FK).

---

## 7. Migration & Existing Snapshot Coexistence

- **Additive Migration:** `prisma/migrations/20260911120000_add_analytics_observations/migration.sql` creates the table and composite unique index without modifying or dropping existing tables.
- **Existing Snapshot Tables Preserved:** `AccountMetricSnapshot`, `ContentMetricSnapshot`, and `AudienceMetricSnapshot` remain in the schema for Data API lifetime cumulative snapshots.

---

## 8. Test Coverage Matrix

The persistence layer is verified by unit and integration test suites:
- Daily vs. Aggregated observation persistence
- Video-level observation and `externalContentId` extraction
- Multi-dimensional observations in JSONB
- Explicit zero vs. strict null preservation
- BigInt precision (`9007199254740993n`) and Decimal rate preservation
- Atomic idempotent upserts and concurrent parallel upsert safety
- Date range and multi-video identity isolation
- Dimension key ordering invariance
- Workspace tenant ownership enforcement (cross-workspace rejection)
- Relational vs. JSONB projection synchronization
- JSON serialization helper without BigInt type errors
