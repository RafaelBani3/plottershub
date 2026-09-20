# YouTube Publishing Intelligence Specification
## Audience Consumption, Content Supply & Launch Velocity Analysis
### Phase 3.4A Extension Document

---

## 1. Executive Summary & Boundary Definitions

**Publishing Intelligence** is an empirical decision-support capability in Plottershub that analyzes historical publication patterns and post-publication viewing velocity.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              WHAT PUBLISHING INTELLIGENCE                              │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│                  CAN DO                   │                  CANNOT DO                 │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ • Analyze daily consumption trends across │ • Show concurrent "active viewers online   │
│   days of the week (Mon–Sun).             │   now" by hour (API restriction).          │
│ • Extract exact publication timestamps    │ • Claim that publishing at a specific hour │
│   (UTC + configured publishing timezone). │   guarantees algorithmic virality.         │
│ • Measure Post-Publication Day 1, Day 2   │ • Treat daily calendar aggregations as     │
│   cumulative, and Day 3 cumulative views. │   exact 24h, 48h, or 72h windows.          │
│ • Separate historical audience consumption│ • Confuse viewer consumption with creator  │
│   from creator content supply.            │   content upload volume.                   │
│ • Evaluate Evidence Strength (STRONG,     │ • Infer Shorts classification solely from  │
│   MODERATE, LIMITED, INSUFFICIENT).       │   duration/aspect ratio heuristics.        │
│ • Provide non-causal creator guidance.    │ • Infer creator timezone from audience IP. │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 2. Official YouTube Data Capability Matrix

| Data Signal | Available via API? | API Resource / Report | Dimensions Used | Metrics Available | Supported Granularity | Latency | Documented Quota Cost | Technical Boundary Notes |
| :--- | :---: | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **Channel Daily Consumption** | **YES** | `reports.query` | `day` | `views`, `estimatedMinutesWatched`, `likes`, `subscribersGained`, `shares` | **Daily** | 48–72h | **1 unit** | Measures daily channel consumption. Does not expose intraday consumption hours. |
| **Hourly Audience Online Activity** | **NO** | *None* | *None* | *None* | *N/A* | *N/A* | *N/A* | **Not exposed in YouTube API**. The YouTube Studio purple chart is proprietary. **No hourly audience heatmap can be generated.** |
| **Video Publication Timestamp** | **YES** | `videos.list` (Data API) | *N/A* | `snippet.publishedAt` | **Second (ISO 8601 UTC)** | Real-time | **1 unit** (batch 50) | Precise timestamp used to derive publication day of week, hour of day, and configured local time bucket. |
| **Post-Publication Daily Velocity** | **YES** | `reports.query` | `day`, `filters: video=={id}` | `views`, `estimatedMinutesWatched`, `likes`, `comments` | **Daily** | 48–72h | **1 unit** per video | Reports Post-Publication Day 1, Day 2 cumulative, and Day 3 cumulative totals. **Not exact 24h/48h/72h periods.** |
| **Official Content / Product Type** | **YES** | `reports.query` | `youtubeProduct`, `creatorContentType` | `views`, `watchTime` | **Daily** | 48–72h | **1 unit** | Filters `youtubeProduct==SHORTS` or `creatorContentType`. If unavailable, classified as `UNKNOWN`. |
| **Audience Demographics & Geography** | **YES** | `reports.query` | `ageGroup`, `gender`, `country` | `viewerPercentage` | **Aggregated (30d+)** | 48–72h | **1 unit** | Used for audience demographic distributions. **Never used to infer creator timezone.** |

---

## 3. Separation: Audience Consumption vs. Content Supply

To eliminate confounding variables, Plottershub explicitly separates:

1. **Historical Audience Consumption**: Total daily views and watch time across the channel catalog on day $d$. Reflects baseline viewing volume of existing content.
2. **Content Supply (Creator Publishing Volume)**: Number of uploads published on day $d$ over the lookback window.
3. **Publishing Performance (Normalized Early Velocity)**: Post-Publication Day 1 Views (`day1Views`) and cumulative post-publication metrics for videos published on day $d$.

*Analytical Truth*: A day with higher aggregate views does NOT prove higher concurrent audience availability. It may indicate higher catalog back-consumption or higher publishing frequency. The UI displays both metrics side-by-side.

---

## 4. Post-Publication Metric Definitions (Cumulative vs. Incremental)

