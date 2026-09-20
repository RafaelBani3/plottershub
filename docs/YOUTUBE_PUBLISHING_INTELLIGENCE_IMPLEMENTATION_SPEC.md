# Phase 3.4G — YouTube Publishing Intelligence Specification
## Historical Consumption Pattern, Content Supply, Launch Velocity & Observed Publishing Windows

**Document Version:** 1.0.0 — Architecture Freeze  
**Date:** September 19, 2026  
**Status:** FROZEN RESEARCH & ARCHITECTURE SPECIFICATION  
**Target Phase:** Phase 3.4G Implementation  
**Absolute Guardrails:** NO Production Code • NO Schema Migrations • NO Redis • NO BullMQ • NO Background Workers • NO Mutation of Historical Analytics Observations

---

## 1. Executive Summary

**Publishing Intelligence** is a descriptive, empirical analytics engine designed to help creators understand the historical relationships between their audience's historical consumption patterns, their own content supply schedule, and early post-publication launch velocity.

Unlike naive social media tools that advertise an "optimal time to post" or "guaranteed viral windows", Plottershub's Publishing Intelligence adheres strictly to observational data science and the technical realities of official platform APIs:

1. **Non-Causal Observational Analysis:** Observational correlations in historical data do not establish causal mechanisms. High Day 1 views on a Friday evening do not prove that publishing on Friday evening caused the views; factors such as topic selection, thumbnail resonance, notifications, and existing viewer habits remain unisolated.
2. **No Predictive or Algorithmic Claims:** The engine never predicts future video performance and never claims to decode the proprietary YouTube recommendation system.
3. **No Fabricated Data:** The engine strictly refuses to synthesize hourly active viewer counts or concurrent online heatmaps because the official YouTube Analytics API does not provide intraday audience presence metrics.
4. **Decoupled Evidence Triad:** Historical Consumption, Content Supply, and Publishing Performance are tracked and visualized as three independent analytical dimensions rather than being collapsed into an arbitrary composite score.
5. **Rigorous Evidence Strength:** Recommendations are replaced with *Observed Publishing Windows* qualified by transparent Evidence Strength tiers (`INSUFFICIENT`, `LOW`, `MODERATE`, `HIGH`) based on historical sample sizes, lookback spans, and variance.

---

## 2. Product Objective

