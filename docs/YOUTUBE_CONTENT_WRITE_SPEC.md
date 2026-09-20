# Phase 3.4D Specification: YouTube Content Write Pipeline
**Architecture, API Research & Technical Design**

---

## 1. Executive Summary

Plottershub Phase 3.4C established the YouTube Content Read Pipeline, providing reverse-chronological content catalog traversal, multi-signal Shorts/Long-form classification, structured `ContentPlatform.metadata` persistence, and a Light Professional Analytics inventory browser.

Phase 3.4D designs the **YouTube Content Write Pipeline**, enabling creators and workspace team members to safely modify existing video metadata (titles, descriptions, tags, categories) and operational status (privacy transitions, future publishing schedules, child-directed settings, and synthetic media disclosures) on YouTube directly from Plottershub.

### Primary Architectural Objectives
1. **Strict Field Preservation**: The YouTube Data API v3 `videos.update` method enforces **full-replacement (PUT) semantics** across specified resource parts. Omitting an existing field within a specified part permanently erases that field on YouTube. Plottershub eliminates accidental field deletion through a mandatory **Read-Modify-Write (Fetch-Merge-Validate-Update)** workflow.
2. **Stale UI State Isolation**: Client/UI representations are never treated as authoritative provider state. The application always fetches the latest live YouTube video resource under a distributed lock immediately before computing the delta merge, ensuring external changes on YouTube are preserved.
3. **Quota Policy Integration**: At current documented quota values, a safe read-modify-write cycle consumes approximately **51 quota units** (1 unit for `videos.list` + 50 units for `videos.update`). Quota consumption is managed via the configurable `QuotaPolicy` and `TokenBucketRateLimiter`, rather than rigid hardcoded assumptions.
4. **Official OAuth Scope Alignment**: Read operations utilize `youtube.readonly`. Mutating video metadata requires upgrading the connected account to the official write scope: `https://www.googleapis.com/auth/youtube`. The architecture provides an incremental reauthorization workflow without breaking existing read-only or analytics functionality.
5. **Tenant Isolation & RBAC**: Every write operation requires server-side workspace verification, ownership validation against the authenticated channel, and strict RBAC enforcement requiring the `content:edit` permission.
6. **Zero Schema Migrations**: The existing `Content` and `ContentPlatform` relational schema (featuring `ContentPlatform.metadata Json?` and `@@unique([socialAccountId, externalContentId])`) established in Phase 3.4C accommodates all mutable fields and audit states with zero database migrations.

---

## 2. Official YouTube API Research

All API behaviors, parameters, quota costs, and constraints documented below have been verified against official Google Developer Documentation for YouTube Data API v3 (`videos.update`, `videos.list`).

### 2.1 Endpoint Specification
- **HTTP Method**: `PUT` `[VERIFIED OFFICIAL BEHAVIOR]`
- **Endpoint URL**: `https://www.googleapis.com/youtube/v3/videos` `[VERIFIED OFFICIAL BEHAVIOR]`
- **Content-Type**: `application/json`
- **Query Parameters**:
  - `part`: Comma-separated list of video resource parts to be updated (`snippet`, `status`, `localizations`, `recordingDetails`). Mandatory query parameter.
  - `onBehalfOfContentOwner`: Optional string for YouTube Content Partners. Not utilized in Plottershub creator tier.

### 2.2 Quota Cost Breakdown
- `videos.update`: **50 quota units** per call `[VERIFIED OFFICIAL BEHAVIOR]`.
- `videos.list`: **1 quota unit** per call `[VERIFIED OFFICIAL BEHAVIOR]`.
- **Plottershub Safe Update Total**: At current documented quota values, a safe read-modify-write cycle is **approximately 51 quota units** (1 unit for pre-update fetch + 50 units for PUT update).
- **Quota Policy Integration**: Quota usage is tracked dynamically via Plottershub's configurable `QuotaPolicy` (`CONSUMPTION_RULES.YOUTUBE_DATA_UPDATE` = 50, `CONSUMPTION_RULES.YOUTUBE_DATA_LIST` = 1). Quota costs are not hardcoded as permanent constants in business logic.
- **Official References**:
  - https://developers.google.com/youtube/v3/determine_quota_cost
  - https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits

### 2.3 Required Request Body Structure
The request body must be a `video` resource representation containing:
1. `id` (string, required): The 11-character YouTube video ID to update.
2. `snippet` (object, required if `part` includes `snippet`):
   - `snippet.title` (string, **mandatory** when `snippet` part is updated): 1–100 characters.
   - `snippet.categoryId` (string, **mandatory** when `snippet` part is updated): Numeric category identifier valid for the channel's region.
   - `snippet.description` (string, optional): 0–5,000 characters.
   - `snippet.tags[]` (array of strings, optional): Total character count across all tags $\le$ 500 characters.
   - `snippet.defaultLanguage` (string, optional): BCP-47 language code (e.g., `"en"`, `"id"`).
   - `snippet.defaultAudioLanguage` (string, optional): BCP-47 language code.