Plottershub defines canonical post-publication metrics strictly to avoid conflating calendar observations with exact intraday durations:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                  CANONICAL POST-PUBLICATION METRIC DEFINITIONS                         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ • `day1Views`: Views recorded on the first applicable analytics calendar day of release│
│ • `day2CumulativeViews`: Cumulative views recorded through the second calendar day     │
│ • `day3CumulativeViews`: Cumulative views recorded through the third calendar day     │
│ • `day1WatchTime`: Watch time recorded on the first calendar day of release            │
│ • `day2CumulativeWatchTime`: Cumulative watch time through the second calendar day     │
│ • `day3CumulativeWatchTime`: Cumulative watch time through the third calendar day     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

```
Illustrative timeline for Video published 2026-08-10 18:30 UTC:
  [2026-08-10 18:30 to 23:59 UTC] ──► Observation Day 1 ──► day1Views = 1,420
  [2026-08-11 00:00 to 23:59 UTC] ──► Observation Day 2 ──► day2CumulativeViews = 1,420 + 2,850 = 4,270
  [2026-08-12 00:00 to 23:59 UTC] ──► Observation Day 3 ──► day3CumulativeViews = 4,270 + 1,980 = 6,250
```

---

## 5. Shorts Classification Policy

1. **Canonical Primary**: Query `reports.query` with `youtubeProduct==SHORTS` or verify against `creatorContentType`.
2. **Fallback / Unverified**: If the official API does not expose a product tag for an observation, the classification is recorded as:
   ```ts
   contentType: "UNKNOWN"
   ```
3. **Heuristic Status**: Aspect ratio ($9:16$) and duration ($\le 60\text{s}$) are preserved strictly as **optional heuristic metadata** (`durationSeconds`, `aspectRatio`), never as canonical platform identity.

---

## 6. Timezone Architecture: Explicit `publishingTimezone`

1. `publishingTimezone` is stored in Workspace / SocialAccount settings as an IANA string (e.g., `"America/New_York"`, `"Europe/London"`, `"Asia/Jakarta"`).
2. If configured: converts all `snippet.publishedAt` (UTC) to `publishedAtLocal` using IANA rules.
3. If unconfigured: displays "Publishing Timezone Not Configured" banner. Prompts creator to select their local timezone.
4. Persisted data triad:
   - `publishedAtUtc`: DateTime (ISO 8601 UTC)
   - `publishingTimezone`: String (Configured IANA identifier)
   - `publishedAtLocal`: DateTime (Derived local representation)

---

## 7. Evidence Strength Model

| Tier Level | Criteria & Thresholds | Creator Meaning |
| :--- | :--- | :--- |
| **STRONG** | Sample Size $\ge 20$ comparable uploads, Consistency Score $\ge 0.70$, Lookback $\ge 90$ days | Substantial historical evidence across uploads; highly repetitive pattern. |
| **MODERATE** | Sample Size $\ge 10$ comparable uploads, Consistency Score $\ge 0.50$, Lookback $\ge 60$ days | Meaningful historical trend with moderate variance; solid directional guidance. |
| **LIMITED** | Sample Size $\ge 5$ comparable uploads, high variance or short historical span | Preliminary correlation; vulnerable to outliers. |
| **INSUFFICIENT** | Sample Size $< 5$ comparable uploads, or incomplete post-publication observations | Recommendation suppressed. No credible evidence. |

---

## 8. Deterministic Window Ranking & Selection Logic

1. **Filter Eligible Windows**: Discard any (Day, TimeBucket) where $\text{UploadCount} < 3$.
2. **Calculate Baseline Performance**: $\text{Baseline} = \text{Median}(\{v.\text{day1Views} \mid v \in \text{AllEligibleVideos}\})$.
3. **Compute Window Median Velocity**: $\text{WindowMedian}(d, w) = \text{Median}(\{v.\text{day1Views} \mid v \in \text{VideosPublished}(d, w)\})$.
4. **Compute Relative Delta**: $\Delta\text{Relative}(d, w) = ((\text{WindowMedian}(d, w) - \text{Baseline}) / \text{Baseline}) \times 100\%$.
5. **Rank by Relative Velocity Gain**: Rank eligible windows primarily by $\Delta\text{Relative}(d, w)$.
6. **Tie-Breaking**: If multiple windows exhibit similar $\Delta\text{Relative}$ (within $\pm 3\%$), select window with higher Sample Size. If equal, select lower variance (higher consistency).
7. **Minimum Delta Gate**: If the top-ranked window has $\Delta\text{Relative} < +5.0\%$, return status `"NO_MEANINGFUL_DIFFERENCE"`.