The primary objective of Publishing Intelligence is to answer three distinct empirical questions for channel managers:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          THE THREE CORE EMPIRICAL QUESTIONS                            │
├──────────────────────────────┬─────────────────────────────────────────────────────────┤
│ 1. Historical Consumption    │ "On which days of the week has my audience historically │
│    Pattern                   │  consumed the most viewing time across my channel?"     │
├──────────────────────────────┼─────────────────────────────────────────────────────────┤
│ 2. Content Supply            │ "At what days and hours (in my configured timezone)     │
│                              │  have I historically published content?"                │
├──────────────────────────────┼─────────────────────────────────────────────────────────┤
│ 3. Publishing Performance    │ "How have videos published during specific days/windows │
│                              │  historically performed during Day 1, Day 2, and Day 3?"│
└──────────────────────────────┴─────────────────────────────────────────────────────────┘
```

### Prohibited Product Behaviors (Anti-Goals)
- **NO "Best Time to Publish" proclamations:** The platform will never declare a single hour as "The Best Time to Upload".
- **NO Causal Attributions:** UI copy will never say "Publishing at 18:00 will increase your views by 45%".
- **NO Universal Heuristics:** Generic industry rules of thumb (e.g., "Always post at 2 PM on Thursdays") will never substitute for channel-specific empirical observations.
- **NO Composite Magic Scores:** No black-box algorithms assigning a single "Publishing Score (87/100)".
- **NO Real-Time Audience Pretenses:** The platform will never display simulated purple activity heatmaps that mimic YouTube Studio's proprietary desktop interface.

---

## 3. Official YouTube Analytics Capabilities

A thorough audit of Google's official **YouTube Analytics API v2** documentation and Plottershub's implemented query planner (`src/modules/social/providers/youtube/youtube.analytics-planner.ts`) defines the exact capabilities and boundaries of available data:

| Dimension / Metric Category | Official API Support | API Resource / Query Pattern | Granularity | Latency | Supported in Plottershub Telemetry |
|---|:---:|---|---|---|:---:|
| **Daily Channel Consumption** | **YES** | `reports.query`<br>`dimensions=day`<br>`metrics=views,estimatedMinutesWatched,likes,comments,shares,subscribersGained` | Daily (`YYYY-MM-DD`) | 48–72h | **YES** (`CHANNEL_DAILY_OVERVIEW`) |
| **Video Publication Timestamp** | **YES** | Data API v3 `videos.list`<br>`part=snippet`<br>`fields=items(snippet/publishedAt)` | Exact Second (ISO 8601 UTC) | Immediate | **YES** (`ContentPlatform.publishedAt`) |
| **Video Daily Time Series** | **YES** | `reports.query`<br>`dimensions=day`<br>`filters=video=={videoId}`<br>`metrics=views,estimatedMinutesWatched,likes` | Daily (`YYYY-MM-DD`) | 48–72h | **YES** (`VIDEO_DAILY_TIME_SERIES`) |
| **Aggregated Video Performance** | **YES** | `reports.query`<br>`dimensions=video`<br>`metrics=views,estimatedMinutesWatched,averageViewDuration` | Aggregated over window | 48–72h | **YES** (`TOP_VIDEOS_PERFORMANCE`) |
| **Viewer Demographics** | **YES** | `reports.query`<br>`dimensions=ageGroup,gender`<br>`metrics=viewerPercentage` | Aggregated (30d+ minimum) | 48–72h | **YES** (`VIEWER_DEMOGRAPHICS`) |
| **Geographic Distribution** | **YES** | `reports.query`<br>`dimensions=country`<br>`metrics=views,estimatedMinutesWatched` | Aggregated | 48–72h | **YES** (`GEOGRAPHIC_DISTRIBUTION`) |
| **Traffic Source Types** | **YES** | `reports.query`<br>`dimensions=insightTrafficSourceType`<br>`metrics=views` | Aggregated | 48–72h | **YES** (`TRAFFIC_SOURCE_DISTRIBUTION`) |
| **Hourly Audience Activity** | **NO** | *None* (Proprietary to YouTube Studio web UI) | *N/A* | *N/A* | **STRICTLY PROHIBITED** |
| **Concurrent Viewers by Hour** | **NO** | *None* (Available only during active Live Streams via Live Streaming API) | *N/A* | *N/A* | **STRICTLY PROHIBITED** |
| **Real-time 60m / 48h Intraday**| **NO** | Realtime data is unexposed via external Analytics API v2 | *N/A* | *N/A* | **STRICTLY PROHIBITED** |

### Verified API Sources & Citations
- **Google Developers YouTube Analytics API v2 Reference:** [Channel Reports Guide](https://developers.google.com/youtube/analytics/channel_reports)
- **Supported Dimensions:** `day`, `video`, `country`, `ageGroup`, `gender`, `insightTrafficSourceType`, `deviceType`. Noticeably absent: `hour`, `minute`, `timeOfDay`.
- **Latency Specification:** YouTube Analytics data processing pipeline runs daily batch jobs. Google officially documents data availability lag between 48 and 72 hours for finalized metric numbers.

---

## 4. Data Limitations

Understanding platform limitations is fundamental to honest engineering. Publishing Intelligence explicitly accounts for the following hard boundaries:

### 4.1. Absence of Intraday Audience Presence
YouTube Studio displays a purple heatmap titled *"When your viewers are on YouTube"* within the web desktop dashboard. **This report is proprietary to YouTube Studio and is NOT part of the public YouTube Analytics API v2.**
- The API provides **zero hourly audience activity dimensions**.
- Generating an hourly "audience online" chart would require fabricating fake data or scraping private web sessions, both of which violate Google Terms of Service and Plottershub architectural integrity.
- **Architectural Decision:** Historical Consumption is evaluated at the **Day-of-Week** level (Monday through Sunday), reflecting actual daily watch time and view volume across the catalog.

### 4.2. Inexact Rolling Hours (Calendar Day vs. 24h Windows)
YouTube Analytics API groups observations by calendar day according to Pacific Time (PST/PDT) or UTC:
- A video published on 2026-08-10 at 21:00 UTC only receives 3 hours of viewing time on its "first calendar day" (2026-08-10).
- A video published on 2026-08-10 at 02:00 UTC receives 22 hours of viewing time on its "first calendar day".
- **Architectural Decision:** Metrics are explicitly designated as **Day 1**, **Day 2 Cumulative**, and **Day 3 Cumulative** calendar observations. They are **never labeled as "24 Hours", "48 Hours", or "72 Hours"**.

### 4.3. Data Lag (48–72 Hours)
Because analytics data has a 48–72 hour maturity window:
- The last 3 calendar days of data are incomplete or unfinalized.
- Videos published within the last 3 days cannot be scored for early launch velocity because their Day 1–Day 3 observations have not yet been synchronized.
- **Architectural Decision:** An explicit `dataLagDays` boundary (default: 3 days) is enforced. The active analysis period terminates at `Today - dataLagDays`.

---

## 5. Existing Data Model & Reuse Strategy

In strict adherence to the project guardrails, **NO NEW DATABASE TABLES ARE CREATED**. Publishing Intelligence is computed on-demand by synthesizing existing, immutable tables:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   EXISTING TABLES REUSED FOR INTELLIGENCE              │
├───────────────────────────┬────────────────────────────────────────────┤
│ Table                     │ Role in Publishing Intelligence            │
├───────────────────────────┼────────────────────────────────────────────┤
│ `AnalyticsObservation`    │ Provides channel-level baseline consumption│
│                           │ (`CHANNEL_DAILY_OVERVIEW`) and video-level │
│                           │ post-publication daily time series         │
│                           │ (`VIDEO_DAILY_TIME_SERIES`).               │
├───────────────────────────┼────────────────────────────────────────────┤
│ `ContentPlatform`         │ Provides canonical video identity          │
│                           │ (`externalContentId`), publication date    │
│                           │ (`publishedAt` in UTC), and format tags.   │
├───────────────────────────┼────────────────────────────────────────────┤
│ `Content`                 │ Provides video title, description, and     │
│                           │ duration for multi-signal classification.  │
├───────────────────────────┼────────────────────────────────────────────┤
│ `PublishingJob`           │ Provides scheduled time (`scheduledAt`),   │
│                           │ execution time, and publishing status.     │
├───────────────────────────┼────────────────────────────────────────────┤
│ `SocialAccount`           │ Provides workspace scoping and configured  │
│                           │ channel credentials.                       │
└───────────────────────────┴────────────────────────────────────────────┘
```

### Relational Mapping Architecture
```
  [SocialAccount]
        │
        ├──► [ContentPlatform] (publishedAt UTC, externalContentId)
        │           │
        │           ├──► [Content] (duration, title, format classification)
        │           └──► [PublishingJob] (scheduledAt, status)
        │
        └──► [AnalyticsObservation]
                    ├── queryPattern = "CHANNEL_DAILY_OVERVIEW" (day-level channel views)
                    └── queryPattern = "VIDEO_DAILY_TIME_SERIES" (externalContentId, observationDate)
```

No data is duplicated. Historical observations remain 100% immutable.

---