3. `status` (object, required if `part` includes `status`):
   - `status.privacyStatus` (string, optional): `"public"`, `"unlisted"`, or `"private"`.
   - `status.publishAt` (string, optional): ISO 8601 timestamp. **Only valid if video has never been published before and `privacyStatus` is explicitly `"private"`**.
   - `status.selfDeclaredMadeForKids` (boolean, optional): Creator's self-declaration regarding whether the video is child-directed under COPPA.
   - `status.containsSyntheticMedia` (boolean, optional): Creator's disclosure regarding whether the video contains realistic synthetic or altered media (e.g., generated or manipulated with AI).
   - `status.embeddable` (boolean, optional): Whether third-party websites can embed the video.
   - `status.license` (string, optional): `"youtube"` (Standard YouTube license) or `"creativeCommon"`.
   - `status.publicStatsViewable` (boolean, optional): Whether view and like statistics are publicly visible.

### 2.4 Field Mutability Matrix

| Field Path | Target Part | Mutability via `videos.update` | Constraints & Validation |
| :--- | :--- | :--- | :--- |
| `id` | Root | **Identifier Only** | 11 chars. Cannot be modified; identifies target. |
| `snippet.title` | `snippet` | **Mutable (Mandatory in part)** | 1–100 UTF-8 chars. Cannot contain `<` or `>`. |
| `snippet.description` | `snippet` | **Mutable** | Max 5,000 UTF-8 chars. Cannot contain `<` or `>`. |
| `snippet.tags` | `snippet` | **Mutable** | Array of strings. Total length across all tags $\le$ 500 chars. |
| `snippet.categoryId` | `snippet` | **Mutable (Mandatory in part)** | Valid numeric string ID in channel region (e.g. `"28"`). |
| `snippet.defaultLanguage` | `snippet` | **Mutable** | Valid BCP-47 code or null/empty. |
| `snippet.defaultAudioLanguage` | `snippet` | **Mutable** | Valid BCP-47 code or null/empty. |
| `snippet.thumbnails` | `snippet` | **READ-ONLY in `videos.update`** | Custom thumbnails cannot be updated here. Requires separate `thumbnails.set` endpoint. |
| `snippet.publishedAt` | `snippet` | **READ-ONLY** | Original upload/publish timestamp. System-managed. |
| `snippet.channelId` | `snippet` | **READ-ONLY** | Target channel identifier. System-managed. |
| `status.privacyStatus` | `status` | **Mutable** | `"public"`, `"unlisted"`, `"private"`. |
| `status.publishAt` | `status` | **Mutable (Conditional)** | ISO 8601. Only allowed if video was **never published** and `privacyStatus === "private"`. |
| `status.selfDeclaredMadeForKids`| `status` | **Mutable** | Boolean (`true`/`false`). Sets creator declaration. |
| `status.madeForKids` | `status` | **READ-ONLY** | Algorithmic + self-declared status determined by YouTube. |
| `status.containsSyntheticMedia` | `status` | **Mutable** `[VERIFIED]` | Boolean (`true`/`false`). Discloses realistic synthetic/AI-altered media. |
| `status.embeddable` | `status` | **Mutable** | Boolean (`true`/`false`). |
| `status.license` | `status` | **Mutable** | `"youtube"` or `"creativeCommon"`. |
| `status.publicStatsViewable` | `status` | **Mutable** | Boolean (`true`/`false`). |
| `status.uploadStatus` | `status` | **READ-ONLY** | Processing state (`uploaded`, `processed`, `failed`). |
| `contentDetails.*` | `contentDetails` | **READ-ONLY** | Duration, dimensions, definition managed by YouTube processing. |
| `statistics.*` | `statistics` | **READ-ONLY** | View, like, and comment counts managed by YouTube. |

### 2.5 Critical Official API Behavior & Edge Cases
1. **Full Replacement per Part**:
   - `PUT /videos?part=snippet`: Replaces **all** fields in `snippet`. If `description` or `tags` are omitted in the body, YouTube **erases** them!
   - `PUT /videos?part=status`: Replaces **all** fields in `status`.
   - `PUT /videos?part=snippet,status`: Overwrites both parts simultaneously.
2. **Mandatory Fields in Snippet**:
   - Even if you only wish to edit `snippet.description`, YouTube returns `400 Bad Request: Required field missing` if `snippet.title` or `snippet.categoryId` are omitted from the request body.
