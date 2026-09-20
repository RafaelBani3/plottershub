# Phase 3.3E — YouTube Analytics Dashboard API / Aggregation Implementation Plan (Revised)

## Phase 3.3E Overview

Phase 3.3E establishes the **Dashboard API and Analytics Aggregation Layer** for Plottershub. Following the verified completion of Phase 3.3A (API Client), Phase 3.3B (Query Planner & Mapper), Phase 3.3C (Persistence & Neon Migration), and Phase 3.3D (Analytics Sync Engine), this phase transforms persisted telemetry (`AnalyticsObservation`) into structured, reliable, and performant REST API responses for the Phase 3.3F Dashboard UI.

### Core Architectural Principle: Strict Separation of Sync vs Read/Aggregation
- **Phase 3.3D (Sync Engine)** is write-oriented: YouTube Analytics API $\rightarrow$ Validation $\rightarrow$ Mapper $\rightarrow$ `AnalyticsObservation` (Neon PostgreSQL).
- **Phase 3.3E (Dashboard API)** is read-oriented: `AnalyticsObservation` $\rightarrow$ Filter $\rightarrow$ Aggregate $\rightarrow$ Compare $\rightarrow$ Sanitize $\rightarrow$ Dashboard REST API.
- **Strict Guardrail**: The Dashboard API **never** calls Google/YouTube APIs, **never** performs OAuth token refresh, and **never** triggers background synchronization from a GET request. Stale or missing data returns clean status indicators (`STALE` or `NO_DATA`) without latency penalties or write side-effects.
- **Period Integrity Guardrail**: The Dashboard API **never** substitutes or silently clamps date windows. It returns exact requested data, or an explicit data availability state (`INSUFFICIENT_DATA` / `PARTIAL_DATA`) when complete observations are unavailable.

---

## Current Architecture

```
Neon PostgreSQL
  ├── analytics_observations (Multi-tenant, Dual JSONB + Relational Projections)
  ├── content_platforms & contents (Metadata: title, publishedAt, externalUrl)
  ├── account_metric_snapshots & content_metric_snapshots (Lifetime Data API stats)
  └── social_accounts & sync_jobs (Account status, lock tokens, sync history)
        │
        ▼
[Phase 3.3E Read Layer]
AnalyticsDashboardRepository (Prisma aggregation, filtering, joins, bounded limits)
        │
        ▼
AnalyticsDashboardService (Business logic, period comparisons, engagement rates, freshness)
        │
        ▼
Dashboard API Route Handlers (Next.js 15 App Router: Auth, RBAC, parameter validation)
        │
        ▼
Phase 3.3F Dashboard UI (Charts, KPI Cards, Tables, Demographic Graphs)
```

---

## Existing Data Sources

Inspection of the database schema and prior phase implementations reveals two distinct data families:

1. **`AnalyticsObservation` (Phase 3.3C / 3.3D - Primary Source)**:
   - Contains period-bounded telemetry (`startDate` to `endDate`), daily time series (`observationDate`), interval growth (views, minutes watched, subscribers gained/lost in period), and multidimensional breakdowns (demographics, country, traffic source, device).
   - Promoted relational columns: `views`, `estimatedMinutesWatched`, `averageViewDuration`, `averageViewPercentage`, `likes`, `comments`, `shares`, `saves`, `subscribersGained`, `subscribersLost`, `engagementRate`.
   - Dual JSONB columns: `dimensions`, `metrics`.
   - Bounded queries supported by composite indexes on `(workspaceId, socialAccountId, queryPattern, observationDate)` and `(workspaceId, socialAccountId, granularity, startDate, endDate)`.

2. **`Content` & `ContentPlatform` (Phase 3.2 - Metadata Enrichment Source)**:
   - Stores video metadata synchronized from YouTube Data API: `title`, `description`, `publishedAt`, `externalUrl`, `status`.
   - `ContentPlatform.externalContentId` matches `AnalyticsObservation.externalContentId`.

3. **`AccountMetricSnapshot` (Phase 3.2 - Cumulative Lifetime Context)**:
   - Stores point-in-time lifetime counters from YouTube Data API `channels.list`: `followersCount` (total subscribers), `totalViews`, `totalVideos`.

---

## Dashboard Requirements