## 6. Historical Consumption Pattern (Signal A)

**Historical Consumption** measures overall audience activity across the channel catalog on each day of the week over the selected lookback period (e.g., 30, 60, 90, or 180 days).

### Calculation Methodology
1. Query `AnalyticsObservation` records for `queryPattern = "CHANNEL_DAILY_OVERVIEW"` between `startDate` and `endDate` (`endDate = Today - 3 days`).
2. Map each observation's `observationDate` to its day of the week ($D \in \{\text{Monday}, \dots, \text{Sunday}\}$).
3. Aggregate metrics per day of week:
   $$\text{TotalViews}(D) = \sum_{o \in \text{Obs}(D)} o.\text{views}$$
   $$\text{TotalWatchTime}(D) = \sum_{o \in \text{Obs}(D)} o.\text{estimatedMinutesWatched}$$
   $$\text{AvgDailyViews}(D) = \frac{\text{TotalViews}(D)}{|\text{Obs}(D)|}$$
4. Compute the channel overall daily mean:
   $$\mu_{\text{channel}} = \frac{\sum_{D} \text{TotalViews}(D)}{\sum_{D} |\text{Obs}(D)|}$$
5. Determine Day-of-Week Relative Index:
   $$\text{ConsumptionIndex}(D) = \frac{\text{AvgDailyViews}(D)}{\mu_{\text{channel}}}$$
   - $\text{ConsumptionIndex}(D) > 1.05$: **Above Average Consumption**
   - $0.95 \le \text{ConsumptionIndex}(D) \le 1.05$: **Average Consumption**
   - $\text{ConsumptionIndex}(D) < 0.95$: **Below Average Consumption**

---

## 7. Content Supply (Signal B)

**Content Supply** quantifies creator publication habits. It reflects when the channel has historically released content across days of the week and hours of the day.

### Calculation Methodology
1. Query all `ContentPlatform` records for the channel where `status = "PUBLISHED"` and `publishedAt` falls within the lookback window.
2. Filter by format (`LONG_FORM` vs `SHORTS`) based on Phase 3.4C classification.
3. Convert each video's `publishedAt` (UTC) to local publishing time using the configured `publishingTimezone`:
   $$t_{\text{local}} = \text{convertTimeZone}(v.\text{publishedAt}, \text{publishingTimezone})$$
4. Assign to 2D time bucket $(D, H)$ where $D \in \{\text{Mon}\dots\text{Sun}\}$ and $H \in \{00\dots23\}$.
5. Aggregate:
   $$\text{SupplyCount}(D, H) = |\{v \mid \text{localDay}(v) = D \land \text{localHour}(v) = H\}|$$
   $$\text{SupplyRatio}(D, H) = \frac{\text{SupplyCount}(D, H)}{\text{TotalPublishedVideos}}$$

This signal exposes creator supply clustering (e.g., "Creator publishes 80% of videos on Saturday at 14:00") and identifies untested windows.

---

## 8. Publishing Performance & Velocity (Signal C)

**Publishing Performance** measures how videos published during specific windows historically launched.

### Definition of Launch Velocity
Because long-term views are heavily influenced by SEO, browse features, and algorithmic re-indexing over months, **publishing timing only plausibly influences early launch velocity**. Therefore, performance is measured exclusively across early calendar observations:

- **`day1Views`**: Views accumulated on the video's first calendar observation date.
- **`day2CumulativeViews`**: Cumulative views through the second calendar day.
- **`day3CumulativeViews`**: Cumulative views through the third calendar day.
- **`day1WatchTime`**: Total minutes watched on the first calendar day.

### Baseline Comparison
To prevent single viral hits from distorting averages, Plottershub uses **Median** statistics:
1. **Channel Velocity Baseline:**
   $$\text{BaselineDay1Median} = \text{Median}(\{v.\text{day1Views} \mid v \in \text{AllEligibleVideos}\})$$
2. **Window Velocity Median:**
   $$\text{WindowDay1Median}(D, H) = \text{Median}(\{v.\text{day1Views} \mid v \in \text{VideosPublished}(D, H)\})$$
3. **Relative Velocity Gain:**
   $$\Delta\text{Velocity}(D, H) = \frac{\text{WindowDay1Median}(D, H) - \text{BaselineDay1Median}}{\text{BaselineDay1Median}} \times 100\%$$

---

## 9. Day 1 / Day 2 / Day 3 Assignment Methodology

A critical architectural flaw in naive tools is treating calendar days as exact 24-hour periods. Plottershub enforces explicit observation date assignment:

```
Timeline Illustration (Video Published 2026-08-10 19:30 UTC):

         Video Release (19:30 UTC)
                 │
                 ▼
[2026-08-10 00:00 ─────── 23:59 UTC]  ──► Observation Day 1 (Calendar Day of Release)
                                            Metrics: day1Views, day1WatchTime
                                            Duration exposed: 4.5 hours of calendar day

[2026-08-11 00:00 ─────── 23:59 UTC]  ──► Observation Day 2 (Second Full Calendar Day)
                                            Metrics: day2CumulativeViews = Day 1 + Day 2 views

[2026-08-12 00:00 ─────── 23:59 UTC]  ──► Observation Day 3 (Third Full Calendar Day)
                                            Metrics: day3CumulativeViews = Day 1 + Day 2 + Day 3
```

### Assignment Rules
1. **Day 1:** The `AnalyticsObservation` for `VIDEO_DAILY_TIME_SERIES` where `observationDate = date(publishedAtUtc)`.
2. **Day 2 Cumulative:** Sum of views from Day 1 observation and the observation where `observationDate = date(publishedAtUtc) + 1 day`.
3. **Day 3 Cumulative:** Sum of views across Day 1, Day 2, and the observation where `observationDate = date(publishedAtUtc) + 2 days`.
4. **Exclusion of Maturing Videos:** Any video published within `Today - 3 days` has not completed its Day 3 observation cycle and is excluded from finalized window velocity calculations.

