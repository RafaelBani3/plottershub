# YouTube Video Upload & Publishing Architecture Specification
## Phase 3.4F — Architecture Freeze & Design Specification

---

## 1. Executive Summary

This document establishes the authoritative architectural freeze and technical specification for **Phase 3.4F: YouTube Video Upload & Publishing Architecture** in Plottershub.

### 1.1 Objective & Scope
The objective of Phase 3.4F is to design an enterprise-grade, resilient, secure, and quota-conscious publishing pipeline for YouTube video content. This specification covers:
1. **Resumable Upload Protocol**: Reliable, chunk-based video uploading to YouTube via the Data API v3 (`videos.insert`).
2. **Publishing Lifecycle State Machine**: Multi-state `PublishingJob` engine supporting both immediate publishing and native scheduled releases (`status.publishAt`).
3. **Decoupled Thumbnail Management**: Independent thumbnail upload and failure handling via `thumbnails.set`.
4. **Storage & Provider Abstractions**: Cloud-agnostic `MediaStorage` abstraction for staging assets, coupled with modular `SocialPublisher` / `YouTubePublisher` interfaces.
5. **Concurrency, Idempotency & Locking**: Global two-tier distributed locking (`PostgresDistributedLock`), idempotent retry handling, and safe reconciliation for ambiguous upload outcomes.
6. **Strict Security & Observability**: Upload session URI confidentiality, OAuth scope gating, RBAC permissions, dynamic quota tracking, and sanitized audit logging.

### 1.2 Boundary & Guardrails
- **RESEARCH + ARCHITECTURE FREEZE ONLY**: No application code is executed, no Prisma migrations are created or run, and no production infrastructure is altered in this phase.
- **No Redis / BullMQ in Phase 3.4F**: Queue-based distributed workers, task leasing engines, and background schedulers remain strictly deferred to **Phase 4**.
- **No Direct Heavy Media in Next.js Server Runtimes**: Direct buffering of multi-megabyte/gigabyte video files through Next.js server actions or API body parsers is strictly prohibited.
- **Single Source of Truth**: `ContentPlatform.externalContentId` remains the sole canonical provider content identity. No duplicate external video IDs are stored in `PublishingJob`.
- **Realistic Semantic Boundaries**: Plottershub does **NOT** claim exactly-once delivery, nor does it claim duplicate prevention is guaranteed when provider outcomes are unknown.

---

## 2. Official YouTube API Findings vs. Plottershub Architecture Decisions

To maintain absolute technical precision, this section explicitly separates **official YouTube API specifications** from **Plottershub application architecture decisions**.