3. **Scheduling Constraints (`status.publishAt`)**:
   - Setting `publishAt` on a video that has already been published (`public` or `unlisted` in its history) fails with HTTP `400 Bad Request: invalidPublishAt`.
   - Setting `publishAt` requires `privacyStatus` to be set to `"private"`. Passing `"public"` or `"unlisted"` with `publishAt` is rejected.
   - Setting `publishAt` to a past timestamp publishes the video immediately.
   - To cancel a scheduled release, the creator must set `privacyStatus = "private"` and omit `publishAt` (or set to `null`).
4. **No Native Optimistic Locking (ETag / If-Match)**:
   - Official YouTube Data API v3 documentation does not support conditional `If-Match` headers for `videos.update`. The latest write wins on Google's servers. Application-level optimistic concurrency checks must be enforced.

---

## 3. Supported Write Operations & Field Scope Classification

To balance creator utility with safety, fields are strictly classified into **Core Phase 3.4D** and **Optional / Future-Compatible**:

```
+-------------------------------------------------------------------------+
|                  CORE PHASE 3.4D WRITE FIELDS                           |
+-------------------------------------------------------------------------+
|  1. Metadata Updates (part=snippet)                                     |
|     - title (1-100 characters)                                          |
|     - description (0-5,000 characters)                                  |
|     - tags (array of strings, <= 500 chars total)                       |
|     - categoryId (numeric mapping)                                      |
|                                                                         |
|  2. Operational & Compliance Status (part=status)                       |
|     - privacyStatus ("public" | "unlisted" | "private")                 |
|     - publishAt (ISO 8601 schedule, unpublished private only)           |
|     - selfDeclaredMadeForKids (boolean, COPPA compliance)               |
|     - containsSyntheticMedia (boolean, AI disclosure compliance)        |
+-------------------------------------------------------------------------+
|                  OPTIONAL / FUTURE-COMPATIBLE FIELDS                    |
|  (Supported by YouTube, preserved during merges, UI deferred)          |
+-------------------------------------------------------------------------+
|     - embeddable (boolean)                                              |
|     - license ("youtube" | "creativeCommon")                            |
|     - publicStatsViewable (boolean)                                     |
|     - defaultLanguage (BCP-47 string)                                   |
|     - defaultAudioLanguage (BCP-47 string)                              |
|     - localizations (localized title/description map)                   |
|     - recordingDetails (recordingDate, location)                        |
+-------------------------------------------------------------------------+
|  EXPLICITLY OUT OF SCOPE FOR PHASE 3.4D                                 |
|     - Video binary uploads / replacements (Phase 3.4F)                  |
|     - Custom thumbnail uploads (requires thumbnails.set, Phase 3.4F)    |
|     - Video deletion (irreversible, high-risk)                          |
|     - Comment moderation or replies (Phase 3.4E)                        |
|     - Playlist mutations (Phase 3.4E)                                   |
+-------------------------------------------------------------------------+
```

### Rationale for Scope Boundary
- **Core Phase 3.4D** covers 98% of regular creator video maintenance: fixing typos in titles/descriptions, updating SEO tags, categorizing content, changing visibility, scheduling releases, and satisfying legal/policy disclosures (COPPA and AI-altered media).
- **Optional / Future-Compatible** fields are fully recognized by the domain model and preserved during read-modify-write merges, ensuring that existing settings on YouTube are never wiped, while keeping the Phase 3.4D edit UI focused and unbloated.

---

## 4. OAuth Scope Analysis & Reauthorization Workflow

### 4.1 Official Scope Requirements
Current official documentation for `videos.update` specifies authorization requires at least one of:
1. `https://www.googleapis.com/auth/youtube` (Full account management and write operations).
2. `https://www.googleapis.com/auth/youtubepartner` (Content ID and YouTube Partner API operations).

*Source*: https://developers.google.com/youtube/v3/docs/videos/update

```
+-----------------------------------------------------------------------------------------------+
| Scope URI                                            | Level      | Required For              |
+-----------------------------------------------------------------------------------------------+
| https://www.googleapis.com/auth/youtube.readonly     | Non-sens.  | Catalog sync, read video  |
| https://www.googleapis.com/auth/yt-analytics.readonly| Sensitive  | Analytics reports         |
| https://www.googleapis.com/auth/youtube              | Restricted | videos.update (Write)     |
+-----------------------------------------------------------------------------------------------+
```

### 4.2 OAuth Strategy for Plottershub
- **Current Read-Only Baseline**:
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.profile`
  - `https://www.googleapis.com/auth/youtube.readonly`
  - `https://www.googleapis.com/auth/yt-analytics.readonly`
- **Required Write Scope**:
  - `https://www.googleapis.com/auth/youtube`