The dashboard API serves the Phase 3.3F UI across ten core functional areas:
1. **Overview KPI Cards**: Period totals for views, watch time, interactions, subscriber growth, and overall engagement rate with comparison deltas.
2. **Performance Trend Chart**: Daily time-series metrics over the selected period.
3. **Top Videos Table**: Ranked list of videos with thumbnail metadata, views, watch time, likes, comments, and engagement rate.
4. **Video Detail Performance**: Single video deep-dive daily time series and playback retention metrics.
5. **Audience / Demographics**: Age group and gender distribution graphs.
6. **Geographic Distribution**: Top country breakdown with view shares and geographic map representation.
7. **Traffic Sources**: Discovery distribution (YouTube Search, Suggested, External, etc.).
8. **Device Distribution**: Playback device breakdown (Mobile, Desktop, TV, Tablet).
9. **Data Freshness Indicators**: Displaying lag, latest observation date, and sync freshness.
10. **Period Comparison**: Automatic prior-period calculation with absolute delta and percentage change.

---

## API Architecture

### Modular Endpoints + Composite Summary
To balance initial page load performance with granular tab interactions:
- **Primary Pattern**: Modular, single-responsibility REST endpoints for specific dashboard widgets/tabs.
- **Composite Pattern**: A high-level summary endpoint combining KPIs, daily trend, top 5 videos, and freshness in a single roundtrip to optimize initial dashboard rendering.

### Route Location Convention
Following existing Plottershub conventions (`src/app/api/social/youtube/...`):
All endpoints reside under `src/app/api/social/youtube/analytics/...`.

---

## Proposed Endpoints

| Method | Route | Description | Query Parameters |
|---|---|---|---|
| `GET` | `/api/social/youtube/analytics/overview` | Overview KPI summary + period comparison | `workspaceId`, `socialAccountId?`, `startDate?`, `endDate?` |
| `GET` | `/api/social/youtube/analytics/trends` | Daily time-series trends for charts | `workspaceId`, `socialAccountId?`, `startDate?`, `endDate?`, `metrics?` |
| `GET` | `/api/social/youtube/analytics/top-videos` | Paginated top performing videos | `workspaceId`, `socialAccountId?`, `startDate?`, `endDate?`, `sortBy?`, `sortOrder?`, `limit?`, `offset?` |
| `GET` | `/api/social/youtube/analytics/videos/[videoId]` | Single video daily performance detail | `workspaceId`, `socialAccountId?`, `startDate?`, `endDate?` |
| `GET` | `/api/social/youtube/analytics/audience` | Demographics (age group & gender) | `workspaceId`, `socialAccountId?`, `startDate?`, `endDate?` |
| `GET` | `/api/social/youtube/analytics/geography` | Country distribution with percentage shares | `workspaceId`, `socialAccountId?`, `startDate?`, `endDate?`, `limit?` |
| `GET` | `/api/social/youtube/analytics/traffic-sources` | Traffic source discovery breakdown | `workspaceId`, `socialAccountId?`, `startDate?`, `endDate?` |
| `GET` | `/api/social/youtube/analytics/devices` | Playback device type distribution | `workspaceId`, `socialAccountId?`, `startDate?`, `endDate?` |
| `GET` | `/api/social/youtube/analytics/summary` | Composite endpoint (Overview + Trends + Top 5) | `workspaceId`, `socialAccountId?`, `startDate?`, `endDate?` |

---

## Request Contracts

All endpoints accept standard HTTP query parameters validated by Zod schemas:

```typescript
export interface BaseDashboardQueryDto {
  workspaceId: string;
  socialAccountId?: string;
  startDate?: string; // Format: YYYY-MM-DD
  endDate?: string;   // Format: YYYY-MM-DD
}

export interface TrendsQueryDto extends BaseDashboardQueryDto {
  metrics?: string; // Comma-separated list of allowed metrics
}

export interface TopVideosQueryDto extends BaseDashboardQueryDto {
  sortBy?: "views" | "estimatedMinutesWatched" | "likes" | "comments" | "shares" | "subscribersGained" | "engagementRate";
  sortOrder?: "asc" | "desc";
  limit?: number;  // Default 10, max 50
  offset?: number; // Default 0
}

export interface GeographyQueryDto extends BaseDashboardQueryDto {
  limit?: number;  // Default 20, max 100
}
```

---

## Response Contracts

Every endpoint conforms to Plottershub's envelope convention:

```typescript
export type DataAvailabilityState = "COMPLETE" | "PARTIAL_DATA" | "INSUFFICIENT_DATA" | "NO_DATA";

export interface DashboardResponseEnvelope<T> {
  data: T;
  meta: {
    workspaceId: string;
    socialAccountId: string;
    platform: "YOUTUBE";
    period: {
      startDate: string;
      endDate: string;
      days: number;
    };
    comparison?: {
      startDate: string;
      endDate: string;
      days: number;
    };
    dataAvailability: DataAvailabilityState;
    freshness: {
      latestObservationDate: string | null;
      dataAsOf: string | null;
      analyticsDataLagDays: number;
      status: "FRESH" | "STALE" | "NO_DATA";
    };
  };
}
```