---

## 10. Format Segmentation: Long-Form vs. Shorts

YouTube viewers consume Shorts and Long-Form content through fundamentally different mechanisms:
- **Long-form Videos:** Driven by Home feed browse, Subscriptions, and Notifications; heavily dependent on initial viewer click-through and immediate session watch time.
- **Shorts:** Driven almost exclusively by the algorithmic Shorts Feed swipe surface; consumption is rapid, impulsive, and less coupled to immediate subscriber notification spikes.

### Architectural Rules
1. **Strict Format Separation:** Long-form and Shorts observations are **NEVER mixed by default**. The API and UI enforce a mandatory format selector (`LONG_FORM` | `SHORTS`).
2. **Reuse Existing Classification:** Content format is determined using the existing Phase 3.4C multi-signal classifier (`src/modules/social/providers/youtube/youtube.classifier.ts`):
   - Duration $\le 60\text{s}$ + vertical aspect ratio or `#shorts` tag $\rightarrow$ `SHORTS`
   - Duration $> 60\text{s}$ $\rightarrow$ `LONG_FORM`
   - Inconclusive metadata $\rightarrow$ `UNKNOWN`
3. Videos classified as `UNKNOWN` are excluded from format-specific intelligence to preserve analytical purity.

---

## 11. Timezone Model

Publishing Intelligence must operate in the creator's operational timezone while storing all timestamps in UTC.

### Timezone Hierarchy
1. **Account Setting:** `SocialAccount.publishingTimezone` (e.g., `"America/New_York"`, `"Asia/Jakarta"`).
2. **Workspace Setting Fallback:** `Workspace.defaultTimezone`.
3. **Explicit Query Parameter:** Client may pass `?timezone=IANA_STRING` to inspect patterns in audience-specific timezones.
4. **Strict Ban on Server Timezone:** Node.js server system timezone (`process.env.TZ`) is **NEVER** used.

### Conversion Logic
```typescript
import { formatInTimeZone } from "date-fns-tz";

function getPublishingBucket(publishedAtUtc: Date, ianaTimezone: string): { dayOfWeek: string; hour: number } {
  const dayOfWeek = formatInTimeZone(publishedAtUtc, ianaTimezone, "EEEE"); // e.g. "Friday"
  const hour = parseInt(formatInTimeZone(publishedAtUtc, ianaTimezone, "H"), 10); // 0..23
  return { dayOfWeek, hour };
}
```

---

## 12. Time Buckets

### 12.1. Canonical Grid (1-Hour Granularity)
The primary intelligence matrix uses **168 buckets**:
- 7 Days of the week (Monday through Sunday)
- 24 Hourly buckets per day (`00:00–01:00`, `01:00–02:00`, ..., `23:00–00:00`)

### 12.2. Aggregated 3-Hour Windows (Sparse Data Fallback)
When a channel publishes infrequently ($\le 1$ video per week), 1-hour buckets become sparse. The engine supports grouping into **8 standard 3-hour windows** per day:
- `00:00–03:00` (Late Night)
- `03:00–06:00` (Early Morning)
- `06:00–09:00` (Morning Rush)
- `09:00–12:00` (Midday)
- `12:00–15:00` (Early Afternoon)
- `15:00–18:00` (Late Afternoon)
- `18:00–21:00` (Prime Evening)
- `21:00–00:00` (Night)

---

## 13. Evidence Strength Framework

Rather than claiming statistical confidence without rigorous sample power, Plottershub uses an empirical **Evidence Strength** classification:

| Evidence Tier | Sample Size Criteria ($N$) | Lookback Span | Consistency Criteria | User Interface Meaning |
|---|:---:|:---:|:---:|---|
| **HIGH** | $N \ge 15$ uploads in window | $\ge 90$ days | Interquartile Range (IQR) $\le 0.50 \times \text{Median}$ | Strong historical repetition across multiple months. Reliable historical pattern. |
| **MODERATE** | $5 \le N < 15$ uploads in window | $\ge 60$ days | IQR $\le 0.80 \times \text{Median}$ | Meaningful historical trend with moderate variance; solid directional observation. |
| **LOW** | $3 \le N < 5$ uploads in window | Any | Any | Preliminary historical pattern; highly vulnerable to individual outlier videos. |
| **INSUFFICIENT** | $N < 3$ uploads in window | Any | Any | Data points are too sparse to observe a repeatable pattern. Suppress comparison. |

### Channel-Wide Minimum Threshold
If a channel has fewer than **5 total published videos** across the entire lookback period, channel-wide intelligence defaults to `INSUFFICIENT` across all windows.

---

## 14. Descriptive Quadrant Model

The relationship between Historical Consumption and Early Launch Velocity is mapped to a 2×2 descriptive quadrant matrix. **All prescriptive terms like "Winner", "Best", "Worst", and "Optimal" are strictly forbidden.**

```
                        PUBLISHING PERFORMANCE (Y-Axis)
                     (Day 1 Median Velocity vs Channel Baseline)
                                        ▲
                                        │
           QUADRANT 3:                  │            QUADRANT 1:
    Lower Catalog Consumption           │     Higher Catalog Consumption
     Higher Launch Velocity             │       Higher Launch Velocity
                                        │
 "Strong launch velocity despite lower  │ "Coincides with both strong channel
  catalog consumption. Indicates strong │  consumption and above-baseline
  topic pull or external traffic."      │  Day 1 launch performance."
                                        │
────────────────────────────────────────┼────────────────────────────────────────►
                                        │                    HISTORICAL CONSUMPTION (X-Axis)
           QUADRANT 4:                  │            QUADRANT 2:  (Daily Channel Views Index)
    Lower Catalog Consumption           │     Higher Catalog Consumption
     Lower Launch Velocity              │       Lower Launch Velocity
                                        │
 "Historical observations show below-   │ "Channel consumption is strong, but
  baseline launch velocity on lower-    │  videos published here did not achieve
  consumption catalog days."            │  above-baseline Day 1 velocity."
                                        │
                                        ▼
```