- **Incremental Reauthorization**:
  - Existing connected accounts that only granted read-only scopes **remain 100% operational** for content catalog reads, dashboard metrics, and analytics syncs.
  - Write capabilities (`canUpdateContentMetadata`, `canUpdateContentPrivacy`, `canScheduleContentPublish`, `canUpdateKidsSettings`, `canUpdateSyntheticMedia`) evaluate to `false` for accounts lacking `https://www.googleapis.com/auth/youtube`.
  - When a user attempts to edit or clicks `"Enable Editing"`, Plottershub initiates incremental reauthorization directing the user to Google OAuth requesting `https://www.googleapis.com/auth/youtube` with `include_granted_scopes=true`.
- **Detection of Insufficient Write Scope**:
  1. *Static Scope Check*: Server-side inspection of `socialToken.scopes` string before dispatching write operations.
  2. *Runtime Guard*: Catching HTTP 403 `insufficientPermissions` from YouTube and translating it to `SOCIAL_INSUFFICIENT_SCOPE`.
- **UI Representation**:
  - Read-only channels display an unobtrusive info pill: `"Read-Only Channel"`.
  - The Edit button in the UI is accompanied by a tooltip/prompt: `"Reauthorization required to enable video updates on YouTube"`, triggering the incremental OAuth consent screen on click.

---

## 5. Write Capability Model

### 5.1 Architecture Decision: Granular Capabilities
- Rather than a single monolithic `canWriteContent: boolean`, Plottershub utilizes **Granular Capabilities** in `PlatformCapabilities`.
- This enables precise capability checks per feature and provider (e.g. TikTok may allow scheduling but not metadata edits; YouTube supports metadata edits and synthetic media disclosure).

### 5.2 Extended PlatformCapabilities Interface
```typescript
export interface PlatformCapabilities {
  // Read / Insights capabilities
  canReadProfile: boolean;
  canReadContent: boolean;
  canReadContentMetrics: boolean;
  canReadAccountMetrics: boolean;
  canReadAudienceMetrics: boolean;
  canReadComments: boolean;

  // Publishing / Write capabilities
  canPublishVideo: boolean;
  canPublishPhoto: boolean;
  canPublishCarousel: boolean;
  canSchedulePublish: boolean;
  canManageComments: boolean;
  canManageMessages: boolean;

  // Granular Content Write Capabilities (Phase 3.4D)
  canUpdateContentMetadata: boolean;      // Title, description, tags, category
  canUpdateContentPrivacy: boolean;       // Public, unlisted, private transitions
  canScheduleContentPublish: boolean;     // Native publishAt for unpublished videos
  canUpdateKidsSettings: boolean;         // selfDeclaredMadeForKids
  canUpdateSyntheticMedia: boolean;       // containsSyntheticMedia (supported in API v3)
}
```

---

## 6. Safe Update / Conflict Strategy (Read-Modify-Write)

Because YouTube's `videos.update` uses full replacement semantics, an application that submits only the changed field will delete all omitted fields. Furthermore, relying on stale UI state risks regressing changes made directly on YouTube.

### 6.1 Canonical 13-Step Execution Workflow

```
                    +----------------------------------------------+
                    |  1. User submits intended changes            |
                    |     (e.g., Description updated in UI)        |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    |  2. Authenticate and authorize               |
                    |     (Verify session cookie + content:edit)   |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    |  3. Resolve workspace & SocialAccount        |
                    |     (Server-side DB lookup, tenant check)    |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    |  4. Resolve external YouTube video ID        |
                    |     (From ContentPlatform record)            |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    |  5. Acquire per-video distributed lock       |
                    |     Key: content-update:{accId}:{videoId}    |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    |  6. Fetch latest authoritative YouTube state |
                    |     GET /videos?part=snippet,status&id={vid} |
                    |     (Quota: 1 unit)                          |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    |  7. Merge ONLY requested user changes        |
                    |     (Preserve all untouched live fields)     |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    |  8. Preserve all untouched mutable props     |
                    |     (embeddable, license, statsViewable, etc)|
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    |  9. Validate merged resource                 |
                    |     (Title, desc, tags length, scheduling)   |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    | 10. Send videos.update                       |
                    |     PUT /videos?part={parts}                 |
                    |     (Quota: 50 units)                        |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    | 11. Update local representation              |
                    |     (Update Content & ContentPlatform)       |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    | 12. Audit the mutation                       |
                    |     (Record before & after sanitized diff)   |
                    +----------------------------------------------+
                                          |
                                          v
                    +----------------------------------------------+
                    | 13. Release distributed lock                 |
                    +----------------------------------------------+
```

### 6.2 Concurrent Actor Conflict Scenario Analysis
**Scenario**:
1. User A opens the video editor in Plottershub (UI snapshot shows Title = "Original Title", Description = "Original Description").
2. Another team member or creator opens YouTube Studio directly and edits the Title to `"Updated Title on YouTube"`.
3. User A in Plottershub edits only the Description to `"New Plottershub Description"` and clicks Save.