### 1. Overview KPI Response Contract
```typescript
export interface MetricComparison<T = number | string | null> {
  current: T;
  previous: T;
  delta: T;
  percentageChange: number | null; // e.g. +14.25, -5.10, or null if previous is 0/null
}

export interface DashboardOverviewData {
  views: MetricComparison<string | null>;
  estimatedMinutesWatched: MetricComparison<string | null>;
  averageViewDurationSeconds: MetricComparison<number | null>;
  averageViewPercentage: MetricComparison<number | null>;
  likes: MetricComparison<string | null>;
  comments: MetricComparison<string | null>;
  shares: MetricComparison<string | null>;
  subscribersGained: MetricComparison<string | null>;
  subscribersLost: MetricComparison<string | null>;
  netSubscribers: MetricComparison<string | null>;
  engagementRate: MetricComparison<number | null>;
  lifetimeStats?: {
    totalSubscribers: string | null;
    totalViews: string | null;
    totalVideos: string | null;
  };
}
```

### 2. Trends Response Contract
```typescript
export interface DailyTrendPoint {
  date: string; // YYYY-MM-DD
  views: string | null;
  estimatedMinutesWatched: string | null;
  averageViewDuration: number | null;
  likes: string | null;
  comments: string | null;
  shares: string | null;
  subscribersGained: string | null;
  subscribersLost: string | null;
  engagementRate: number | null;
}

export interface DashboardTrendsData {
  series: DailyTrendPoint[];
}
```

### 3. Top Videos Response Contract
```typescript
export interface TopVideoItem {
  videoId: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  rank: number;
  metrics: {
    views: string | null;
    estimatedMinutesWatched: string | null;
    averageViewDuration: number | null;
    averageViewPercentage: number | null;
    likes: string | null;
    comments: string | null;
    shares: string | null;
    subscribersGained: string | null;
    engagementRate: number | null;
  };
}

export interface DashboardTopVideosData {
  videos: TopVideoItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

### 4. Video Detail Response Contract
```typescript
export interface VideoDetailData {
  video: {
    videoId: string;
    title: string;
    description: string | null;
    publishedAt: string | null;
    externalUrl: string | null;
  };
  periodTotals: {
    views: string | null;
    estimatedMinutesWatched: string | null;
    averageViewDuration: number | null;
    averageViewPercentage: number | null;
    likes: string | null;
    comments: string | null;
    shares: string | null;
    subscribersGained: string | null;
    engagementRate: number | null;
  };
  dailySeries: DailyTrendPoint[];
}
```

### 5. Audience / Demographics Response Contract
```typescript
export interface DemographicGroup {
  ageGroup: string; // "age13-17", "age18-24", "age25-34", "age35-44", "age45-54", "age55-64", "age65-"
  gender: "female" | "male" | "user_specified";
  viewerPercentage: number; // e.g. 14.5
}

export interface DashboardAudienceData {
  demographics: DemographicGroup[];
  genderTotals: {
    male: number;
    female: number;
    userSpecified: number;
  };
  ageTotals: Record<string, number>;
}
```

### 6. Geographic Distribution Response Contract
```typescript
export interface CountryDistributionItem {
  countryCode: string; // ISO Alpha-2 (e.g. "US", "ID")
  countryName: string; // Human-friendly resolved name
  views: string | null;
  estimatedMinutesWatched: string | null;
  subscribersGained: string | null;
  percentageShare: number | null; // Percentage of total views in period (e.g. 34.50)
}

export interface DashboardGeographyData {
  countries: CountryDistributionItem[];
  totalPeriodViews: string | null;
}
```

### 7. Traffic Sources Response Contract
```typescript
export interface TrafficSourceItem {
  sourceType: string; // e.g. "YT_SEARCH", "SUGGESTED_VIDEO", "EXT_URL"
  displayName: string; // "YouTube Search", "Suggested Videos", "External"
  views: string | null;
  estimatedMinutesWatched: string | null;
  percentageShare: number | null;
}

export interface DashboardTrafficSourcesData {
  sources: TrafficSourceItem[];
}
```

### 8. Device Distribution Response Contract
```typescript
export interface DeviceDistributionItem {
  deviceType: string; // "MOBILE", "DESKTOP", "TV", "TABLET"
  displayName: string; // "Mobile phone", "Computer", "TV", "Tablet"
  views: string | null;
  estimatedMinutesWatched: string | null;
  percentageShare: number | null;
}