---

## 9. Graph & Quadrant Terminology (Matrix Model)

All references to "optimal" or "sub-optimal" are removed. The quadrant matrix describes observed empirical intersections:

* **Top-Right (High Consumption / High Early Performance)**: *"Videos published in this window historically coincided with both higher channel consumption and above-baseline Day 1 viewing velocity."*
* **Bottom-Right (High Consumption / Low Early Performance)**: *"Channel viewing consumption is strong during this period, but videos published here did not achieve above-baseline Day 1 velocity. Timing alone did not drive launch performance."*
* **Top-Left (Low Consumption / High Early Performance)**: *"Videos published in this window achieved above-baseline Day 1 velocity despite lower channel-wide consumption on that day, indicating strong topic resonance or external traffic."*
* **Bottom-Left (Low Consumption / Low Early Performance)**: *"Historical observations show both lower channel consumption and below-baseline Day 1 velocity for uploads in this window."*

---

## 10. Illustrative Structured Narrative Examples

### Example 1: Sufficient Evidence
* **[OBSERVED]**: *"Over the last 90 days, YouTube recorded 1.42M views across your channel. Friday accounted for 24.1% of total catalog watch time (Highest day). You published 23 videos on Fridays."*
* **[DERIVED]**: *"Among the 18 videos published during Friday 18:00–21:00 (EST), the median Post-Publication Day 1 view count (`day1Views`) was 18,400, compared to your channel baseline median of 12,700 views (+44.9%). The median Post-Publication Day 2 cumulative view count (`day2CumulativeViews`) reached 32,100."*
* **[INTERPRETED]**: *"Evidence Strength is MODERATE based on 18 comparable uploads and consistent performance across the lookback period. This correlation indicates that historical Friday evening uploads achieved stronger launch velocity. This is an empirical correlation and does not guarantee future performance."*
*(Illustrative example).*

### Example 2: Insufficient Evidence
* **[OBSERVED]**: *"Over the last 90 days, your channel published 4 videos across different days and hours."*
* **[DERIVED]**: *"No time window contains at least 3 comparable uploads. Total uploads (4) is below the minimum analysis threshold (10 uploads)."*
* **[INTERPRETED]**: *"Evidence Strength is INSUFFICIENT. Publishing Intelligence cannot recommend a window without sufficient historical data. Continue publishing consistently to unlock launch velocity patterns."*
*(Illustrative example).*

---

## 11. YouTube Capability Matrix (Phase 3.4 Integration)

| Capability | API Method & Resource | OAuth Scope | Quota Bucket / Cost | Retry Class | Target Phase | Technical Boundary Notes |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Read Video Metadata** | `GET /youtube/v3/videos` | `youtube.readonly` | General Bucket (1 unit) | Transient HTTP | **3.4C** | Extracts `publishedAt` (UTC) and `duration`. |
| **Update Video Metadata** | `PUT /youtube/v3/videos` | `youtube.force-ssl` | General Bucket (50 units) | Non-retryable on 400 | **3.4D** | Full snippet replacement required. |
| **Delete Video** | `DELETE /youtube/v3/videos` | `youtube.force-ssl` | General Bucket (50 units) | Non-retryable | **3.4D** | Irreversible operation; requires confirmation. |
| **Resumable Upload** | `POST /upload/youtube/v3/videos` | `youtube.upload` | **Video Uploads Bucket** | Resumable Protocol | **3.4F** | **Uses configurable resumable chunking aligned to YouTube's documented chunk-size requirements.** Persists session URI. |
| **Set Custom Thumbnail** | `POST /upload/youtube/v3/thumbnails/set`| `youtube.upload` | General Bucket (50 units) | Transient HTTP | **3.4F** | Max 50 MB; JPEG/PNG. WebP converted app-side. |
| **List Playlists & Items** | `GET /youtube/v3/playlists` | `youtube.readonly` | General Bucket (1 unit) | Transient HTTP | **3.4E** | Lists playlists and items with `mine=true`. |
| **Add / Remove Playlist Item**| `POST / DELETE /playlistItems`| `youtube.force-ssl` | General Bucket (50 units) | Non-retryable on 400 | **3.4E** | Curates video references inside playlists. |
| **Read Comment Threads** | `GET /youtube/v3/commentThreads` | `youtube.readonly` | General Bucket (1 unit) | Transient HTTP | **3.4E** | Retrieves top-level comment threads. |
| **Reply to Comment** | `POST /youtube/v3/comments` | `youtube.force-ssl` | General Bucket (50 units) | Non-retryable on 400 | **3.4E** | Creates a child reply (`snippet.parentId`). |
| **Create Comment Thread** | `POST /youtube/v3/commentThreads` | `youtube.force-ssl` | General Bucket (50 units) | Non-retryable on 400 | **3.4E** | Creates a new top-level thread on a video. |
| **Scheduled Publishing** | `POST /upload/youtube/v3/videos` | `youtube.upload` | **Video Uploads Bucket** | Resumable Protocol | **3.4F** | `status.privacyStatus = "private"` + `status.publishAt`. |
| **Publishing Intelligence**| Internal Pipeline | None (Internal) | **0 API Units** | Internal Computation | **3.4G** | Computes velocity from persisted observations. |