### Neutral Descriptive Terminology
- **Q1:** *Relatively higher consumption / relatively higher early performance*
- **Q2:** *Relatively higher consumption / relatively lower early performance*
- **Q3:** *Relatively lower consumption / relatively higher early performance*
- **Q4:** *Relatively lower consumption / relatively lower early performance*

---

## 15. Prohibition of Arbitrary Composite Scores

Plottershub explicitly rejects the creation of a synthetic composite score:
- $\times$ `PublishingScore = 0.4 * Views + 0.3 * WatchTime + 0.3 * Likes` (PROHIBITED)
- $\times$ `OptimalTimeScore (0..100)` (PROHIBITED)
- $\times$ `AudienceActivityIndex` (PROHIBITED)

**Why arbitrary composite scores are rejected:**
1. Combining non-commensurate units (views, minutes, ratios) with subjective weights creates an illusion of precision.
2. Weightings differ by creator business model (a course creator values watch time; an entertainment channel values raw views).
3. Publishing Intelligence presents the independent dimensions side-by-side, empowering the creator's strategic judgement.

---

## 16. Data Lag & Freshness Architecture

```
Current Time: T (e.g. 2026-09-19)
─────────────────────────────────────────────────────────────────────────────
[Lookback Start]                  [Analysis Cutoff: T - 3 Days]      [T (Now)]
      │                                       │                          │
      ▼                                       ▼                          ▼
      ├───────────────────────────────────────┤──────────────────────────┤
      │        FINALIZED ANALYTICS            │     MATURING WINDOW      │
      │        (Synchronized Data)            │  (Incomplete / Pending)  │
      │                                       │                          │
      │ • Safe for Consumption Aggregation    │ • Excluded from Baseline │
      │ • Finalized Day 1/2/3 Observations    │ • Visualized as Pending  │
      └───────────────────────────────────────┴──────────────────────────┘
```

1. **Configurable Lag Boundary:** Default `analyticsLagDays = 3`.
2. **Lookback Windows:** Configurable options: `30d`, `60d`, `90d` (default), `180d`.
3. **Banner Disclosure:** The UI prominently communicates:
   > *"Analytics data is finalized through [Date]. Videos published in the last 3 days are excluded from velocity comparisons until their 72-hour observation cycle completes."*

---

## 17. Calculation & Query Architecture

Because channel catalogs typically contain 20–500 videos within a 90-day window, **on-demand SQL calculation without caching or table materialization executes in < 35ms on PostgreSQL**.

### Calculation Pipeline (Single In-Memory Service)
```
  Client Request (GET /api/analytics/publishing-intelligence)
                        │
                        ▼
  1. Authorize & Verify Workspace Ownership (SocialAccount <-> Workspace)
                        │
                        ▼
  2. Query Channel Daily Consumption (`AnalyticsObservation`, `CHANNEL_DAILY_OVERVIEW`)
     - Filter: workspaceId, socialAccountId, startDate, endDate
     - Group By: EXTRACT(DOW FROM observationDate)
     - Output: Daily consumption average & index
                        │
                        ▼
  3. Query Published Videos (`ContentPlatform` JOIN `Content`)
     - Filter: socialAccountId, publishedAt between startDate and endDate
     - Output: List of published videos with UTC timestamps and format classifications
                        │
                        ▼
  4. Query Post-Publication Velocity (`AnalyticsObservation`, `VIDEO_DAILY_TIME_SERIES`)
     - Filter: externalContentId IN (...videoIds), observationDate <= publishedAt + 3 days
     - Output: Day 1, Day 2 cumulative, Day 3 cumulative view counts
                        │
                        ▼
  5. In-Memory Timezone Transformation & Bucket Allocation
     - Convert UTC -> IANA publishingTimezone
     - Map to 168 (Day, Hour) buckets
     - Calculate Medians, Relative Deltas, and Evidence Strength
                        │
                        ▼
  6. Return Typed Response (JSON)
```

---

## 18. Typed API Contract

### Endpoint
`GET /api/analytics/publishing-intelligence`

### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|:---:|:---:|---|
| `socialAccountId` | String (CUID) | **YES** | — | Target connected social account ID |
| `format` | `"LONG_FORM"` \| `"SHORTS"` | NO | `"LONG_FORM"` | Format segmentation filter |
| `lookbackDays` | `30` \| `60` \| `90` \| `180` | NO | `90` | Historical lookback window in days |
| `timezone` | String (IANA) | NO | Account Config | Local evaluation timezone (e.g. `"Asia/Jakarta"`) |