### 2.1 API Endpoints & Official References
| Method | Protocol & Endpoint | HTTP Verb | Official Purpose | Official Documentation Reference |
| :--- | :--- | :---: | :--- | :--- |
| **`videos.insert` (Initiate Session)** | `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` | `POST` | Initializes a resumable upload session; returns upload URI in `Location` header. | [YouTube Data API - videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) |
| **`videos.insert` (Transfer Chunks)** | `<upload_session_uri>` | `PUT` | Transmits byte ranges (chunks) of the video file to YouTube's media ingestion servers. | [Using Resumable Upload Protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol) |
| **`videos.insert` (Check Status)** | `<upload_session_uri>` | `PUT` | Queries the exact byte offset received by YouTube following a network drop. | [Resumable Upload - Check Status](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol#check_upload_status) |
| **`thumbnails.set`** | `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={videoId}&uploadType=media` | `POST` | Sets a custom thumbnail image for an uploaded video. | [YouTube Data API - thumbnails.set](https://developers.google.com/youtube/v3/docs/thumbnails/set) |
| **`videos.update`** | `https://www.googleapis.com/youtube/v3/videos?part=snippet,status` | `PUT` | Updates metadata or privacy status of an existing video. | [YouTube Data API - videos.update](https://developers.google.com/youtube/v3/docs/videos/update) |

---

### 2.2 Distinctions: YouTube API Constraints vs. Plottershub Decisions

#### A. Resumable Upload Mandate
- **Official YouTube API Capability**: YouTube Data API v3 supports two upload protocols:
  1. *Direct multipart upload* (`uploadType=multipart`): Single HTTP request containing both JSON metadata and video media. Officially recommended only for small media files ($\le 5\text{ MB}$).
  2. *Resumable upload* (`uploadType=resumable`): Two-stage protocol where a session is created and chunks are streamed.
- **Plottershub Architecture Decision**: **Plottershub standardizes on resumable uploads for production video publishing as an application architecture decision.** Even though YouTube technically permits single-request multipart uploads for small files, Plottershub mandates the resumable protocol across all uploads to ensure pause/resume capability, network drop recovery, unified progress telemetry, and uniform worker execution.

#### B. Chunk Sizing Rules
- **Official YouTube API Requirement**: When using the chunked resumable upload protocol, YouTube strictly requires that **every chunk size must be an exact multiple of 256 KiB** ($256 \times 1024 = 262,144$ bytes), with the sole exception of the final chunk containing the file's remaining bytes. Sending a non-final chunk that is not a multiple of 256 KiB triggers an immediate HTTP `400 Bad Request` (`invalidRangeHeader`).
- **Plottershub Architecture Policy**: Plottershub adopts **8 MiB** ($8,388,608$ bytes, which is $32 \times 256\text{ KiB}$) as the **default implementation chunk size**. Google's documentation recommends chunk sizes of at least 8 MiB (or 16–32 MiB) to achieve optimal network throughput. 8 MiB is an application policy tuned for serverless/worker memory limits, not a YouTube API requirement.

#### C. Scheduling Rules (`status.publishAt` & `privacyStatus`)
- **Official YouTube API Requirement**:
  1. If `status.publishAt` is specified, `status.privacyStatus` **MUST BE SET TO `"private"`**. If `privacyStatus` is `public` or `unlisted`, YouTube rejects the request with HTTP 400 (`invalidPublishAt`).
  2. `status.publishAt` can only be set if the video has **never been published before**.
  3. Setting a date/time in the past causes YouTube to publish the video immediately.
  4. YouTube does not enforce a rigid minimum lead time, though practical lead time (15–30 min) is recommended for transcoding.
- **Plottershub Architecture Decision**: Plottershub validates timestamps locally to ensure `scheduledAtUtc > now() + 15 minutes`, stores scheduled timestamps internally in UTC, and converts them to the creator's configured IANA `publishingTimezone` for user display. Plottershub uses YouTube's native scheduler and does **not** run an application-level cron as the primary release mechanism.

#### D. Thumbnail Rules (`thumbnails.set`)
- **Official YouTube API Requirement**: Officially accepts `image/jpeg` and `image/png` (and `application/octet-stream`). Maximum file size is 50 MB (increased from 2 MB in late 2025/2026). Recommended resolution is 1280×720 (minimum width 640 px). Consumes **50 quota units**. WebP is **not** officially documented as supported by `thumbnails.set`.
- **Plottershub Architecture Decision**: Plottershub enforces client-side MIME validation rejecting raw WebP uploads unless pre-converted to PNG/JPEG in the browser or staging pipeline before dispatching to YouTube.

#### E. Quota Model & The Dedicated `videos.insert` Bucket
- **Official YouTube API Behavior (Current as of 2026)**: YouTube Data API v3 has transitioned `videos.insert` into a **dedicated video upload quota bucket** (default allocation of 100 upload calls per day per project), distinct from the general 10,000-unit daily API pool. Legacy un-migrated projects still consume 1,600 units from the shared pool.
- **Plottershub Architecture Decision**: Quota limits and method costs are modeled dynamically in `QuotaPolicy` (`VIDEO_UPLOAD`, `THUMBNAIL_UPLOAD`, `DEFAULT_API`), preventing hardcoded numbers in business logic.

#### F. Unverified API Project Restrictions
- **Official YouTube API Behavior**: Videos uploaded via API from developer projects created after July 28, 2020 that have not completed the official YouTube API Compliance Audit are **automatically locked to private mode** (`locked as private`). There is no user-facing appeal process; resolving this requires the project owner to complete the [YouTube API Services Compliance Audit](https://support.google.com/youtube/contact/yt_api_form).
- **Plottershub Architecture Decision**: Plottershub detects project verification status and displays an informative banner in the UI to prevent creator confusion regarding why uploaded videos cannot be set to public.

#### G. OAuth Scopes
- **Official YouTube Requirement**: `videos.insert` and `thumbnails.set` require at least one of:
  - `https://www.googleapis.com/auth/youtube.upload` (Recommended least-privilege upload scope)
  - `https://www.googleapis.com/auth/youtube`
  - `https://www.googleapis.com/auth/youtube.force-ssl`
  - `https://www.googleapis.com/auth/youtubepartner`

---

## 3. Upload Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                PLOTTERSHUB UPLOAD ARCHITECTURE                         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   1. Direct Staging               2. Job Queued                  3. Chunked Upload     │
│   ┌────────────────┐             ┌──────────────┐              ┌────────────────┐      │
│   │    Browser     │             │  Plottershub │              │    YouTube     │      │
│   │   (Creator)    │             │  App Server  │              │    Servers     │      │
│   └───────┬────────┘             └──────┬───────┘              └───────┬────────┘      │
│           │                             │                              │               │
│           │ 1a. Request Staging URL     │                              │               │
│           ├────────────────────────────►│                              │               │
│           │ 1b. Pre-signed Staging URL  │                              │               │
│           │◄────────────────────────────┤                              │               │
│           │                             │                              │               │
│           │ 1c. Stream Video to Staging │                              │               │
│           ▼                             │                              │               │
│     ┌───────────┐                       │                              │               │
│     │MediaStaging│◄─────────────────────┤                              │               │
│     │ (S3 / R2) │   Staged Key Recorded │                              │               │
│     └─────┬─────┘                       │                              │               │
│           │                             │ 2a. Init Resumable Session   │               │
│           │                             ├─────────────────────────────►│               │
│           │                             │ 2b. Secret Session URL       │               │
│           │                             │◄─────────────────────────────┤               │
│           │                             │                              │               │
│           │ 3a. Read Chunks (8MB)       │ 3b. PUT Chunk (Content-Range)│               │
│           │◄────────────────────────────┼─────────────────────────────►│               │
│           │                             │ 3c. HTTP 308 / 200 Created   │               │
│           │                             │◄─────────────────────────────┤               │
│           │                             │                              │               │
│           ▼                             ▼                              ▼               │
│   [Staging Cleanup]             [PublishingJob]                [YouTube Video]         │
│   (Auto-delete via TTL)         (Status: PUBLISHED)            (Ready/Processing)      │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Direct Staging vs. Server-Mediated Architecture
- **Problem with Buffering in Next.js**: Routing large video files (hundreds of megabytes to gigabytes) through standard Next.js route handlers or server actions causes catastrophic memory spikes in the Node.js V8 runtime, heap fragmentation, and request gateway timeouts (e.g. 30–60s platform limits).
- **Direct-to-Storage Staging Solution**:
  1. The browser requests an upload reservation from Plottershub (`POST /api/content/upload-ticket`).
  2. Plottershub validates authentication, workspace membership, RBAC (`content:publish`), and quota. It then generates a pre-signed multipart upload URL using the **`MediaStorage` abstraction** (Cloudflare R2 or S3-compatible staging bucket).
  3. The browser streams the video file directly to `MediaStorage`.
  4. Once staged, Plottershub executes the backend YouTube resumable upload stream in controlled 8 MiB chunks, reading byte ranges from `MediaStorage` without holding the entire file in RAM.
- **Why Browser-to-YouTube Direct Upload is Prohibited**:
  1. It would require exposing OAuth access tokens or sensitive resumable upload session URLs directly to client browsers.
  2. Client-side network drops would leave orphaned or untracked uploads on YouTube without server-side reconciliation.
  3. It bypasses server-side compliance validation, DLP scanning, and immutable audit logging.

---

## 4. Entity Mapping & Schema Architecture

To prevent duplicate sources of truth, this section maps the distinct roles of every model and proposed field.

### 4.1 Domain Entity Responsibility Matrix
| Entity / Layer | Primary Responsibility | State Category | Canonical Identifier |
| :--- | :--- | :--- | :--- |
| **`Content`** | High-level creative work (title, description, caption, workspace relationship). | Creative Asset State | `Content.id` |
| **`ContentPlatform`** | Specific platform binding for a content item (platform status, scheduled time, publication timestamp). | Canonical Platform Content State | `ContentPlatform.id` & `externalContentId` |
| **`PublishingJob`** | Transient execution record of an upload attempt (progress telemetry, error details, attempt counter, staging key). | Execution Run State | `PublishingJob.id` & `idempotencyKey` |
| **`MediaStorage`** | Temporary binary file in object storage (object key, size, MIME type, TTL). | Binary Storage State | `storageKey` |

> [!IMPORTANT]
> **Canonical YouTube External Video Identity**:  
> `ContentPlatform.externalContentId` **is the sole canonical source of truth for YouTube video identity** (e.g., `"dQw4w9WgXcQ"`).  
> It MUST NOT be duplicated as a canonical field in `PublishingJob`. `PublishingJob` only references the parent `ContentPlatform.id`.

---

### 4.2 Field-by-Field Justification for Proposed `PublishingJob` Fields (Do NOT migrate in 3.4F)

When Phase 3.4F implementation begins in a subsequent phase, the following fields will be added via a minimal migration. Their specific architectural rationale is defined below:

| Proposed Field | Data Type | Classification | Why It Belongs in `PublishingJob` | Why Existing Fields Do Not Cover It |
| :--- | :--- | :--- | :--- | :--- |
| `publishing_status` | `PublishingStatus` (Enum) | Execution State | Tracks granular publishing phases (`QUEUED`, `UPLOADING`, `RECONCILING`). | Existing `JobStatus` only has generic `PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`. |
| `storage_key` | `String?` | Storage Pointer | Points to the staged media in `MediaStorage` that this job must read. | `ContentAsset` tracks permanent assets; staging keys are ephemeral with 48h TTL. |
| `upload_session_url_encrypted` | `String?` (Text) | Ephemeral Provider State | Holds the encrypted YouTube resumable session URI for chunk streaming and resume. | Must be encrypted and isolated to the execution job; never stored on `ContentPlatform`. |
| `bytes_uploaded` | `BigInt` | Telemetry State | Tracks the byte offset confirmed by YouTube via HTTP 308 responses. | Existing schema has no progress tracking for chunked byte streams. |
| `total_bytes` | `BigInt?` | Telemetry State | Expected total video size to calculate percentage and validate `Content-Range`. | Avoids re-querying `MediaStorage` on every chunk iteration. |
| `thumbnail_status` | `String` | Auxiliary Task State | Tracks decoupled thumbnail upload (`NONE`, `PENDING`, `UPLOADED`, `FAILED`). | Decouples thumbnail lifecycle from video upload so thumbnail failure doesn't fail video. |
| `metadata` | `Json?` | Execution Context | Stores structured failure metadata (`retryable`, `failureCode`, `failureSource`). | `errorMessage` is a flat string; structured metadata is needed for automated retry logic. |

---

## 5. `PublishingJob` Lifecycle & Formal State Transition Matrix

### 5.1 Formal State Transition Matrix
Plottershub defines 11 discrete states for the video publishing lifecycle:

```
[DRAFT]
  │
  ▼
[QUEUED] ──────────────────────────┐
  │                                │
  ▼                                ▼
[UPLOADING] ◄───► [RECONCILING]  [FAILED] (retryable)
  │                      │         ▲
  ▼                      ▼         │
[UPLOADED] ────────► [FAILED] ─────┘ (permanent)
  │                      ▲
  ▼                      │
[PROCESSING] ────────────┤
  │                      │
  ├───► [SCHEDULED] ─────┤
  │          │           │
  │          ▼           │
  └───► [PUBLISHING] ────┘
             │
             ▼
        [PUBLISHED] (Terminal)
```

| From State | To State | Allowed? | Trigger Event / Condition | Execution Rules & Failure Metadata |
| :--- | :--- | :---: | :--- | :--- |
| **`DRAFT`** | `QUEUED` | **YES** | Creator finalizes video metadata and triggers publish/schedule. | Validates RBAC, quota, and staging asset existence. |
| **`DRAFT`** | `CANCELLED` | **YES** | Creator deletes or discards draft. | Staged asset marked for deletion. |
| **`QUEUED`** | `UPLOADING` | **YES** | Worker/runner acquires lock and initializes YouTube session. | Stores encrypted session URI; sets `bytes_uploaded = 0`. |
| **`QUEUED`** | `CANCELLED` | **YES** | Creator cancels publishing before upload starts. | Lock released; job cancelled. |
| **`QUEUED`** | `FAILED` | **YES** | Session initialization rejected (e.g. invalid metadata, auth failure). | `metadata: { retryable: false, failureCode: "SESSION_INIT_FAILED" }`. |
| **`UPLOADING`** | `UPLOADING` | **YES** | Intermediate chunk successfully acknowledged by YouTube (HTTP 308). | Updates `bytes_uploaded` to reported `Range` end offset. |
| **`UPLOADING`** | `UPLOADED` | **YES** | Final chunk acknowledged with HTTP 200/201 (video ID returned). | Updates `ContentPlatform.externalContentId`; triggers thumbnail upload. |
| **`UPLOADING`** | `RECONCILING` | **YES** | Network socket drop, timeout on final chunk, or HTTP 5xx. | Enters reconciliation to query session status before retrying. |
| **`UPLOADING`** | `FAILED` | **YES** | Fatal non-retryable error (HTTP 400 invalidRange, 403 quotaExceeded). | `metadata: { retryable: false, failureCode: "UPLOAD_REJECTED" }`. |
| **`UPLOADED`** | `PROCESSING` | **YES** | YouTube confirms video upload; video enters YouTube transcoding queue. | `ContentPlatform.status` set to `PROCESSING`. |
| **`UPLOADED`** | `SCHEDULED` | **YES** | Upload completed with `status.publishAt` set and `privacyStatus: "private"`. | `ContentPlatform.status` set to `SCHEDULED`. |
| **`UPLOADED`** | `PUBLISHING` | **YES** | Immediate publication requested; waiting for visibility confirmation. | Transitional state prior to final confirmation. |
| **`PROCESSING`** | `PUBLISHED` | **YES** | YouTube processing completes; video confirmed available. | `ContentPlatform.status` and `Content.status` set to `PUBLISHED`. |
| **`PROCESSING`** | `SCHEDULED` | **YES** | Transcoding completes for a scheduled video. | Remains in `SCHEDULED` awaiting release date. |
| **`PROCESSING`** | `FAILED` | **YES** | YouTube rejects video during processing (e.g. copyright, duplicate). | `metadata: { retryable: false, failureCode: "PROCESSING_REJECTED" }`. |
| **`SCHEDULED`** | `PUBLISHING` | **YES** | Scheduled release timestamp reached. | Verification initiated. |
| **`SCHEDULED`** | `CANCELLED` | **YES** | Creator cancels scheduled video prior to release time. | Video deleted on YouTube or privacy set to permanent private. |
| **`PUBLISHING`** | `PUBLISHED` | **YES** | Public availability verified on YouTube. | Terminal success. |
| **`PUBLISHING`** | `FAILED` | **YES** | Video failed to transition to public on YouTube. | `metadata: { retryable: true, failureCode: "PUBLISH_VERIFICATION_FAILED" }`. |
| **`RECONCILING`**| `UPLOADING` | **YES** | Session status inquiry returns HTTP 308 with valid byte range. | Resumes streaming from reported byte offset. |
| **`RECONCILING`**| `UPLOADED` | **YES** | Session status inquiry returns HTTP 200/201 (final chunk had arrived). | Video was created; recovers video ID and proceeds. |
| **`RECONCILING`**| `PUBLISHED` | **YES** | Deterministic reconciliation matches video on channel. | `ContentPlatform.externalContentId` updated; marked `PUBLISHED`. |
| **`RECONCILING`**| `FAILED` | **YES** | Session is lost (404) and channel reconciliation confidence is insufficient. | `metadata: { retryable: false, requiresManualReview: true }`. |
| **`FAILED`** | `QUEUED` | **YES** | Manual creator retry or automated backoff for retryable failure. | Increments `attempts`. Only allowed if `retryable === true`. |
| **`FAILED`** | *(Terminal)*| **YES** | Permanent failure (`retryable === false`). | Requires user intervention. |
| **`CANCELLED`** | *(Terminal)*| **YES** | Job cancelled by creator. | Terminal state. |
| **`PUBLISHED`** | *(Terminal)*| **YES** | Video successfully published and live. | Terminal state. |

---

### 5.2 Failure Classification & Metadata Requirements
Plottershub avoids creating an explosion of ad-hoc failure states. Instead, it maintains `FAILED` as the canonical error state and requires structured metadata on every failure:

```ts
export interface PublishingFailureMetadata {
  retryable: boolean;
  failureCode:
    | "NETWORK_TIMEOUT"
    | "TOKEN_EXPIRED"
    | "UPLOAD_RATE_LIMIT_EXCEEDED"
    | "QUOTA_EXCEEDED"
    | "INVALID_PUBLISH_AT"
    | "INVALID_CHUNK_RANGE"
    | "SESSION_EXPIRED"
    | "PROCESSING_FAILED"
    | "UNKNOWN_OUTCOME";
  failureSource: "CLIENT" | "PLOTTERSHUB_STAGING" | "YOUTUBE_API" | "NETWORK";
  httpStatus?: number;
  retryCount: number;
  maxRetries: number;
  requiresManualReview?: boolean;
}
```

- **Retryable Failures**: Transient HTTP 5xx, socket timeouts prior to final chunk, or expired OAuth tokens (where refresh succeeds).
- **Permanent Failures**: `uploadRateLimitExceeded`, `quotaExceeded`, invalid parameters (HTTP 400), unverified project restriction, or channel suspension.

---

## 6. Resumable Upload Session Protocol Deep Dive

### 6.1 Chunk Streaming Rules
1. **Initiation**:
   ```http
   POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status HTTP/1.1
   Host: www.googleapis.com
   Authorization: Bearer <access_token>
   Content-Type: application/json; charset=UTF-8
   X-Upload-Content-Length: 52428800
   X-Upload-Content-Type: video/mp4

   {
     "snippet": { "title": "Launch Video", "categoryId": "22" },
     "status": { "privacyStatus": "private" }
   }
   ```
   - YouTube responds with `200 OK` and `Location: https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=AbC123...`
   - The session URI is immediately encrypted and saved to `PublishingJob.upload_session_url_encrypted`.

2. **Chunk Transmission**:
   - Chunks are sliced in exact **8 MiB increments** ($8,388,608$ bytes):
   ```http
   PUT <upload_session_uri> HTTP/1.1
   Content-Length: 8388608
   Content-Range: bytes 0-8388607/52428800

   <binary_bytes>
   ```
   - YouTube returns `308 Resume Incomplete` with `Range: bytes=0-8388607`.
   - `PublishingJob.bytes_uploaded` is updated to `8388608`.

3. **Final Chunk**:
   ```http
   PUT <upload_session_uri> HTTP/1.1
   Content-Length: 2097152
   Content-Range: bytes 50331648-52428799/52428800

   <binary_bytes>
   ```
   - YouTube returns `200 OK` or `201 Created` with the complete Video resource JSON.

### 6.2 Session URI Confidentiality & Security
- The session URI contains an authorized upload ticket that allows pushing arbitrary data to the user's channel without providing the OAuth token again.
- **Strict Secrecy Rules**:
  1. Never expose the session URI in client-facing API responses.
  2. Never write the session URI to application logs, debug outputs, or audit logs.
  3. Store the session URI only in encrypted form (`uploadSessionUrlEncrypted`) using AES-256-GCM.
  4. Redact `Location:` and URI query parameters in all error reporters and traces.

---

## 7. Immediate Publishing Pipeline

1. **Reservation & Staging**: Creator selects video; browser uploads directly to `MediaStorage` staging via pre-signed URL.
2. **Job Queued**: `PublishingJob` created in `QUEUED` state.
3. **Session Initiation**: `YouTubePublisher` calls `videos.insert` with `privacyStatus: "public" | "unlisted" | "private"`.
4. **Chunked Stream**: Media streamed from `MediaStorage` to YouTube in 8 MiB chunks.
5. **Video Creation**: YouTube returns video resource with `id`.
6. **Thumbnail Dispatch**: If a custom thumbnail was staged, trigger `thumbnails.set`.
7. **Canonical State Synchronization**:
   - `ContentPlatform.externalContentId` updated to the YouTube video ID.
   - `ContentPlatform.status` set to `PUBLISHED` (or `PROCESSING`).
   - `Content.status` set to `PUBLISHED`.
8. **Audit Logging**: `AuditAction: VIDEO_UPLOAD_COMPLETED` and `PUBLISH_COMPLETED` logged with sanitized metadata.

---

## 8. Scheduled Publishing Pipeline (`status.publishAt`)

### 8.1 Native YouTube Execution
Plottershub leverages YouTube's **native server-side scheduler** rather than maintaining an application cron dispatcher.

### 8.2 Operational Constraints & Timezone Handling
1. **Mandatory Privacy Status**: `status.privacyStatus` **MUST be set to `"private"`**.
2. **Timezone Conversion Protocol**:
   - Creator selects publication time in their configured workspace/account IANA timezone (e.g., `2026-10-15 18:00 Asia/Jakarta`).
   - Plottershub converts this to strict UTC ISO 8601: `2026-10-15T11:00:00.000Z`.
   - The UTC string is sent in `status.publishAt`.
3. **Lead Time Validation**: Timestamp must be strictly in the future ($> \text{now}() + 15\text{ minutes}$).
4. **Lifecycle Representation**:
   - Once upload completes, `ContentPlatform.status` and `PublishingJob.publishing_status` are set to `SCHEDULED`.
   - `ContentPlatform.scheduledAt` records the intended UTC release time.
5. **Release Verification**:
   - When the scheduled time arrives, YouTube automatically changes the video's privacy status to `public`.
   - Routine content synchronization (Phase 3.4C) verifies public visibility and transitions `ContentPlatform.status` to `PUBLISHED`.

---

## 9. Decoupled Thumbnail Architecture

```
[Video Upload Flow]               [Thumbnail Upload Flow]
        │                                    │
        ▼                                    ▼
[Video Uploading]                  [Thumbnail Staged]
        │                                    │
        ▼                                    │ (Wait for Video ID)
[Video Completed]                            │
(Video ID: "dQw4...") ──────────────────────►│
                                             ▼
                                    [Thumbnails.set]
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             [Thumbnail Succeeded]                       [Thumbnail Failed]
             (Video remains PUBLISHED)                   (Video remains PUBLISHED;
                                                          Thumbnail retryable)
```

### 9.1 Independent Failure Domain
- A failure during thumbnail upload **MUST NEVER fail the video upload**.
- Once a video is created on YouTube, failing the job would create an orphaned video or risk accidental duplicate uploads upon retry.
- If `thumbnails.set` fails:
  - Video status remains `PUBLISHED` or `SCHEDULED`.
  - `PublishingJob.thumbnail_status` is marked as `FAILED`.
  - The creator is provided with an in-place "Retry Thumbnail Upload" button in the UI.

### 9.2 Image Validation & Format Handling
- Supported MIME types: `image/jpeg`, `image/png`.
- Maximum file size: 50 MB (recommended $< 2\text{ MB}$).
- Aspect ratio: 16:9 (recommended 1280×720, minimum width 640 px).
- **WebP Conversion**: Since YouTube's official documentation does not guarantee WebP support for `thumbnails.set`, any WebP image must be converted to PNG or JPEG in the browser/staging layer prior to dispatch.

---

## 10. Storage Abstraction (`MediaStorage`)

```ts
export interface StagedMediaDescriptor {
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256?: string;
  expiresAt: Date;
}

export interface MediaStorage {
  generatePresignedUploadUrl(params: {
    workspaceId: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
    ttlSeconds?: number;
  }): Promise<{ uploadUrl: string; storageKey: string }>;

  getByteRangeStream(
    storageKey: string,
    startByte: number,
    endByte: number
  ): Promise<NodeJS.ReadableStream>;

  getObjectMetadata(storageKey: string): Promise<StagedMediaDescriptor>;

  deleteStagedMedia(storageKey: string): Promise<void>;
}
```

- **Object Key Convention**: `staging/{workspaceId}/{contentId}/{jobId}_{filename}`
- **Bucket Lifecycle Rule**: Staging buckets enforce an automatic 48-hour object expiration (TTL). Orphaned files are purged at the cloud storage layer even if application cleanup fails.

---

## 11. Multi-Platform Provider Abstraction

```ts
export interface GenericPublishingPayload {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus: "PUBLIC" | "PRIVATE" | "UNLISTED";
  scheduledAtUtc?: Date;
  mediaKey: string;
  thumbnailKey?: string;
}

export interface PublishingSession {
  provider: "YOUTUBE" | "TIKTOK" | "INSTAGRAM";
  sessionUrlEncrypted: string;
  bytesUploaded: number;
  totalBytes: number;
}

export interface SocialPublisher {
  readonly platformCode: string;

  initPublishingSession(
    socialAccountId: string,
    payload: GenericPublishingPayload,
    mediaInfo: StagedMediaDescriptor
  ): Promise<PublishingSession>;

  uploadNextChunk(
    socialAccountId: string,
    session: PublishingSession,
    chunkStream: NodeJS.ReadableStream,
    chunkRange: { start: number; end: number; total: number }
  ): Promise<{
    completed: boolean;
    bytesUploaded: number;
    externalContentId?: string;
  }>;

  checkSessionStatus(
    socialAccountId: string,
    session: PublishingSession
  ): Promise<{
    status: "IN_PROGRESS" | "COMPLETED" | "EXPIRED";
    bytesReceived: number;
    externalContentId?: string;
  }>;

  uploadThumbnail?(
    socialAccountId: string,
    externalContentId: string,
    thumbnailStream: NodeJS.ReadableStream,
    mimeType: string
  ): Promise<void>;
}
```

---

## 12. Idempotency, Identity & Reconciliation

### 12.1 Explicit Identity Separation
Plottershub strictly separates the 5 distinct identities involved in publishing:
1. **Job Identity (`PublishingJob.id`)**: Unique CUID identifying the database execution record.
2. **Execution Run Identity (`PublishingJob.idempotencyKey`)**: Unique token identifying a specific execution dispatch.
3. **Provider Session Identity (`uploadSessionUrlEncrypted`)**: Ephemeral URL and session token generated by YouTube.
4. **Canonical External Content Identity (`ContentPlatform.externalContentId`)**: The YouTube video ID (e.g. `"dQw4w9WgXcQ"`).
5. **Storage Identity (`MediaStorage.storageKey`)**: Object key in the staging bucket.

---

### 12.2 Semantic Reality: No Exactly-Once Delivery
> [!IMPORTANT]
> **Semantic Delivery Guarantee**:  
> **Plottershub does NOT claim exactly-once delivery.**  
> In distributed video uploading across public internet boundaries, network partitions and provider timeouts can prevent definitive confirmation of an upload.  
> **Plottershub does NOT claim duplicate prevention is guaranteed when the provider upload outcome is unknown.**

---

### 12.3 Reconciliation Flow for Unknown Upload Outcomes
When an upload outcome is unknown (e.g. timeout on final chunk, network reset, or lost connection):

```
UNKNOWN upload outcome
  ↓
RECONCILING
  ↓
inspect resumable session status
  ↓
if resumable session can continue, resume
  ↓
if session is lost/invalid, attempt deterministic provider reconciliation using available correlation data
  ↓
only recover externalContentId when confidence is sufficient
  ↓
otherwise do NOT blindly create another upload
  ↓
mark UNKNOWN / MANUAL_REVIEW or equivalent safe state
```

1. **Step 1: Inspect Resumable Session**:
   - Issue inquiry request: `PUT <session_uri>` with `Content-Length: 0` and `Content-Range: bytes */total`.
   - If HTTP 308: Session is alive; inspect `Range: bytes=0-N` and resume streaming remaining chunks from `N + 1`.
   - If HTTP 200/201: Upload completed despite timeout; extract video ID and update `ContentPlatform.externalContentId`.
2. **Step 2: If Session is Lost or Invalid (HTTP 404/410)**:
   - Do **NOT** blindly create another upload session.
   - Enter `RECONCILING` state.
   - Attempt deterministic provider reconciliation using available correlation data:
     - Query YouTube Data API `videos.list(mine=true)` searching for videos uploaded within a $\pm 10$ minute window matching title, description, and duration.
   - **Confidence Gating**:
     - **Confidence is Sufficient**: Exact title, matching description, and creation window aligned. Recover and persist `ContentPlatform.externalContentId`. Transition to `PUBLISHED` (or `SCHEDULED`).
     - **Confidence is Insufficient**: Do **NOT** create another upload. Mark as `UNKNOWN` / `MANUAL_REVIEW` by setting status to `FAILED` with metadata:
       ```json
       {
         "retryable": false,
         "requiresManualReview": true,
         "failureCode": "UNKNOWN_OUTCOME",
         "failureSource": "YOUTUBE_API"
       }
       ```
     - Surface in the UI: *"Upload outcome is unknown. Please verify your YouTube Studio uploads before retrying to prevent duplicates."*

---

### 12.4 Safe Behaviors for Ambiguous Failure Scenarios

1. **Request Timeout After Provider Accepted Upload**:
   - *Scenario*: Final chunk was received and processed by YouTube, but the client socket timed out before receiving the HTTP 200 response.
   - *Safe Behavior*: System enters `RECONCILING`. Status check (`PUT bytes */total`) returns HTTP 200 with video resource. Video ID is extracted and stored in `ContentPlatform.externalContentId`. Job succeeds without duplicate upload.

2. **Lost Response During Final Chunk**:
   - *Scenario*: Network connection severed as YouTube sent response.
   - *Safe Behavior*: Status check queries session URI. If session returns 200, recover video ID. If session returns 404 (session closed upon success), execute channel reconciliation. If verified, link `ContentPlatform.externalContentId`. If unverified, halt in `MANUAL_REVIEW`.

3. **Worker Process Crash Mid-Stream**:
   - *Scenario*: Node process or container terminates while streaming chunk 3 of 10.
   - *Safe Behavior*: `publishing-job` lock expires via TTL. When job is re-evaluated, worker checks session status, discovers YouTube received up to chunk 2 (bytes 0–16,777,215), and resumes streaming from chunk 3. No re-initiation or duplicate video created.

4. **Duplicate Worker Concurrent Execution**:
   - *Scenario*: Two workers attempt to pick up the same publishing job simultaneously.
   - *Safe Behavior*: The global lock acquisition order requires acquiring `publishing-job:${publishingJobId}` first. The second worker fails to acquire the lock and yields immediately. Exactly one worker executes.

5. **Retry After Unknown Result**:
   - *Scenario*: Creator or scheduler triggers retry after job failed with `UNKNOWN_OUTCOME`.
   - *Safe Behavior*: Automatic retry is strictly blocked (`retryable: false`). Manual retry requires explicit creator confirmation ("I have checked YouTube Studio and the video is not present") before generating a new `idempotencyKey` and initializing a fresh upload session.

---

## 13. Comprehensive Error & Retry Matrix

| Operation | HTTP Status / Error Code | Root Cause | Retryable? | Backoff Strategy | Reconcile First? | Final Behavior |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **Chunk Upload** | `308 Resume Incomplete` | Normal chunk received | **YES** | None (continue) | No | Send next chunk at range offset. |
| **Chunk Upload** | Network Timeout / ECONNRESET | Transient connection drop | **YES** | Exponential (1s, 2s, 4s, 8s) | **YES** | Query session status; resume from reported offset. |
| **Session Init** | `401 Unauthorized` | Access token expired | **YES** | Refresh token & retry | No | Refresh OAuth token via `SocialTokenManager`; retry init. |
| **Chunk Upload** | `401 Unauthorized` | Access token expired mid-upload | **YES** | Refresh token & retry | No | Refresh token; resume session with new Bearer header. |
| **Any** | `403 uploadRateLimitExceeded` | Daily channel upload limit hit | **NO** | Delay 12–24h | No | Mark `FAILED`; notify creator of YouTube 24h upload cap. |
| **Any** | `403 quotaExceeded` | Project YouTube quota exhausted | **NO** | Delay until quota reset | No | Mark `FAILED`; wait for PT midnight reset. |
| **Session Init** | `400 invalidPublishAt` | Past or malformed timestamp | **NO** | None | No | Mark `FAILED` with validation message. |
| **Chunk Upload** | `400 invalidRangeHeader` | Chunk not multiple of 256KB | **NO** | Bug / Abort | No | Mark `FAILED`; report chunk sizing defect. |
| **Chunk Upload** | `404 Not Found` | Upload session expired / invalid | **Conditional** | Reconcile channel | **YES** | Reconcile uploads; re-init only if video does not exist. |
| **Any** | `500, 502, 503, 504` | Google server / gateway error | **YES** | Exponential with jitter | **YES** | Check status before resending chunk. |
| **Thumbnails.set**| `400 mediaTypeNotSupported` | Image format is WebP/BMP | **NO** | None | No | Mark `thumbnail_status: FAILED`; video stays `PUBLISHED`. |

---

## 14. Dynamic Quota Policy Integration

### 14.1 Logical Quota Buckets
Plottershub models quota through three logical categories:
```ts
export enum QuotaBucket {
  VIDEO_UPLOAD = "VIDEO_UPLOAD",         // videos.insert (Dedicated bucket: 100 calls/day)
  THUMBNAIL_UPLOAD = "THUMBNAIL_UPLOAD", // thumbnails.set (50 units from shared pool)
  DEFAULT_API = "DEFAULT_API"            // General API pool (10,000 units/day)
}

export const YOUTUBE_PUBLISHING_QUOTA_COSTS = {
  VIDEOS_INSERT_CALL: 1,           // Dedicated VIDEO_UPLOAD bucket
  VIDEOS_INSERT_LEGACY_UNITS: 1600,// Legacy shared pool
  THUMBNAILS_SET: 50,              // Shared pool
  VIDEOS_UPDATE: 50,               // Shared pool
  VIDEOS_LIST: 1,                  // Shared pool
};
```

### 14.2 Pre-Flight Quota Check
Prior to generating a pre-signed staging URL or initializing an upload session, `PublishingService` checks `QuotaPolicy`:
1. Verify remaining allowance in `VIDEO_UPLOAD` bucket.
2. If remaining quota $< 1$, reject immediately with `SocialError: QUOTA_EXCEEDED` before staging large video files.

---

## 15. Security Architecture

1. **OAuth Scopes**: Validate `hasYouTubeWriteScope(scopes)` for `https://www.googleapis.com/auth/youtube.upload` or `youtube` or `youtube.force-ssl`.
2. **Multi-Tenant Isolation**: Enforce `workspaceId` matching across all queries for `Content`, `ContentPlatform`, and `PublishingJob`.
3. **RBAC Rules**: `content:publish` permission required (`OWNER`, `ADMIN`, `EDITOR`). `VIEWER` and `ANALYST` are read-only.
4. **Token Encryption**: Tokens encrypted using AES-256-GCM via `SocialTokenManager`.
5. **Session URL Secrecy**: Resumable upload session URIs are encrypted in the database and never exposed to the client browser.
6. **Error Sanitization**: OAuth tokens, client secrets, and session URLs are scrubbed from error messages and logs.

---

## 16. Global Distributed Lock Acquisition Order

To eliminate distributed deadlocks across multi-threaded workers and future background queues, Plottershub establishes a **strict, global lock acquisition hierarchy** using `PostgresDistributedLock`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   GLOBAL LOCK ACQUISITION ORDER                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Step 1: Acquire Job-Level Lock                                       │
│   publishing-job:${publishingJobId}                                    │
│   (TTL: 10 minutes, heartbeat renewed during active streaming)         │
│                                                                        │
│                        │                                               │
│                        ▼                                               │
│                                                                        │
│   Step 2: Acquire Platform-Content Lock                                │
│   content-publish:${socialAccountId}:${contentPlatformId}             │
│   (TTL: 5 minutes)                                                     │
│                                                                        │
│                        │                                               │
│                        ▼                                               │
│                                                                        │
│   [Execute Publishing Run]                                             │
│                                                                        │
│                        │                                               │
│                        ▼                                               │
│                                                                        │
│   Step 3: Release in Reverse (LIFO) Order                              │
│   1. Release content-publish:${socialAccountId}:${contentPlatformId}   │
│   2. Release publishing-job:${publishingJobId}                         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

- **Why this order?**:
  1. Locking `publishing-job` first ensures only one worker process handles this specific execution instance.
  2. Locking `content-publish` second ensures no other job, sync process, or manual user action can mutate the target platform binding concurrently.
- **Rule**: All future workers (including Phase 4 BullMQ workers) must strictly adhere to this exact acquisition order. Acquiring locks out of order is strictly prohibited.

---

## 17. Audit Logging Specifications

All milestones generate immutable entries in `audit_logs`:
| Audit Action | Resource | Key Metadata Logged (Sanitized) | Prohibited Data (Redacted) |
| :--- | :--- | :--- | :--- |
| `VIDEO_UPLOAD_REQUESTED` | `PublishingJob` | `jobId`, `fileSize`, `mimeType`, `privacyStatus` | Pre-signed URL, tokens |
| `VIDEO_UPLOAD_STARTED` | `PublishingJob` | `jobId`, `socialAccountId`, `externalAccountId` | Resumable session URI |
| `VIDEO_UPLOAD_COMPLETED` | `PublishingJob` | `jobId`, `externalContentId`, `durationSeconds` | Tokens, credentials |
| `VIDEO_UPLOAD_FAILED` | `PublishingJob` | `jobId`, `errorCode`, `sanitizedErrorMessage` | Session URI, raw HTTP dump |
| `PUBLISH_SCHEDULED` | `ContentPlatform` | `contentPlatformId`, `scheduledAtUtc`, `timezone` | Credentials |
| `PUBLISH_COMPLETED` | `ContentPlatform` | `contentPlatformId`, `externalContentId`, `publishedAt` | - |
| `THUMBNAIL_UPDATED` | `ContentPlatform` | `contentPlatformId`, `externalContentId`, `fileSize` | Binary data |
| `PUBLISHING_RECONCILED` | `PublishingJob` | `jobId`, `resolvedStatus`, `externalContentId` | Session URI |

---

## 18. UI Architecture (Phase 3.4B Light Professional Alignment)

Adheres to `docs/UI_DESIGN_SYSTEM.md`:
- **Style**: White cards (`#FFFFFF`), 1px subtle borders (`rgba(0,0,0,0.08)`), light background (`#F8F9FA`), 6px border radii (`rounded-md`), clean typography.

### 18.1 Create & Publish Workflow Components
A 5-step modal or full-page stepper:
1. **Media Section**: Drag-and-drop video upload zone with size/format validation and staging progress bar.
2. **Details Section**: Title input (max 100 chars), Description (max 5,000 chars), Tags input, Category selector, "Made for Kids" toggle.
3. **Thumbnail Section**: Custom image drop zone (JPEG/PNG only, max 50 MB, 16:9 preview).
4. **Visibility & Scheduling Section**:
   - Radios: `Public`, `Unlisted`, `Private`, `Schedule`.
   - If `Schedule`: Date/time picker, `publishingTimezone` indicator, notice explaining YouTube native scheduling.
5. **Publishing Status & Recovery Drawer**: Real-time progress bar (`Staging` $\rightarrow$ `YouTube Upload` $\rightarrow$ `Thumbnail` $\rightarrow$ `Complete`), with in-place "Resume Upload" or "Retry Thumbnail" actions.

---

## 19. Phase 4 Boundary Demarcation

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 3.4F vs. PHASE 4 BOUNDARY MATRIX                          │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│           INCLUDED IN PHASE 3.4F          │           DEFERRED TO PHASE 4              │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ • Official YouTube upload research & freeze│ • Redis installation & configuration       │
│ • Resumable upload chunking protocol      │ • BullMQ queue definitions                 │
│ • MediaStorage staging abstraction        │ • Distributed background worker processes  │
│ • SocialPublisher & YouTubePublisher specs│ • Cron-based background queue poller       │
│ • PublishingJob state machine contracts   │ • Multi-worker task leasing & heartbeats   │
│ • Native status.publishAt scheduling spec │ • Distributed video transcoding jobs       │
│ • Decoupled thumbnail lifecycle spec      │ • Multi-tenant upload rate smoothing queues│
│ • PostgresDistributedLock key conventions │                                            │
│ • Comprehensive unit & mock test suites   │                                            │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 20. Comprehensive Test Strategy

Future Phase 3.4F implementation test suites must cover without live API calls:
1. **State Machine Transitions**: Valid progression and rejection of invalid jumps.
2. **Resumable Session Tests**: Slicing chunks in 256 KiB multiples (8 MiB default), parsing HTTP 308, calculating next range offset.
3. **Network Interruption & Resume**: Simulating socket drops; status check inquiry; resuming from exact reported byte.
4. **Duplicate Prevention & Reconciliation**: Timeout on final chunk; checking session status; verifying video ID without creating duplicate.
5. **Scheduling Logic**: Enforcing `privacyStatus: "private"` when `publishAt` is set; rejecting past timestamps; timezone conversions.
6. **Thumbnail Tests**: Rejecting unsupported WebP files; verifying thumbnail failure leaves video `PUBLISHED`.
7. **Security & Authorization**: Rejecting `VIEWER` and `ANALYST` roles; token refresh on HTTP 401; verifying secrets are scrubbed from logs.
8. **Lock Ordering**: Verifying strict lock acquisition order (`publishing-job` then `content-publish`) and contention handling.

---

## 21. Open Risks & Assumptions

1. **Unverified API Project Private Lock**:
   - *Risk*: Videos uploaded by unverified projects are locked to private by YouTube.
   - *Mitigation*: Prominently display compliance audit status in workspace settings.
2. **V8 Heap Memory during Stream Processing**:
   - *Risk*: Buffering chunks in Node memory can cause heap exhaustion.
   - *Mitigation*: Pipe streams directly from `MediaStorage` to YouTube HTTP request without full file buffering.
3. **Daily Channel Upload Limits (`uploadRateLimitExceeded`)**:
   - *Risk*: Channels hitting daily limits fail uploads.
   - *Mitigation*: Catch error, mark permanent failure with friendly countdown explaining YouTube's 24-hour channel limit.

---

## 22. Implementation Plan for Phase 3.4F (When Approved)

1. **Step 1: Type Contracts & Error Definitions**: Create `src/modules/publishing/publishing.types.ts`.
2. **Step 2: Storage Staging Mock/Provider**: Implement `src/modules/storage/media-storage.ts`.
3. **Step 3: YouTube Resumable Publisher**: Implement `YouTubePublisher` in `src/modules/social/providers/youtube/youtube.publisher.ts`.
4. **Step 4: Publishing Service & API Routes**: Implement `PublishingService` with `PostgresDistributedLock`, quota check, and `/api/social/youtube/publish` routes.
5. **Step 5: UI & Comprehensive Tests**: Build publishing modal and stepper; run test suites.

---

## PHASE 3.4F RESEARCH STATUS:
**READY FOR IMPLEMENTATION**