---

## 12. Updated Phase Roadmap

```
Phase 3.4A (Current): Core Research, Corrections & Architectural Specifications
  ├── Workstream A: YouTube Content Management Architecture
  ├── Workstream B: UI/UX Visual Redesign System (Zinc/Slate, 4–6px radii, 1px borders)
  └── Extension: Publishing Intelligence Methodology & Decision Logic
         │
         ▼
Phase 3.4B: Global UI Foundation / Visual Redesign Implementation
  └── Clean layout, high-density components, collapsible AI diagnostic utility
         │
         ▼
Phase 3.4C: YouTube Content Read Pipeline (Metadata & Listing)
Phase 3.4D: YouTube Content Write & Moderation Pipeline (Updates & Deletions)
Phase 3.4E: Playlists & Community Management (Threads & Replies)
Phase 3.4F: Resumable Upload Engine & Scheduling Architecture
         │
         ▼
Phase 3.4G: Publishing Intelligence Implementation
  ├── PublishingIntelligenceEngine & Post-Publication Day 1 / Day 2 / Day 3 Cumulative Metrics
  ├── Configured Timezone & Evidence Strength Engine
  └── Dedicated Publishing Intelligence Dashboard & Explanations (Light Professional Analytics)
         │
         ▼
Phase 4: Redis + BullMQ Asynchronous Distributed Workers
```

---

## 13. UI Visual Direction & Component Foundation (Phase 3.4B / 3.4G Alignment)

As established in Phase 3.4B and specified in `docs/UI_DESIGN_SYSTEM.md` (Section 7), the Publishing Intelligence UI follows the **Light Professional Analytics** design system:

### Visual Aesthetics
- **Canvas**: Light gray page background (`#F4F4F5` / `#F8F9FA`).
- **Cards**: Pure white cards (`#FFFFFF`) with restrained shadows (`shadow-sm`) and subtle 1px borders (`rgba(0, 0, 0, 0.08)`).
- **Radii**: 6px (`rounded-md`).
- **Charts**: Crisp, business-analytics visual style with minimal ornamentation. Strictly no gradients, no glow circles, and no oversized AI hero visualizations.

### The 7 Analytical Views to Support in Phase 3.4G
1. **Historical Consumption Pattern**: Line or stepped-area chart by day/time bucket where officially supported. Strictly NOT labeled as "concurrent viewers" or "viewers currently online". Never fabricate hourly audience data.
2. **Content Supply**: Upload volume bar chart by day/time window, kept analytically separate from consumption.
3. **Publishing Performance**: Post-publication Day 1 / Day 2 cumulative / Day 3 cumulative views and watch time.
4. **Consumption vs Publishing Performance**: Scatter/matrix visualization with descriptive conceptual quadrants (*High Consumption / High Early Performance*, *High Consumption / Low Early Performance*, *Low Consumption / High Early Performance*, *Low Consumption / Low Early Performance*). No "optimal/suboptimal" value labels.
5. **Publishing Window Analysis**: Dense table + time-window pills (day-of-week × window, upload count, median early performance, relative delta, and evidence strength badge).
6. **Publishing Intelligence Summary**: Diagnostic observation cards (e.g. *"Historical uploads in this window achieved higher Day 1 viewing velocity."*). Prohibited terms: *"Best time to upload"*, *"Guaranteed viral time"*, *"Optimal time"*.
7. **Evidence Strength Indicator**: Supported via reusable `<EvidenceStrengthBadge level="..." />` primitive (`Strong`, `Moderate`, `Limited`, `Insufficient`). Explicitly communicates historical observation depth, not statistical confidence.