### Response Schema (`PublishingIntelligenceResponse`)
```typescript
export interface PublishingIntelligenceResponse {
  meta: {
    socialAccountId: string;
    channelTitle: string;
    format: "LONG_FORM" | "SHORTS";
    lookbackDays: number;
    startDate: string; // ISO 8601 Date
    endDate: string; // ISO 8601 Date (Analysis Cutoff)
    timezone: string; // IANA identifier
    generatedAt: string; // ISO 8601 UTC
    channelTotalUploads: number;
    channelBaselineDay1ViewsMedian: number;
  };
  consumptionPattern: {
    daysOfWeek: Array<{
      dayOfWeek: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
      averageDailyViews: number;
      averageDailyWatchTimeMinutes: number;
      consumptionIndex: number; // 1.0 = baseline
      relativeLevel: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE";
      observationCount: number;
    }>;
  };
  observedWindows: Array<{
    dayOfWeek: string;
    hourBucket: number; // 0..23
    windowLabel: string; // e.g. "18:00–19:00"
    uploadCount: number;
    performance: {
      day1ViewsMedian: number | null;
      day2CumulativeViewsMedian: number | null;
      day3CumulativeViewsMedian: number | null;
      relativeDeltaPercent: number | null; // e.g. +44.9%
      sampleSize: number;
    };
    quadrant: "Q1_HIGH_CONSUMPTION_HIGH_VELOCITY" 
            | "Q2_HIGH_CONSUMPTION_LOW_VELOCITY"
            | "Q3_LOW_CONSUMPTION_HIGH_VELOCITY"
            | "Q4_LOW_CONSUMPTION_LOW_VELOCITY"
            | "UNCLASSIFIED";
    evidenceStrength: "HIGH" | "MODERATE" | "LOW" | "INSUFFICIENT";
  }>;
  narrativeObservations: Array<{
    type: "OBSERVED" | "DERIVED" | "CONTEXT";
    text: string;
  }>;
  disclaimer: string;
}
```

---

## 19. UI Architecture (Light Professional Analytics)

The Publishing Intelligence interface follows the **Phase 3.4B Light Professional Design System** (Zinc/Slate color tokens, 6px radii, crisp 1px borders, white surface cards, no dark theme, no neon accents).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [PlottersHub] Content / Publishing Intelligence                         [Asia/Jakarta] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ℹ️ Data Notice: Analyzing 90-day history (2026-05-18 to 2026-08-16).               │ │
│ │ Videos from the last 3 days are maturing and excluded from launch velocity baselines.│ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│ [ Format: Long-form Videos ▼ ]  [ Lookback: Last 90 Days ▼ ]   [ Timezone: Asia/Jakarta]│
│                                                                                        │
│ ┌──────────────────────────────────────────┬─────────────────────────────────────────┐ │
│ │ 1. Historical Consumption Pattern        │ 2. Content Supply Distribution          │ │
│ │ (Daily Channel Watch Time by Day)        │ (Uploads by Day & Time Window)          │ │
│ │                                          │                                         │ │
│ │  Mon  Tue  Wed  Thu  Fri   Sat   Sun     │ 24h Heatmap / Bar Chart                 │ │
│ │  ███  ███  ███  ████ █████ █████ ████    │ Fri 18:00–21:00: 18 uploads (Highest)   │ │
│ │  Fri accounts for 24.1% of watch time    │ Sat 10:00–12:00: 5 uploads              │ │
│ └──────────────────────────────────────────┴─────────────────────────────────────────┘ │
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 3. Observed Publishing Windows (Day-of-Week × Time Window)                         │ │
│ │ ┌─────────────┬─────────────┬──────────────┬──────────────┬──────────────────────┐ │ │
│ │ │ Window      │ Uploads     │ Day 1 Median │ vs Baseline  │ Evidence Strength    │ │ │
│ │ ├─────────────┼─────────────┼──────────────┼──────────────┼──────────────────────┤ │ │
│ │ │ Fri 18:00   │ 18 uploads  │ 18,400 views │ +44.9%       │ [ MODERATE EVIDENCE] │ │ │
│ │ │ Sat 11:00   │ 5 uploads   │ 13,100 views │ +3.1%        │ [ LOW EVIDENCE     ] │ │ │
│ │ │ Tue 14:00   │ 1 upload    │ —            │ —            │ [ INSUFFICIENT     ] │ │ │
│ │ └─────────────┴─────────────┴──────────────┴──────────────┴──────────────────────┘ │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│ ┌──────────────────────────────────────────┬─────────────────────────────────────────┐ │
│ │ 4. Descriptive Quadrant Matrix           │ 5. Empirical Observations & Context     │ │
│ │                                          │                                         │ │
│ │       Launch Velocity (Day 1)            │ • Observed: Fri accounts for highest    │ │
│ │                 ▲                        │   channel viewing time (24.1%).         │ │
│ │        Q3       │       Q1 (Fri 18:00)   │ • Derived: 18 uploads on Friday evening │ │
│ │                 │                        │   achieved +44.9% Day 1 velocity over   │ │
│ │     ────────────┼────────────►           │   channel baseline.                     │ │
│ │        Q4       │       Q2               │ • Context: Historical pattern only. Not │ │
│ │            Consumption                   │   a guarantee of future performance.    │ │
│ └──────────────────────────────────────────┴─────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 20. Performance & Query Strategy

### Database Indexes Utilized
The existing schema already possesses optimal composite indexes for Publishing Intelligence:
1. `analytics_observations`: `[workspaceId, socialAccountId, queryPattern, observationDate(sort: Desc)]` (covers Channel Daily Overview query).
2. `analytics_observations`: `[workspaceId, externalContentId, observationDate(sort: Desc)]` (covers Video Daily Time Series query).
3. `content_platforms`: `[socialAccountId, publishedAt(sort: Desc)]` (covers video publication query).

### Query Benchmark Expectations
- Query 1 (Channel Daily): ~90 rows returned ($\approx 4\text{ms}$).
- Query 2 (Content Listing): ~30–100 rows returned ($\approx 6\text{ms}$).
- Query 3 (Video Time Series): ~300 rows returned ($\approx 12\text{ms}$).
- In-memory transformation & aggregation: $\approx 5\text{ms}$.
- **Total API Latency Target:** $< 50\text{ms}$ at p95.

---

## 21. Security & Workspace Isolation