export interface DashboardDevicesData {
  devices: DeviceDistributionItem[];
}
```

---

## Aggregation Rules

### Database vs Application Aggregation
- **Relational Aggregations in PostgreSQL**: Overview KPI sums are aggregated using Prisma database queries (`SUM(views)`, `SUM(estimatedMinutesWatched)`, `SUM(likes)`, etc.) on `AnalyticsObservation` filtered by `queryPattern: "CHANNEL_DAILY_OVERVIEW"` and `observationDate BETWEEN :startDate AND :endDate`.
- **Weighted Averages**:
  - `averageViewDuration` cannot be simply averaged. It is derived from totals:
    $$\text{averageViewDurationSeconds} = \frac{\sum \text{estimatedMinutesWatched} \times 60}{\sum \text{views}}$$
  - If $\sum \text{views} = 0$ or views is null, $\text{averageViewDurationSeconds} = \text{null}$.
- **Strict Null Preservation (NULL $\ne$ 0)**:
  - If an observation column is `null`, it is treated as missing/unavailable.
  - If all days in a period have `null` for a metric (e.g. `shares`), the aggregated total is `null`, **not** 0.
  - If at least one day has a measured value, known values are summed.

---

## Comparison Period

### Equal-Length Window Derivation
Given current interval $[D_{\text{start}}, D_{\text{end}}]$:
$$\Delta_{\text{days}} = \text{differenceInCalendarDays}(D_{\text{end}}, D_{\text{start}}) + 1$$
$$D_{\text{prevEnd}} = D_{\text{start}} - 1\text{ day}$$
$$D_{\text{prevStart}} = D_{\text{prevEnd}} - (\Delta_{\text{days}} - 1)\text{ days}$$

*Example*:
- Current: `2026-09-01` to `2026-09-07` ($\Delta_{\text{days}} = 7$).
- Previous: `2026-08-25` to `2026-08-31` ($\Delta_{\text{days}} = 7$).
- **Guaranteed Zero Overlap**.

### Delta & Percentage Change Formula
$$\text{delta} = \begin{cases}
\text{null} & \text{if } \text{current is null or previous is null} \\
\text{current} - \text{previous} & \text{otherwise}
\end{cases}$$

$$\text{percentageChange} = \begin{cases}
\text{null} & \text{if } \text{previous is null or current is null} \\
\text{null} & \text{if } \text{previous} = 0 \text{ and } \text{current} \ne 0 \text{ (division by zero undefined)} \\
0.0 & \text{if } \text{previous} = 0 \text{ and } \text{current} = 0 \\
\left(\frac{\text{current} - \text{previous}}{\text{previous}}\right) \times 100 & \text{otherwise}
\end{cases}$$

Percentage changes are rounded to **2 decimal places** using Decimal-safe arithmetic.

---

## Freshness

Freshness metadata is attached to all dashboard responses without making external network calls:
- Query latest `observationDate` and latest `capturedAt` from `AnalyticsObservation` for the target `socialAccountId`.
- Freshness status logic:
  - `NO_DATA`: No observations found in the database.
  - `FRESH`: `latestObservationDate >= (currentDate - lagDays - 1 day)`.
  - `STALE`: Data exists, but `latestObservationDate` lags further behind expected YouTube availability.

---

## Top Videos (Period Integrity & Coverage)

### Strict Period Integrity Rule
> [!IMPORTANT]
> **Never substitute a "closest overlapping aggregate window" for the requested date range.**
> Doing so silently misrepresents data and compromises historical integrity.

For a user-requested period $[D_{\text{start}}, D_{\text{end}}]$:
1. **Exact Matching Observation**: Check for an existing `TOP_VIDEOS_PERFORMANCE` record with `startDate === D_start && endDate === D_end`. If found, use it directly.
2. **Daily Aggregation Fallback**: If an exact aggregate record does not exist:
   - Check if `VIDEO_DAILY_TIME_SERIES` records exist for all videos in the channel across the full date range $[D_{\text{start}}, D_{\text{end}}]$.
   - However, **Phase 3.3D only syncs daily time series for top 10 videos + recent 14-day uploads + explicit video overrides**. It does **NOT** sync daily time series for every channel video.
   - Therefore, a complete channel-wide ranking cannot be fabricated from partial daily time series.
3. **Explicit Availability States**:
   - If exact period aggregate data does not exist, return `dataAvailability: "INSUFFICIENT_DATA"` with `videos: []`.
   - If partial video daily data exists and the client explicitly accepts partial coverage, return `dataAvailability: "PARTIAL_DATA"` with explicit metadata indicating only synchronized videos are included.
   - Under **no circumstances** will the API return a 30-day aggregate window while claiming it represents a custom 7-day request.

### Metadata Enrichment & Deterministic Ranking
- Query `ContentPlatform` and `Content` on `externalContentId === observation.externalContentId && socialAccountId === observation.socialAccountId`.
- Resolves `title`, `description`, `publishedAt`, and `externalUrl`.
- Fallback for unsynced metadata: `title: "YouTube Video (${externalContentId})"`.
- Deterministic sort: Primary sort on selected metric (e.g. `views` desc), tie-breaker on `externalContentId` asc.

---

## Video Detail

- Endpoint: `GET /api/social/youtube/analytics/videos/[videoId]`
- **Ownership Verification**:
  - Validates that `videoId` belongs to the specified `socialAccountId` and `workspaceId` (preventing IDOR / cross-tenant inspection of arbitrary YouTube videos).
- **Queries**:
  - Reads `AnalyticsObservation` with `queryPattern: "VIDEO_DAILY_TIME_SERIES"` and `externalContentId: videoId` over the date window.
  - Returns period totals and daily time series.
  - If no daily records exist for this specific video (due to Phase 3.3D selective sync), returns `dataAvailability: "NO_DATA"` with clean explanatory metadata.

---

## Audience & Distribution Aggregation Rules

### Strict Distribution Percentage Rule
> [!CAUTION]
> **Never sum percentage values across daily observations.**
> Percentages are non-additive intensive values: $\sum \% \ne \text{period } \%$. Summing daily viewer percentages produces mathematically invalid numbers exceeding 100%.

1. **Viewer Demographics (`VIEWER_DEMOGRAPHICS`)**:
   - Source: Period-level aggregated observations (`granularity: AGGREGATED`).
   - If an exact matching aggregate period exists in the database, return it directly.
   - If no period-level aggregate exists for the requested custom window, return `dataAvailability: "INSUFFICIENT_DATA"` rather than calculating invalid percentage sums.
2. **Country Distribution (`GEOGRAPHIC_DISTRIBUTION`)**:
   - Uses period-level aggregate observations (`granularity: AGGREGATED`).
   - Computes `percentageShare`:
     $$\text{percentageShare} = \begin{cases}
     \text{null} & \text{if } \sum_{\text{countries}} \text{views} = 0 \text{ or null} \\
     \left(\frac{\text{countryViews}}{\sum_{\text{countries}} \text{views}}\right) \times 100 & \text{otherwise}
     \end{cases}$$
3. **Traffic Sources & Devices**:
   - Same rule: read period-level aggregates, calculate shares against total observed views in the period, and guard against division by zero.

---

## Metric Definitions & Engagement Rate NULL Semantics

### Strict NULL Semantics (NULL $\ne$ 0)
1. **Views**: `views` column.
2. **Watch Time**: `estimatedMinutesWatched` column.
3. **Average View Duration**: $\frac{\sum \text{estimatedMinutesWatched} \times 60}{\sum \text{views}}$.
4. **Average View Percentage**: Weighted retention percentage across views.
5. **Engagement Rate Formula**:
   $$\text{engagementRate} = \begin{cases}
   \text{null} & \text{if } \text{views is null or views} = 0 \\
   \text{null} & \text{if any required interaction metric (likes, comments, shares) is null} \\
   \left(\frac{\text{likes} + \text{comments} + \text{shares}}{\text{views}}\right) \times 100 & \text{otherwise}
   \end{cases}$$

> [!NOTE]
> If YouTube does not return `shares` for a period (e.g. privacy threshold or API omission), `shares` is `null`. It must **NOT** be coerced to zero, as doing so artificially deflates engagement rate calculations.

---

## Social Account Resolution

To prevent non-deterministic behavior and database order dependencies:
1. **Explicit Account Provided (`?socialAccountId=...`)**:
   - Verify account exists.
   - Verify `account.workspaceId === workspaceId`.
   - Verify `account.platform.code === "YOUTUBE"`.
   - If validation fails, return HTTP 403 or 404.
2. **Account Omitted**:
   - Query all connected YouTube accounts for the workspace (`status === "CONNECTED"`).
   - **Case A (Exactly One Account)**: Auto-resolve to this single account.
   - **Case B (Multiple Accounts)**: Do **not** pick the first one by database insertion order. Return HTTP 400 Bad Request with:
     ```json
     {
       "error": "Multiple connected YouTube accounts found in this workspace. Please specify 'socialAccountId'.",
       "code": "MULTIPLE_ACCOUNTS_FOUND",
       "accounts": [
         { "id": "acc_1", "username": "channelA", "displayName": "Channel A" },
         { "id": "acc_2", "username": "channelB", "displayName": "Channel B" }
       ]
     }
     ```
   - **Case C (Zero Accounts)**: Return HTTP 200 with structured empty envelope and `meta.freshness.status = "NO_DATA"` (`code: "NO_CONNECTED_ACCOUNT"`).

---

## Date Range Validation

Do **not** silently clamp user-requested date ranges. If a request exceeds allowed boundaries, fail fast with HTTP 400 Bad Request.

### Specific Limits
1. **Daily Time-Series Endpoints (`/trends`, `/videos/[videoId]`):**
   - Maximum range: **90 days** per query.
   - Rationale: Daily series are used for UI chart rendering; ranges exceeding 90 days create heavy payloads and slow UI rendering.
2. **Aggregated Endpoints (`/overview`, `/audience`, `/geography`, `/traffic-sources`, `/devices`, `/top-videos`):**
   - Maximum range: **365 days** (1 year) per query (or up to 730 days if historical backfill is present).
3. **General Validations:**
   - Format must strictly match `YYYY-MM-DD`.
   - `startDate <= endDate`.
   - `endDate <= currentDate` (future dates are rejected with HTTP 400).
   - If range exceeds maximum allowed limit, return:
     ```json
     {
       "error": "Requested date range of 120 days exceeds the maximum allowed limit of 90 days for daily trends.",
       "code": "DATE_RANGE_EXCEEDED"
     }
     ```

---

## Summary Endpoint Query Strategy

The composite `GET /api/social/youtube/analytics/summary` endpoint allows the frontend to initialize the dashboard in one network roundtrip.

### Explicit Database Query Budget
One HTTP request does **NOT** imply one database query. To guarantee bounded execution and avoid duplicate work:
1. **Step 1: Auth & Account Verification (1 DB query)**:
   - Verify workspace permission (`requireWorkspacePermission`).
   - Resolve and verify the target `SocialAccount`.
2. **Step 2: Bounded Parallel Execution (`Promise.all`)**:
   - Execute 4 targeted queries concurrently against Neon PostgreSQL:
     a. `getOverviewAggregates`: Single SQL `_sum` query for current period + single `_sum` query for previous period.
     b. `getDailyTrends`: Bounded query for daily observations (`take: 90`).
     c. `getTopVideos`: Top 5 video observations (`take: 5`) + single `findMany` metadata join on `ContentPlatform`.
     d. `getFreshness`: Single `findFirst` query for latest observation timestamp (`orderBy: { observationDate: 'desc' }`).
3. **Step 3: In-Memory Composition**:
   - Compute deltas, weighted duration, and engagement rate in memory.
   - Format response envelope.
- **Budget**: Exactly 6 targeted indexed database queries executed in parallel within a single HTTP lifecycle, completing in under 50ms.

---

## Repository Design

Create `AnalyticsDashboardRepository`:
```typescript
export class AnalyticsDashboardRepository {
  async verifyAccountAccess(params: { workspaceId: string; socialAccountId?: string }): Promise<SocialAccount>;
  async getOverviewAggregates(params: { workspaceId: string; socialAccountId: string; startDate: Date; endDate: Date }): Promise<OverviewDbTotals>;
  async getDailyTrends(params: { workspaceId: string; socialAccountId: string; startDate: Date; endDate: Date }): Promise<PrismaAnalyticsObservation[]>;
  async getTopVideos(params: { workspaceId: string; socialAccountId: string; startDate: Date; endDate: Date; sortBy: string; sortOrder: "asc" | "desc"; limit: number; offset: number }): Promise<{ items: TopVideoWithContent[]; total: number; dataAvailability: DataAvailabilityState }>;
  async getVideoTimeSeries(params: { workspaceId: string; socialAccountId: string; videoId: string; startDate: Date; endDate: Date }): Promise<{ content: ContentWithPlatform | null; observations: PrismaAnalyticsObservation[] }>;
  async getDistribution(params: { workspaceId: string; socialAccountId: string; queryPattern: string; startDate: Date; endDate: Date; limit?: number }): Promise<{ observations: PrismaAnalyticsObservation[]; dataAvailability: DataAvailabilityState }>;
  async getAccountFreshness(params: { workspaceId: string; socialAccountId: string }): Promise<FreshnessData>;
}
```

---

## Service Design

`YouTubeDashboardService` coordinates business logic:
- Account auto-resolution and disambiguation.
- Strict date validation (rejecting over-range requests).
- Comparison period calculation.
- Calling repository methods.
- Computing percentage deltas, weighted averages, and engagement rates (enforcing `NULL != 0`).
- Formatting BigInt and Decimal fields into client-safe strings and numbers.
- Constructing the final `DashboardResponseEnvelope`.

---

## Security / RBAC

1. **Authentication Guard**: All routes invoke `requireAuth()`.
2. **Permission Guard**: All routes invoke `requireWorkspacePermission(workspaceId, "analytics:view")`.
   - `analytics:view` is an existing, verified permission assigned to `OWNER`, `ADMIN`, `EDITOR`, `ANALYST`, and `VIEWER`.
3. **Tenant & Account Isolation**:
   - Validates that `socialAccountId` belongs to `workspaceId` and its platform is `YOUTUBE`.
   - For video detail, verifies `externalContentId` is associated with `socialAccountId`.
   - Rejects unauthorized access with standard `AuthError(403)`.
4. **Token Protection**: No tokens, secret keys, or internal lock IDs are ever accessed or included in dashboard responses.

---

## JSONB Safety

To prevent SQL injection or arbitrary JSONB path traversal:
- Public APIs **never** accept raw JSON paths.
- Controlled allowed registries:
  - `ALLOWED_METRICS`: `["views", "estimatedMinutesWatched", "likes", "comments", "shares", "subscribersGained", "subscribersLost", "engagementRate"]`
  - `ALLOWED_SORT_FIELDS`: `["views", "estimatedMinutesWatched", "likes", "comments", "shares", "subscribersGained", "engagementRate"]`
  - `ALLOWED_SORT_ORDERS`: `["asc", "desc"]`
- Invalid metric or sort requests are rejected with HTTP 400.

---

## Pagination

- Standard `limit` and `offset` matching existing project conventions (`audit-logs`).
- Clamped to maximum 50 for videos and 100 for geography.
- Negative or non-integer values are rejected with HTTP 400.

---

## Performance Strategy

- Queries leverage existing compound indexes in Neon PostgreSQL:
  - `@@index([workspaceId, socialAccountId, queryPattern, observationDate(sort: Desc)])`
  - `@@index([workspaceId, socialAccountId, granularity, startDate, endDate])`
  - `@@index([workspaceId, externalContentId, observationDate(sort: Desc)])`
  - `@@index([socialAccountId, capturedAt(sort: Desc)])`
- Uses Prisma relational aggregations (`_sum`) to minimize data transfer from Neon PostgreSQL to the Next.js runtime.
- Limits are strictly enforced on all queries to prevent unbounded memory allocation.

---

## Caching

- **No Redis in Phase 3.3E**: In accordance with project instructions, Redis is not introduced.
- **HTTP Cache Headers**: Standard `Cache-Control: private, no-cache` or short revalidation (e.g. `max-age=60`) to allow fast local navigation while ensuring freshness.

---

## Empty / Stale Data Behavior

- Empty observation sets return HTTP 200 with structured zero/null representations and `meta.freshness.status = "NO_DATA"`.
- Empty data **never** throws an HTTP 500 error.
- Stale data returns HTTP 200 with `meta.freshness.status = "STALE"`.

---

## Existing Snapshot Model Decision

**Hybrid Read Architecture (Option C)**:
1. **Time-Series & Period Analytics**: Read exclusively from `AnalyticsObservation` (source of truth for time-bounded metrics).
2. **Video Presentation Metadata**: Enriched from `Content` / `ContentPlatform` (`title`, `publishedAt`, `externalUrl`).
3. **Channel Lifetime Stats (Optional KPI card context)**: Read from the latest `AccountMetricSnapshot` (total lifetime channel subscribers and lifetime views from YouTube Data API).

---

## Testing Strategy

Comprehensive unit and integration test suite targeting 30+ tests:
1. **Authorization**: Unauthenticated (401), cross-workspace forbidden (403), unauthorized role, non-YouTube platform.
2. **Account Resolution**: Auto-resolves single account, rejects multiple accounts without `socialAccountId` (400), handles zero accounts (NO_DATA).
3. **Date Validation**: Rejects invalid format, `startDate > endDate`, range exceeding 90 days for trends, future dates (all HTTP 400; no silent clamping).
4. **Top Videos Period Integrity**: Matches exact period aggregate, checks video coverage, returns `INSUFFICIENT_DATA` when incomplete; never silently substitutes date ranges.
5. **Overview KPIs & Null Semantics**: Strict `NULL != 0` handling, engagement rate null when views $=0$ or when interactions are null, weighted average view duration.
6. **Comparison Periods**: Accurate non-overlapping previous period calculation, positive/negative delta and percentage change, division-by-zero handling.
7. **Distribution Percentages**: Verifies percentages are never summed across days; returns `INSUFFICIENT_DATA` when period aggregate is missing.
8. **Summary Endpoint Query Efficiency**: Verifies bounded parallel query execution without duplicate account resolution.
9. **Top Videos Sorting & Pagination**: Bounded pagination, metric sorting, tie-breaker stability (`externalContentId`), metadata join fallback.
10. **Video Detail**: Ownership verification, foreign video rejection, time-series formatting.
11. **Freshness Classification**: Proper classification into `FRESH`, `STALE`, and `NO_DATA`.
12. **Serialization Safety**: BigInt to string conversion, Decimal precision preservation.

---

## Potential Schema / Index Requirements

- **Finding**: The existing Phase 3.3C schema contains all necessary indexes and foreign key relationships.
- **Verdict**: **NO schema modifications or migrations are required for Phase 3.3E.**

---

## Implementation File Plan

When approved, Phase 3.3E will create:
```
src/modules/social/analytics/
  ├── dashboard.types.ts       # DTOs, response contracts, metric registries, availability states
  ├── dashboard.repository.ts  # Database queries, Prisma aggregations, joins, account resolution
  ├── dashboard.service.ts     # Business logic, comparisons, freshness, formatting, null semantics
  └── dashboard.service.test.ts# 30+ unit/integration tests