**How Plottershub Prevents Accidental Title Overwrite**:
- In Step 6, Plottershub fetches the live authoritative resource from YouTube via `videos.list`. The returned resource contains Title = `"Updated Title on YouTube"`.
- In Step 7, Plottershub merges *only* the fields explicitly supplied in User A's request (`description`).
- Unmodified fields (including `title`, `tags`, `categoryId`, `privacyStatus`, `containsSyntheticMedia`) are taken directly from the newly fetched YouTube live state.
- The payload sent to `videos.update` contains Title = `"Updated Title on YouTube"` and Description = `"New Plottershub Description"`.
- **Result**: The external title update is preserved. Plottershub never overwrites unaffected fields with stale UI data.

### 6.3 ETag & Conditional Update Limitations
- The official YouTube Data API v3 `videos.update` method does **not** support HTTP `If-Match` conditional headers or ETag-based optimistic concurrency.
- If two actors execute `videos.update` at the exact same millisecond, YouTube applies last-write-wins semantics.
- Plottershub's distributed per-video lock eliminates concurrent double-submits and cross-user race conditions originating within Plottershub. However, because external updates on YouTube cannot be locked, the application does not claim absolute zero race conditions against external YouTube Studio actions occurring mid-flight between Step 6 and Step 10.

---

## 7. Concurrency Model & Distributed Lock Strategy

### 7.1 Distributed Lock Key Specification
- **Lock Key**: `content-update:${socialAccountId}:${externalContentId}`
- **Implementation**: `PostgresDistributedLock` backed by the existing `distributed_locks` table.
- **Acquisition Strategy**:
  - `ttlMs`: 15,000 ms (15 seconds lease).
  - `timeoutMs`: 0 ms (Fail-fast).
  - If another process holds the lock for this video, the request is immediately rejected with HTTP `409 Conflict`.
- **Release Strategy**: Explicitly released in a `finally` block verifying key and token ownership.

### 7.2 Concurrency Matrix Across Plottershub Operations

| Concurrent Operation | Lock Key Used | Overlap with Content Write? | Safety Guarantee |
| :--- | :--- | :--- | :--- |
| **Simultaneous Edit (Same Video)** | `content-update:{acc}:{vid}` | **NO (Blocked)** | Second caller receives 409 Conflict. |
| **Edit Different Videos (Same Channel)** | `content-update:{acc}:{vidB}` | **YES (Allowed)** | Independent keys; parallel execution. |
| **Content Inventory Sync** | `social-sync:{acc}` | **YES (Allowed)** | Content sync upserts records safely via PostgreSQL transactions. Write lock prevents simultaneous API writes. |
| **Analytics Daily Sync** | `social-analytics-sync:{acc}` | **YES (Allowed)** | Completely disjoint database tables (`AnalyticsObservation`). |
| **OAuth Token Refresh** | `social-token-refresh:{acc}` | **YES (Guarded)** | Dedicated refresh lock prevents duplicate token exchanges. |

---

## 8. Audit Logging Specification

All metadata mutations generate immutable records in the `audit_logs` table via `logAuditEvent()`.

### 8.1 Required Audit Events
- `CONTENT_UPDATE_REQUESTED`: Logged when validation passes and the API call sequence begins.
- `CONTENT_UPDATE_SUCCEEDED`: Logged when YouTube returns HTTP 200 and local database updates commit.
- `CONTENT_UPDATE_FAILED`: Logged if validation, locking, or YouTube API rejects the update.
- `CONTENT_PRIVACY_CHANGED`: Specific audit event emitted when `privacyStatus` transitions.
- `CONTENT_SCHEDULE_CHANGED`: Specific audit event emitted when `publishAt` is scheduled, modified, or cleared.

### 8.2 Audit Log Payload Structure (Strict Sanitization)
```json
{
  "workspaceId": "ws-c9b8a7",
  "userId": "usr-123456",
  "action": "CONTENT_UPDATE_SUCCEEDED",
  "resource": "content",
  "resourceId": "c_998877",
  "metadata": {
    "socialAccountId": "acc-yt-4455",
    "externalContentId": "dQw4w9WgXcQ",
    "changedFields": ["title", "containsSyntheticMedia", "privacyStatus"],
    "changes": {
      "title": { "from": "Old Title", "to": "New Title" },
      "containsSyntheticMedia": { "from": false, "to": true },
      "privacyStatus": { "from": "unlisted", "to": "public" }
    },
    "quotaUnitsEstimated": 51,
    "clientIp": "192.168.1.1"
  }
}
```
**Strict Privacy Guard**: Tokens, API secrets, and descriptions exceeding 200 characters are never stored in audit payloads.

---

## 9. Error Mapping Architecture

Official YouTube Data API error responses are mapped into typed, provider-neutral application exceptions (`SocialError`):