1. **Authentication:** `requireAuth()` ensures active user session.
2. **Multi-Tenant Ownership:** `AnalyticsRepository.verifyWorkspaceOwnership(socialAccountId, workspaceId)` ensures the queried `SocialAccount` belongs strictly to the authenticated user's workspace.
3. **RBAC Authorization:** Requires `content:read` and `analytics:view` permissions. Roles permitted: `OWNER`, `ADMIN`, `EDITOR`, `ANALYST`. Roles denied: `VIEWER` (without view grant).
4. **No Raw Injection:** Timezone string is validated against standard IANA timezone registry using `Intl.supportedValuesOf("timeZone")` to prevent invalid formatting.

---

## 22. Test Strategy

Phase 3.4G implementation will enforce an exhaustive test suite covering:
1. **Timezone Conversion:** Validates correct bucket placement across UTC, EST, and WIB (+7) boundaries, including Daylight Saving Time transitions.
2. **Format Segmentation:** Verifies that Shorts are never mixed with Long-form videos; verifies `UNKNOWN` format exclusion.
3. **Day 1/2/3 Assignment:** Validates exact assignment of calendar observation dates relative to publication dates.
4. **Data Lag Cutoff:** Confirms that observations within the 72-hour lag window are excluded from finalized baselines.
5. **Evidence Strength Tiers:** Tests threshold boundary conditions ($N=2 \rightarrow \text{INSUFFICIENT}$, $N=3 \rightarrow \text{LOW}$, $N=10 \rightarrow \text{MODERATE}$, $N=15 \rightarrow \text{HIGH}$).
6. **Descriptive Quadrant Classification:** Verifies correct assignment to Q1, Q2, Q3, or Q4 without prescriptive language.
7. **No Arbitrary Composite Score:** Asserts API response contains no single composite score.
8. **Workspace Isolation:** Rejection of unauthorized cross-tenant requests with HTTP 403.
9. **API Validation:** Handling of invalid timezones, negative lookbacks, and missing social accounts.

---