src/app/api/social/youtube/analytics/
  ├── overview/route.ts        # Overview KPI endpoint
  ├── trends/route.ts          # Daily trend time-series endpoint
  ├── top-videos/route.ts      # Top videos table endpoint
  ├── videos/[videoId]/route.ts# Video detail breakdown endpoint
  ├── audience/route.ts        # Demographics endpoint
  ├── geography/route.ts       # Country distribution endpoint
  ├── traffic-sources/route.ts # Traffic sources endpoint
  ├── devices/route.ts         # Device distribution endpoint
  └── summary/route.ts         # Composite initial load endpoint
```

---

## Risks & Mitigations

1. **Selective Video Daily Sync**: Phase 3.3D only syncs daily time series for top 10 + recent videos.
   *Mitigation*: Top videos endpoint requires exact `TOP_VIDEOS_PERFORMANCE` aggregate records; if missing, returns explicit `INSUFFICIENT_DATA` rather than calculating an incomplete ranking.
2. **Demographics Data Sparsity**: YouTube returns empty data for small channels below privacy thresholds.
   *Mitigation*: Handled as valid `NO_DATA` responses without application error.
3. **Division by Zero**: Views $=0$ or total period views $=0$.
   *Mitigation*: All percentage and duration calculations explicitly guard against zero denominators and return `null`.

---

## Open Decisions & Final Recommendations

1. **Top Videos Period Fallback**: Plan establishes that exact matching `TOP_VIDEOS_PERFORMANCE` records are required; if absent and complete daily video data is unavailable, return `INSUFFICIENT_DATA`. *(Approved architecture)*
2. **Engagement Rate Null Policy**: Standardized as `((likes + comments + shares) / views) * 100`, strictly evaluating to `null` if views $=0$, views is null, or any interaction metric is null (`NULL != 0`). *(Approved architecture)*
3. **Account Resolution**: Auto-resolve when exactly one active account exists; require `socialAccountId` when multiple accounts exist. *(Approved architecture)*
4. **Date Limits**: Reject with HTTP 400 (no silent clamping) if daily trend range $>90$ days or aggregate range $>365$ days. *(Approved architecture)*
5. **Summary Endpoint**: Bounded 6-query parallel execution via `Promise.all` with single account resolution. *(Approved architecture)*

---

## Acceptance Criteria

- [ ] Complete revised implementation plan documented in `docs/YOUTUBE_ANALYTICS_DASHBOARD_API_PLAN.md`
- [ ] Top Videos period integrity enforced (no substitute aggregate windows)
- [ ] Video coverage limitation documented and handled via `INSUFFICIENT_DATA`
- [ ] Engagement rate and metric NULL semantics strictly preserve `NULL != 0`
- [ ] Demographic & distribution percentage aggregation rules enforced (no daily summing)
- [ ] Account resolution rules defined (auto-resolve on 1, require ID on >1)
- [ ] Date validation enforces hard limits with HTTP 400 (no silent clamping)
- [ ] Summary endpoint query budget and parallelization defined
- [ ] Clean separation of Sync vs Read/Aggregation preserved
- [ ] Zero schema changes or migrations proposed
- [ ] RBAC reuses existing `analytics:view` permission
- [ ] 30+ test scenarios planned
- [ ] No code or UI implemented prior to plan approval