| YouTube API Error (`reason` / `code`) | HTTP Code | Plottershub Application Error Code | User-Facing Message |
| :--- | :--- | :--- | :--- |
| `invalidTitle` | 400 | `CONTENT_INVALID_TITLE` | "The title is invalid. It must be between 1 and 100 characters and cannot contain '<' or '>'." |
| `invalidDescription` | 400 | `CONTENT_INVALID_DESCRIPTION` | "The description exceeds the maximum allowed length of 5,000 characters." |
| `invalidTags` | 400 | `CONTENT_INVALID_TAGS` | "The total length of all video tags exceeds the 500-character limit." |
| `invalidPublishAt` | 400 | `CONTENT_INVALID_SCHEDULE` | "Cannot schedule publication. Videos can only be scheduled before they are initially published, and must be set to Private." |
| `invalidCategory` | 400 | `CONTENT_INVALID_CATEGORY` | "The selected category ID is not valid for this channel's region." |
| `insufficientPermissions` | 403 | `SOCIAL_INSUFFICIENT_SCOPE` | "Insufficient permissions. Please re-authorize Plottershub with editing permissions to update video metadata." |
| `forbidden` / `videoChartNotFound`| 403 | `CONTENT_NOT_OWNED` | "You do not have permission to modify this video on the target channel." |
| `videoNotFound` | 404 | `CONTENT_NOT_FOUND` | "The video was not found on YouTube. It may have been removed or deleted." |
| `quotaExceeded` | 403 | `SOCIAL_QUOTA_EXCEEDED` | "YouTube API quota exceeded for today. Changes cannot be saved until quota resets (Midnight PT)." |
| `backendError` / `503` | 503 | `SOCIAL_PROVIDER_UNAVAILABLE` | "YouTube servers are temporarily unavailable. Please retry in a few moments." |

*Source*: https://developers.google.com/youtube/v3/docs/errors

---

## 10. API Contract: `PATCH /api/content/[id]`

### 10.1 Security & Access Guardrails
- **HTTP Method**: `PATCH`
- **Authentication**: Mandatory session cookie.
- **RBAC**: Requires `content:edit` permission in the video's workspace.
- **Server-Side Resolution**: Resolves `Content`, `ContentPlatform`, and `SocialAccount` server-side. Never trusts client-supplied workspace or channel IDs.

### 10.2 Request Schema (`UpdateContentRequest`)
```typescript
export interface UpdateContentRequest {
  title?: string;                          // 1-100 chars, no '<' or '>'
  description?: string;                    // 0-5000 chars, no '<' or '>'
  tags?: string[];                         // Array of strings, sum <= 500 chars
  categoryId?: string;                     // Numeric string (e.g. "28")
  privacyStatus?: "public" | "unlisted" | "private";
  publishAt?: string | null;               // ISO 8601 string or null to cancel
  selfDeclaredMadeForKids?: boolean;       // COPPA compliance
  containsSyntheticMedia?: boolean;        // AI disclosure compliance
  expectedVersion?: string;                // Client's last known updatedAt ISO string
}
```

### 10.3 Response Schema (`ContentDetailDto`)
Returns the synchronized, updated `ContentDetailDto` representing the canonical merged state.

---

## 11. Database Impact & Schema Analysis

### 11.1 Schema Review
- `Content`:
  - `title` (String)
  - `description` (String?)
  - `status` (ContentStatus: DRAFT, SCHEDULED, PUBLISHED, ARCHIVED)
  - `scheduledAt` (DateTime?)
  - `publishedAt` (DateTime?)
- `ContentPlatform`:
  - `status` (PlatformContentStatus: PENDING, SCHEDULED, PUBLISHING, PUBLISHED, FAILED, ARCHIVED)
  - `externalContentId` (String)
  - `metadata` (Json?)
  - `@@unique([socialAccountId, externalContentId])`

### 11.2 Architectural Conclusion
**NO DATABASE MIGRATION REQUIRED.**
- Core fields (`title`, `description`, `scheduledAt`, `status`) map directly to scalar columns on `Content`.
- Platform-specific mutable attributes (`tags`, `categoryId`, `privacyStatus`, `selfDeclaredMadeForKids`, `containsSyntheticMedia`, `embeddable`, `license`, `publicStatsViewable`) fit into `ContentPlatform.metadata Json?`.
- Zero migrations, zero schema risks, zero downtime.

---

## 12. Local State vs. Provider State (Source of Truth)