## 23. Phase 4 Boundary

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PHASE BOUNDARY DEFINITIONS                                │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│         PHASE 3.4G (THIS PHASE)           │          PHASE 4 (FUTURE WORK)             │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ • On-demand calculation via service       │ • Redis cache layer for intelligence DTOs  │
│ • No Redis or BullMQ                      │ • Asynchronous BullMQ background jobs      │
│ • In-memory aggregation (< 50ms)          │ • Scheduled nightly intelligence warm-up   │
│ • Zero database schema migrations         │ • Multi-channel cross-workspace rollups    │
│ • Unit & component mock testing           │ • Automated creator Slack/email digests    │
└────────────────────────────────-----------┴────────────────────────────────────────────┘
```

---

## 24. Open Risks & Assumptions

1. **Sparse Channels:** Channels with fewer than 5 uploads across 90 days will routinely receive `INSUFFICIENT` evidence strength. This is an intentional feature, not a defect.
2. **API Data Delay:** If a creator synchronizes channel analytics immediately after publishing, early velocity metrics will be unavailable until the 48–72h YouTube batch process completes.
3. **Timezone Changes:** If a creator changes their `publishingTimezone`, historical buckets are re-evaluated dynamically in the new timezone without altering stored UTC timestamps.

---

## 25. Implementation Plan

Upon approval of this research and specification freeze, implementation in Phase 3.4G will proceed in five discrete, verifiable steps:

1. **Domain Types & Validators:**
   - Create `src/modules/social/analytics/publishing-intelligence.types.ts`.
2. **Publishing Intelligence Engine Service:**
   - Create `src/modules/social/analytics/publishing-intelligence.service.ts` implementing the 3-signal calculations, median baselines, and evidence strength rules.
3. **API Route Handler:**
   - Create `src/app/api/analytics/publishing-intelligence/route.ts` with RBAC and workspace isolation guards.
4. **Light Professional UI Components:**
   - Create `src/components/analytics/publishing-intelligence/` containing consumption charts, supply heatmaps, window tables, and evidence badges.
5. **Comprehensive Verification:**
   - Execute unit tests, typecheck, lint, and build verification.

---

## 26. Implementation Documentation & Verification

### 26.1. Implementation File Map
The implementation follows the modular structure in `src/modules/analytics/publishing-intelligence/` and integrates into the UI and API layers:

1. **Domain Types & DTOs:**
   - [`src/modules/analytics/publishing-intelligence/publishing-intelligence.types.ts`](file:///c:/Users/user/Documents/Project/plottershub/src/modules/analytics/publishing-intelligence/publishing-intelligence.types.ts): Canonical types for formats (`LONG_FORM`, `SHORTS`, `ALL`), evidence strength, descriptive quadrants, 1-hour window buckets, and API responses.
2. **Timezone & Bucket Utilities:**
   - [`src/modules/analytics/publishing-intelligence/publishing-intelligence.time.ts`](file:///c:/Users/user/Documents/Project/plottershub/src/modules/analytics/publishing-intelligence/publishing-intelligence.time.ts): Robust IANA timezone conversion via `Intl.DateTimeFormat`, local day-of-week parsing, 1-hour window label formatting (`18:00–19:00`), and day differencing.
3. **Statistical & Evidence Calculator:**
   - [`src/modules/analytics/publishing-intelligence/publishing-intelligence.calculator.ts`](file:///c:/Users/user/Documents/Project/plottershub/src/modules/analytics/publishing-intelligence/publishing-intelligence.calculator.ts): Median, IQR, non-prescriptive evidence tier evaluation (`INSUFFICIENT`, `LOW`, `MODERATE`, `HIGH`), and neutral descriptive quadrant classification (Q1–Q4).
4. **Core Calculation Engine:**
   - [`src/modules/analytics/publishing-intelligence/publishing-intelligence.service.ts`](file:///c:/Users/user/Documents/Project/plottershub/src/modules/analytics/publishing-intelligence/publishing-intelligence.service.ts): On-demand orchestrator fetching existing `AnalyticsObservation` and `ContentPlatform` records, applying a 2-day analytics lag boundary, computing post-publication Day 1/2/3 cumulative velocity, and mapping observed windows.
5. **API Route Handler:**
   - [`src/app/api/analytics/publishing-intelligence/route.ts`](file:///c:/Users/user/Documents/Project/plottershub/src/app/api/analytics/publishing-intelligence/route.ts): Secure `GET` endpoint enforcing user authentication, DB-derived workspace verification, and `analytics:view` RBAC permission.
6. **UI Components (Light Professional Design System):**
   - [`src/components/analytics/publishing-intelligence/publishing-intelligence-view.tsx`](file:///c:/Users/user/Documents/Project/plottershub/src/components/analytics/publishing-intelligence/publishing-intelligence-view.tsx): Primary view container with format toggle, lookback selector, timezone picker, non-causal disclaimer banner, empirical narrative cards, and methodology notes.
   - [`src/components/analytics/publishing-intelligence/consumption-pattern-card.tsx`](file:///c:/Users/user/Documents/Project/plottershub/src/components/analytics/publishing-intelligence/consumption-pattern-card.tsx): Historical consumption breakdown across days of the week.
   - [`src/components/analytics/publishing-intelligence/content-supply-card.tsx`](file:///c:/Users/user/Documents/Project/plottershub/src/components/analytics/publishing-intelligence/content-supply-card.tsx): Upload volume by local day of week and 1-hour bucket.
   - [`src/components/analytics/publishing-intelligence/observed-windows-table.tsx`](file:///c:/Users/user/Documents/Project/plottershub/src/components/analytics/publishing-intelligence/observed-windows-table.tsx): Tabular breakdown of observed windows with `<EvidenceStrengthBadge />`.
   - [`src/components/analytics/publishing-intelligence/quadrant-matrix-card.tsx`](file:///c:/Users/user/Documents/Project/plottershub/src/components/analytics/publishing-intelligence/quadrant-matrix-card.tsx): 2x2 descriptive grid mapping catalog consumption vs early launch velocity.
   - [`src/app/(dashboard)/analytics/page.tsx`](file:///c:/Users/user/Documents/Project/plottershub/src/app/(dashboard)/analytics/page.tsx): Integrated view toggle between "Channel Overview" and "Publishing Intelligence".

### 26.2. API Contract
- **Method & Endpoint:** `GET /api/analytics/publishing-intelligence`
- **Query Parameters:**
  - `socialAccountId` (required, string): Target connected social account ID.
  - `format` (optional, `"LONG_FORM"` | `"SHORTS"` | `"ALL"`): Format segmentation filter (defaults to `"LONG_FORM"`).
  - `lookbackDays` (optional, `30` | `60` | `90` | `180`): Historical window (defaults to `90`).
  - `timezone` (optional, string): IANA timezone string (defaults to account `publishingTimezone` or `"UTC"`).
- **Security & RBAC:**
  - Authenticated via session cookie.
  - Workspace resolved strictly from `socialAccount.workspaceId`.
  - Enforces `analytics:view` permission on resolved workspace.

### 26.3. Calculation & Date Assignment Notes
- **Day 1 / Day 2 / Day 3 Velocity:** For a video published on calendar date $D$ in UTC, Day 1 is observation on $D$, Day 2 is observation on $D+1$, and Day 3 is observation on $D+2$. Day 2 and Day 3 metrics reflect cumulative totals.
- **Analytics Lag Cutoff:** Videos published within the last 2 days are excluded from baseline velocity metrics to prevent penalizing recently launched content before metrics mature.
- **Immutable Storage:** Zero writes or updates occur to `AnalyticsObservation`. All synthesis and quantile aggregation are executed on-demand in memory.

### 26.4. Test Coverage
- **Focused Publishing Intelligence Tests:** 46 passed across 5 test suites.
  - `publishing-intelligence.calculator.test.ts`: 18 tests (medians, IQR, evidence thresholds, quadrant classification, boundary conditions).
  - `publishing-intelligence.time.test.ts`: 9 tests (IANA timezone conversions, DST handling, hourly bucket labels, UTC day differences).
  - `publishing-intelligence.service.test.ts`: 8 tests (3-signal calculation, format filtering, day 1/2/3 cumulative velocity, sparse data handling, lag cutoffs).
  - `route.test.ts`: 6 tests (authentication, RBAC permission check, workspace derivation, invalid timezone/format validation).
  - `publishing-intelligence.test.tsx`: 5 tests (loading, empty state, data display, responsive rendering, and strict assertion verifying 0 occurrences of forbidden marketing terms).
- **Full Test Suite:** 548 passed across 46 test files (`npm test`).
- **TypeScript & Linting:** Clean exit code 0 (`tsc --noEmit`, `eslint .`).
- **Next.js Production Build:** Clean exit code 0 (`next build`).

### 26.5. Known Limitations
1. **Reporting Lag:** YouTube Analytics daily observation data has a native 24–72 hour lag; real-time active viewers cannot be queried via YouTube Analytics API.
2. **Channel-Level Hourly Audience Non-Existence:** YouTube does not provide an hourly audience presence API. Content supply uses 1-hour buckets derived from publication timestamps, while consumption patterns reflect daily aggregates across the days of the week.
3. **Sparse Catalog Handling:** Channels with fewer than 5 uploads receive `INSUFFICIENT` evidence tiers across all windows to avoid misleading creators with statistically fragile observations.

---

==================================================  
PHASE 3.4G IMPLEMENTATION STATUS:  
COMPLETE  
==================================================