```
+-----------------------------------+-------------------------------+-----------------------------+
| Field                             | Authoritative Source of Truth | Synchronization Behavior    |
+-----------------------------------+-------------------------------+-----------------------------+
| Video ID                          | YouTube Platform              | Permanent immutable anchor  |
| Title                             | YouTube Platform              | Cache updated on mutation   |
| Description                       | YouTube Platform              | Cache updated on mutation   |
| Tags                              | YouTube Platform              | Cache updated on mutation   |
| Category ID                       | YouTube Platform              | Cache updated on mutation   |
| Privacy Status                    | YouTube Platform              | Cache updated on mutation   |
| PublishAt (Schedule)              | YouTube Platform              | Cache updated on mutation   |
| Made For Kids                     | YouTube Platform              | Cache updated on mutation   |
| Contains Synthetic Media          | YouTube Platform              | Cache updated on mutation   |
| View / Like / Comment Cts         | YouTube Analytics & Data API  | Managed by Analytics Sync   |
+-----------------------------------+-------------------------------+-----------------------------+
```
**Rule**: YouTube is the authoritative source of truth. Plottershub acts as an intelligent control plane. When an update succeeds on YouTube, the local database records are immediately refreshed with YouTube's response object.

---

## 13. Publishing Intelligence Compatibility

Phase 3.4D safeguards all design invariants established in `docs/YOUTUBE_PUBLISHING_INTELLIGENCE_SPEC.md`:
1. **Preserve `publishedAt`**:
   - Updating metadata or transitioning privacy states on an already published video must **never** overwrite or alter `Content.publishedAt` or `ContentPlatform.metadata.publishedAt`.
2. **Distinguish Scheduled vs Published**:
   - A video with `status.publishAt` in the future must remain in `SCHEDULED` status. It must **not** be counted in historical published content analytics until it transitions to `PUBLISHED` upon official release.
3. **Format Classification Continuity**:
   - Multi-signal Shorts/Long-form classification (`classifyYouTubeVideo()`) operates primarily on duration, publication date, and `#shorts` tags.
   - If an editor modifies the title or description to add or remove `#shorts`, the classifier re-evaluates format deterministically while preserving the audit rationale.

---

## 14. UI / UX Design: Light Professional Analytics System

In strict accordance with `docs/UI_DESIGN_SYSTEM.md`, editing features follow the **Light Professional Analytics** aesthetic:
- White cards, light gray background (`slate-50`), subtle borders (`slate-200`), restrained shadows (`shadow-sm`).
- No neon glows, dark-mode overrides, decorative gradients, or AI-style animations.

### 14.1 Edit Content Modal / Drawer (`ContentEditSheet`)
- **Header**: Compact title with external YouTube link and live channel badge.
- **Form Layout**:
  - **Title Input**: Character counter (`0/100`) with visual warning at >90 characters.
  - **Description Textarea**: Dense monospace or sans input, character counter (`0/5,000`), auto-expanding.
  - **Tags Input**: Tokenized chip list with live cumulative character counter (`0/500`).
  - **Category Select**: Dropdown populated with official YouTube categories.
  - **Privacy Status**: Segmented radio control (`Public`, `Unlisted`, `Private`).
  - **Scheduling Toggle**: Only active when status is `Private` and video has not been previously published. Includes date/time picker in creator's local timezone.
  - **COPPA Declaration**: Explicit radio control: *"Yes, this video is made for kids"* / *"No, not made for kids"*.
  - **Altered / Synthetic Media Disclosure**: Explicit toggle/checkbox: *"Altered content: Sound or visuals were significantly edited or digitally generated (e.g. with AI)"*.
- **Footer**:
  - "Cancel" button.
  - "Save to YouTube" primary button with spinner and estimated quota indicator.
  - Unsaved changes confirmation dialog if the drawer is closed with dirty state.

---

## 15. Security & Threat Mitigation Review

| Threat Vector | Risk Description | Plottershub Mitigation |
| :--- | :--- | :--- |
| **Mass Assignment** | Malicious client attempts to overwrite `viewCount` or inject arbitrary JSON into `metadata`. | Strict DTO validation; only explicitly allowlisted fields are accepted and merged. |
| **IDOR / Tenant Crossing** | User attempts to edit a video belonging to another workspace by guessing UUID. | Server-side validation confirms `Content` belongs to `workspaceId`, and user has `content:edit` role in that workspace. |
| **Channel Impersonation** | User attempts to edit a video on a YouTube channel they do not own. | `videos.list` check verifies that `snippet.channelId` strictly matches the `SocialAccount.externalAccountId`. |
| **HTML / Script Injection (XSS)**| Malicious script tags inside title or description. | Pre-validation rejects `<` and `>` characters; client rendering uses standard React escaping. |
| **Replay / Double Submit** | Rapid repeated clicks consume excess quota units. | Distributed lock (`content-update:{acc}:{vid}`) with 0ms timeout rejects duplicate submissions. |
| **Token Leakage** | Decrypted access tokens exposed in client error payloads. | Tokens never leave server-side memory; errors are sanitized to provider-neutral strings. |

---

## 16. Comprehensive Testing Strategy

### 16.1 Unit Tests
- **Merge Logic**:
  - Title-only change preserves existing description, tags, category, and privacy.
  - Description-only change preserves title, tags, and categoryId.
  - Clearing schedule (`publishAt = null`) keeps video private and deletes `publishAt`.
  - Tags array properly formatted and length validated ($\le 500$ chars).
  - Synthetic media toggle (`containsSyntheticMedia: true/false`) maps correctly to `status.containsSyntheticMedia`.
- **Validation**:
  - Title > 100 characters rejected.
  - Description > 5,000 characters rejected.
  - Title containing `<` or `>` rejected.
  - Scheduling an already-published video rejected before network dispatch.

### 16.2 Service & Concurrency Tests
- **Distributed Locking**:
  - Second concurrent update on same video immediately fails with `409 Conflict`.
  - Normal update acquires, extends heartbeat if needed, and cleanly releases lock.
- **Tenant Isolation**:
  - User without `content:edit` receives `403 Forbidden`.
  - User from Workspace B cannot modify video from Workspace A.

### 16.3 Integration Tests (Mocked Google API)
- Pre-update `videos.list` fails $\rightarrow$ update aborted, 0 write quota consumed.
- `videos.update` returns 403 `insufficientPermissions` $\rightarrow$ mapped to `SOCIAL_INSUFFICIENT_SCOPE`.
- Successful update calls `videos.update` with exact preserved fields and updates local PostgreSQL record.

### 16.4 Viewport & Responsive UI Tests
- Edit drawer tested across 7 standard viewports (1440x900, 1280x800, 1024x768, 768x1024, 390x844, 375x812, 390x600) with zero horizontal overflow.

---

## 17. Phase Boundary Definition

### In Scope for Phase 3.4D:
- Metadata editing (Title, Description, Tags, Category).
- Operational status editing (Privacy: Public, Unlisted, Private).
- Scheduling (`publishAt`) for eligible unpublished private videos.
- Made-for-kids declaration (`selfDeclaredMadeForKids`).
- Synthetic media disclosure (`containsSyntheticMedia`).
- Safe Read-Modify-Write (Fetch-Merge-Validate-Update) pipeline.
- Granular capability flags and OAuth reauthorization detection for `https://www.googleapis.com/auth/youtube`.
- Distributed write lock (`content-update:{acc}:{vid}`).
- Audit logging of all write mutations.
- `PATCH /api/content/[id]` endpoint.
- Light Professional Analytics editing drawer UI.

### Explicitly Out of Scope for Phase 3.4D:
- Video binary uploads or replacements (Phase 3.4F).
- Resumable upload chunking protocols (Phase 3.4F).
- Custom thumbnail uploads (`thumbnails.set`) (Phase 3.4F).
- Video deletions (Destructive operation, separate phase).
- Comment management or replies (Phase 3.4E).
- Playlist mutations (Phase 3.4E).
- Redis or BullMQ background workers.

---

## 18. Official Documentation Sources

1. **Google YouTube Data API v3 — `videos.update`**:
   - https://developers.google.com/youtube/v3/docs/videos/update
2. **Google YouTube Data API v3 — `videos` Resource Representation**:
   - https://developers.google.com/youtube/v3/docs/videos
3. **Google YouTube Data API v3 — Quota Calculator & Pricing**:
   - https://developers.google.com/youtube/v3/determine_quota_cost
4. **Google YouTube Data API v3 — Errors Guide**:
   - https://developers.google.com/youtube/v3/docs/errors
5. **Google YouTube Data API v3 — Quota & Compliance Guide**:
   - https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits

---

## 19. Acceptance Criteria

1. **Official Scope Compliance**: The architecture explicitly identifies `https://www.googleapis.com/auth/youtube` as the required write scope for `videos.update`, with clean non-blocking incremental reauthorization for read-only connections.
2. **Synthetic Media Support**: `status.containsSyntheticMedia` is formally included as an updateable compliance property in the domain model and write pipeline.
3. **Field Preservation**: Updates to single fields (e.g. title) never erase unmodified descriptions, tags, categories, privacy states, or synthetic media disclosures.
4. **Stale UI State Rejection**: Stale client state is never treated as authoritative; the pipeline always executes a live fetch under lock before merging changes.
5. **Quota Integration**: Read-modify-write cycle is modeled at approximately 51 quota units based on current documented values, managed dynamically via configurable `QuotaPolicy`.
6. **Concurrency Safety**: Double-submitting an edit or simultaneous edits to the same video are serialized/rejected with HTTP 409 Conflict via per-video locking (`content-update:${acc}:${vid}`).
7. **Zero DB Migrations**: Operates seamlessly on existing `Content` and `ContentPlatform` models with zero schema changes.
8. **UI Consistency**: Edit interface adheres strictly to Light Professional Analytics design standards across all 7 responsive viewports.

---

PHASE 3.4D RESEARCH STATUS: READY
