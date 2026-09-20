# Social Media Intelligence Platform

## BRD + Product Architecture + ERD + Technical Specification

**Version:** 1.0\
**Date:** 2026-09-10\
**Status:** Foundation / Implementation Blueprint\
**Target Coding Environment:** Google Antigravity 3.7\
**Primary Stack:** Next.js + TypeScript + PostgreSQL + Prisma\
**Database Preference:** PostgreSQL, preferably hosted on Neon; Supabase
may be used only where a project-specific integration is needed.

------------------------------------------------------------------------

# 1. Executive Summary

Build a professional SaaS-style web application for managing and
analyzing the user's social-media presence across:

-   TikTok
-   Instagram
-   YouTube

The platform must combine:

1.  Social-account connection through official OAuth/API authorization.
2.  Social-media analytics.
3.  Content library and asset management.
4.  Content upload and publishing workflows.
5.  Scheduled publishing where officially supported.
6.  Historical metric snapshots.
7.  Audience and engagement analytics.
8.  AI-assisted content insights.
9.  Cross-platform comparison.
10. Reporting.

The platform must be designed around the fact that each social platform
has different API capabilities, scopes, quotas, token lifecycles,
publishing capabilities, and analytics availability.

The system must NEVER ask users to provide their TikTok, Instagram, or
Google passwords to this application.

------------------------------------------------------------------------

# 2. Core Product Principle

The product is not merely a dashboard.

It is a **Social Media Intelligence + Content Operations Platform**.

The main loop is:

``` text
Connect Accounts
      ↓
Synchronize Data
      ↓
Store Historical Metrics
      ↓
Analyze Content
      ↓
Generate Insights
      ↓
Create / Upload Content
      ↓
Publish / Schedule
      ↓
Measure Performance
      ↓
Improve Next Content
```

------------------------------------------------------------------------

# 3. Target User

Initial target:

-   Individual creator
-   Content creator
-   Small media team
-   Social-media manager

Initial deployment can be single-user oriented but the database and
architecture MUST support multi-workspace and team usage from the
beginning.

------------------------------------------------------------------------

# 4. Platforms

## 4.1 TikTok

Integration must use official TikTok APIs.

Potential capabilities include:

-   OAuth/Login
-   Account information
-   Video listing
-   Video metrics where permitted
-   Content publishing
-   Upload workflow
-   Publishing status
-   Account permissions/scopes

Do not assume every TikTok metric is universally available. The
integration layer must expose only capabilities supported by the
approved app/scopes and current TikTok API.

## 4.2 Instagram

Integration must use Meta/Instagram official APIs.

Potential capabilities include:

-   Account connection
-   Professional account information
-   Media listing
-   Media insights where permitted
-   Comments
-   Publishing for supported account/media types
-   Reels/media management where officially supported

The system must distinguish between capabilities available for Instagram
Professional accounts and unsupported personal-account scenarios.

## 4.3 YouTube

Integration must use Google OAuth 2.0 and YouTube APIs.

Potential capabilities include:

-   Channel information
-   Videos
-   Video statistics
-   Comments
-   Subscribers
-   Watch time / analytics where the relevant YouTube Analytics API
    permissions are granted
-   Video upload
-   Video metadata update
-   Scheduling through YouTube's supported publishing model

Use offline authorization for background synchronization and scheduled
operations.

------------------------------------------------------------------------

# 5. Authentication Model

There are two separate authentication concepts.

## 5.1 Application Authentication

Users authenticate into this website.

Example:

``` text
Email
Password

OR

Google Sign-In
```

Recommended implementation:

-   Auth.js / NextAuth-compatible architecture
-   Secure HTTP-only session cookies
-   PostgreSQL-backed user/session persistence where required

## 5.2 Social Account Authorization

Users connect social platforms separately.

``` text
Website Login
      ↓
Dashboard
      ↓
Connect TikTok
      ↓
TikTok OAuth
      ↓
Authorization
      ↓
Callback
      ↓
Encrypted token storage
      ↓
Connected Account
```

The same pattern applies to Instagram and YouTube.

The application MUST NOT store social-platform passwords.

------------------------------------------------------------------------

# 6. OAuth / Token Architecture

This is a critical security area.

## 6.1 Token Rules

Store tokens server-side only.

Never:

-   Put refresh tokens in browser localStorage.
-   Put refresh tokens in cookies.
-   Return refresh tokens to frontend API responses.
-   Log tokens.
-   Put tokens in analytics events.
-   Put tokens in URLs.
-   Commit tokens to Git.
-   Store tokens in plaintext if encryption at rest is available.

Recommended database fields:

``` text
access_token_encrypted
refresh_token_encrypted
access_token_expires_at
refresh_token_expires_at
scopes
token_status
last_refresh_at
last_token_error
```

## 6.2 Encryption

Use application-level encryption for social credentials.

Recommended pattern:

``` text
TOKEN_ENCRYPTION_KEY
        ↓
AES-256-GCM
        ↓
Encrypted token
        ↓
PostgreSQL
```

The encryption key must exist only in server-side environment/secret
management.

Never expose it to client-side JavaScript.

## 6.3 Token Manager

Implement a centralized service:

``` text
SocialTokenManager
```

Responsibilities:

-   Get valid access token.
-   Check expiration.
-   Refresh when necessary.
-   Persist refreshed credentials.
-   Detect revoked/invalid credentials.
-   Mark connection as reauthorization_required.
-   Never expose raw tokens to UI.
-   Prevent concurrent refresh races.

Recommended flow:

``` text
API Request
    ↓
TokenManager.getValidAccessToken()
    ↓
Is token valid?
 ┌──┴──┐
Yes    No
 ↓      ↓
Use    Refresh
        ↓
   Save new token
        ↓
      Use token
```

## 6.4 Refresh Lock

Avoid multiple background workers refreshing the same token
simultaneously.

Use a distributed lock strategy.

Example:

``` text
lock:social-account:{socialAccountId}:refresh
```

Redis is recommended when background jobs are introduced.

------------------------------------------------------------------------

# 7. Social Account Data Model

A social account is a connection between an application workspace and a
platform account.

Example:

``` text
Workspace
   ↓
SocialAccount
   ↓
TikTok / Instagram / YouTube
```

A user may have multiple connected accounts on the same platform in the
future.

Do NOT enforce one platform = one account globally.

------------------------------------------------------------------------

# 8. Synchronization Architecture

Never make the dashboard directly call every external social API on
every page load.

Instead:

``` text
External Platform APIs
        ↓
Sync Workers
        ↓
Normalized Database
        ↓
Analytics Queries
        ↓
Dashboard
```

The dashboard reads primarily from our own database.

## 8.1 Sync Jobs

Examples:

``` text
SYNC_SOCIAL_ACCOUNT
SYNC_CONTENT
SYNC_CONTENT_METRICS
SYNC_COMMENTS
SYNC_AUDIENCE
REFRESH_SOCIAL_TOKEN
```

## 8.2 Sync Strategy

Use incremental synchronization.

Do not repeatedly download the entire history unless:

-   First connection
-   Manual full resync
-   Recovery process

Normal synchronization should use:

``` text
last_synced_at
last_external_cursor
updated_since
published_after
```

where supported.

## 8.3 Sync Status

Each account should expose:

``` text
Connected
Syncing
Healthy
Warning
Token Expired
Reauthorization Required
API Error
Rate Limited
```

------------------------------------------------------------------------

# 9. Historical Metrics

This is one of the most important database decisions.

DO NOT store only the latest metrics.

Bad:

``` text
content.views = 100000
content.likes = 5000
```

Better:

``` text
ContentMetricSnapshot

content_id
social_account_id
captured_at
views
likes
comments
shares
saves
followers_gained
```

This allows:

-   Growth charts
-   Velocity
-   Viral detection
-   Hourly/daily comparison
-   Historical reporting
-   Content lifecycle analysis

------------------------------------------------------------------------

# 10. Content Model

A content item is platform-independent.

Example:

``` text
Content
  |
  +-- ContentAsset
  |
  +-- ContentPlatform
          |
          +-- TikTok publication
          +-- Instagram publication
          +-- YouTube publication
```

This allows one uploaded asset to be published to multiple platforms
without duplicating the actual source asset.

------------------------------------------------------------------------

# 11. Publishing Architecture

Do NOT build one generic publishing function containing
platform-specific code.

Use adapters:

``` text
SocialPublisher
    |
    +-- TikTokPublisher
    +-- InstagramPublisher
    +-- YouTubePublisher
```

Each adapter implements a common interface.

Example conceptual interface:

``` text
connect()
authorize()
refreshToken()
getAccount()
listContent()
getMetrics()
publish()
getPublishStatus()
deletePublication()
```

Only implement methods actually supported by the platform.

Unsupported operations must return a structured capability error.

------------------------------------------------------------------------

# 12. Capability Matrix

Maintain platform capabilities in code/config.

Example:

``` text
TikTok
- analytics: partial / scope-dependent
- video publish: supported where approved
- scheduling: application-controlled workflow where supported
- comments: scope/API dependent

Instagram
- analytics: professional-account dependent
- publish: supported for eligible accounts/media
- comments: supported where permitted

YouTube
- analytics: supported through YouTube APIs with authorization
- upload: supported
- comments: supported
- scheduling: supported through YouTube publishing metadata
```

The application should query capabilities before showing actions in the
UI.

Example:

``` text
if capabilities.canPublishVideo === false
    hide Publish button
```

Do not show features that cannot actually be executed.

------------------------------------------------------------------------

# 13. Content Upload Flow

``` text
Create Content
    ↓
Upload Asset
    ↓
Validate file
    ↓
Store object in storage
    ↓
Create Content record
    ↓
Select Platforms
    ↓
Configure platform metadata
    ↓
Publish Now / Schedule / Draft
```

Supported initial asset types:

-   MP4
-   MOV
-   JPG
-   PNG
-   WEBP

Store large media files in object storage, not PostgreSQL.

Recommended:

``` text
Cloudflare R2
```

or equivalent S3-compatible storage.

PostgreSQL stores metadata only.

------------------------------------------------------------------------

# 14. Publishing Job Architecture

Use a queue for publishing and synchronization.

Recommended:

``` text
Redis
+
BullMQ
```

Job examples:

``` text
publish:tiktok
publish:instagram
publish:youtube

sync:account
sync:content
sync:metrics

refresh:token
generate:report
generate:ai-insight
```

Every job must be idempotent.

------------------------------------------------------------------------

# 15. Idempotency

Publishing jobs must never accidentally publish the same content twice
because a worker restarted.

Each job should have:

``` text
idempotency_key
```

Example:

``` text
{contentPlatformId}:{scheduledAt}:{operation}
```

Before publishing:

``` text
Check existing publication job
        ↓
Already completed?
        ↓
YES → return existing result
NO  → continue
```

------------------------------------------------------------------------

# 16. Retry Strategy

Use controlled retries.

Example:

``` text
Attempt 1
  ↓
30 seconds
  ↓
Attempt 2
  ↓
2 minutes
  ↓
Attempt 3
  ↓
10 minutes
  ↓
Dead Letter / Failed
```

Do not retry permanently invalid authorization errors.

Retry categories:

### Retryable

-   Network timeout
-   429 rate limit
-   Temporary 5xx
-   Temporary provider outage

### Non-retryable

-   Invalid token
-   Revoked authorization
-   Invalid media
-   Missing permission
-   Unsupported account type
-   Invalid request

------------------------------------------------------------------------

# 17. Rate Limiting

Every provider adapter must respect platform-specific quotas.

Never assume unlimited API access.

Store:

``` text
provider
endpoint
limit
remaining
reset_at
```

Where the API exposes this information.

Implement exponential backoff for rate limits.

------------------------------------------------------------------------

# 18. Analytics Dashboard

## Overview

Metrics:

-   Total followers
-   Total subscribers
-   Total views
-   Total likes
-   Total comments
-   Total shares
-   Total saves
-   Engagement rate
-   Content published
-   Growth rate

Filters:

``` text
Today
7 Days
30 Days
90 Days
Custom
```

Platform filters:

``` text
All
TikTok
Instagram
YouTube
```

------------------------------------------------------------------------

# 19. Content Analytics

Every content item should expose:

``` text
Views
Likes
Comments
Shares
Saves
Followers gained
Engagement rate
Performance score
```

Where available from the platform.

Metrics that are not provided by a platform must be represented as
NULL/unsupported, not as zero.

Important:

``` text
NULL ≠ 0
```

This prevents false analytics.

------------------------------------------------------------------------

# 20. Engagement Rate

Do not hard-code one universal formula.

Store the calculation definition.

Example:

``` text
engagement_rate =
(likes + comments + shares + saves) / views * 100
```

But platform-specific analytics may require different denominators or
available metrics.

Create:

``` text
MetricCalculationDefinition
```

so formulas can evolve without migrating historical data.

------------------------------------------------------------------------

# 21. Viral Detection

Calculate content velocity.

Example:

``` text
views_last_1h
views_last_6h
views_last_24h
average_views_for_same_age
```

Example signal:

``` text
current_velocity /
historical_average_velocity
```

If the ratio exceeds a configurable threshold:

``` text
VIRAL_ACCELERATION
```

Do not hard-code a universal viral threshold.

Store thresholds in settings.

------------------------------------------------------------------------

# 22. Best Posting Time

Analyze:

``` text
platform
weekday
hour
content_category
average_views
average_engagement
average_followers_gained
```

Generate:

``` text
Best Posting Windows
```

Only show this feature when enough historical data exists.

------------------------------------------------------------------------

# 23. Comment Analytics

Store comments only when the platform API and authorization permit it.

Possible analysis:

-   Sentiment
-   Topic
-   Language
-   Frequently discussed subjects
-   Positive/negative ratio
-   Engagement themes

AI analysis should be asynchronous.

Do not block the comment synchronization worker waiting for AI.

------------------------------------------------------------------------

# 24. AI Architecture

AI should not be tightly coupled to platform adapters.

Architecture:

``` text
Social Data
    ↓
Normalized Analytics
    ↓
Insight Service
    ↓
AI Provider
    ↓
AI Insight
```

AI features:

-   Content summary
-   Performance explanation
-   Caption generation
-   Hashtag suggestions
-   Hook suggestions
-   Content ideas
-   Weekly report
-   Performance recommendations

AI outputs must be stored with:

``` text
model
prompt_version
input_reference
created_at
```

This makes results auditable.

------------------------------------------------------------------------

# 25. Reports

Reports:

-   Daily
-   Weekly
-   Monthly
-   Custom range

Report sections:

``` text
Executive Summary
Platform Performance
Content Performance
Audience Growth
Top Content
Worst Content
Engagement
Recommendations
```

Export:

-   PDF
-   CSV
-   XLSX

------------------------------------------------------------------------

# 26. Workspace Architecture

Core hierarchy:

``` text
User
  ↓
Workspace
  ↓
WorkspaceMember
  ↓
SocialAccount
  ↓
Content
```

Roles:

``` text
OWNER
ADMIN
EDITOR
ANALYST
VIEWER
```

------------------------------------------------------------------------

# 27. Core Pages

``` text
/auth/login
/auth/register

/dashboard

/social-accounts
/social-accounts/[id]

/content
/content/new
/content/[id]
/content/[id]/analytics

/calendar

/analytics
/analytics/content
/analytics/audience
/analytics/engagement

/insights

/comments

/reports
/reports/[id]

/settings/profile
/settings/workspace
/settings/social-accounts
/settings/security
/settings/integrations
```

------------------------------------------------------------------------

# 28. Navigation

Recommended sidebar:

``` text
Overview

Analytics
  ├── Overview
  ├── Content
  ├── Audience
  └── Engagement

Content
  ├── All Content
  ├── Create
  └── Calendar

Social Accounts

AI Insights

Reports

Settings
```

------------------------------------------------------------------------

# 29. Database Technology

Use:

``` text
PostgreSQL
Prisma ORM
```

Preferred hosting:

``` text
Neon PostgreSQL
```

Supabase may be used only where needed for project-specific services,
but the canonical relational database should remain PostgreSQL.

Do not introduce MongoDB.

------------------------------------------------------------------------

# 30. ERD

``` mermaid
erDiagram

    USER ||--o{ SESSION : has
    USER ||--o{ WORKSPACE_MEMBER : joins
    WORKSPACE ||--o{ WORKSPACE_MEMBER : has
    WORKSPACE ||--o{ SOCIAL_ACCOUNT : owns

    SOCIAL_PLATFORM ||--o{ SOCIAL_ACCOUNT : defines

    SOCIAL_ACCOUNT ||--o{ SOCIAL_TOKEN : has
    SOCIAL_ACCOUNT ||--o{ CONTENT_PLATFORM : publishes
    SOCIAL_ACCOUNT ||--o{ METRIC_SNAPSHOT : records
    SOCIAL_ACCOUNT ||--o{ SYNC_JOB : executes

    CONTENT ||--o{ CONTENT_ASSET : contains
    CONTENT ||--o{ CONTENT_PLATFORM : distributed_as
    CONTENT ||--o{ CONTENT_CATEGORY : categorized
    CONTENT ||--o{ CONTENT_HASHTAG : tagged
    CONTENT ||--o{ AI_INSIGHT : analyzed

    CONTENT_PLATFORM ||--o{ METRIC_SNAPSHOT : measured
    CONTENT_PLATFORM ||--o{ PUBLISHING_JOB : publishes
    CONTENT_PLATFORM ||--o{ COMMENT : receives

    HASHTAG ||--o{ CONTENT_HASHTAG : used_by
    CATEGORY ||--o{ CONTENT_CATEGORY : classifies

    COMMENT ||--o{ COMMENT_ANALYSIS : analyzed

    USER {
        uuid id PK
        string email UK
        string name
        datetime created_at
        datetime updated_at
    }

    WORKSPACE {
        uuid id PK
        string name
        string slug UK
        uuid owner_id FK
        datetime created_at
        datetime updated_at
    }

    WORKSPACE_MEMBER {
        uuid id PK
        uuid workspace_id FK
        uuid user_id FK
        enum role
        datetime created_at
    }

    SOCIAL_PLATFORM {
        uuid id PK
        string code UK
        string name
        boolean active
    }

    SOCIAL_ACCOUNT {
        uuid id PK
        uuid workspace_id FK
        uuid platform_id FK
        string external_account_id
        string username
        string display_name
        string avatar_url
        enum status
        datetime last_synced_at
        datetime created_at
        datetime updated_at
    }

    SOCIAL_TOKEN {
        uuid id PK
        uuid social_account_id FK
        text access_token_encrypted
        text refresh_token_encrypted
        datetime access_token_expires_at
        datetime refresh_token_expires_at
        text scopes
        datetime last_refresh_at
        string last_error
        datetime created_at
        datetime updated_at
    }

    CONTENT {
        uuid id PK
        uuid workspace_id FK
        string title
        text description
        text caption
        enum status
        datetime published_at
        datetime created_at
        datetime updated_at
    }

    CONTENT_ASSET {
        uuid id PK
        uuid content_id FK
        string storage_key
        string mime_type
        bigint file_size
        int width
        int height
        int duration_seconds
        string checksum
        datetime created_at
    }

    CONTENT_PLATFORM {
        uuid id PK
        uuid content_id FK
        uuid social_account_id FK
        string external_content_id
        string external_url
        enum status
        datetime scheduled_at
        datetime published_at
        datetime created_at
        datetime updated_at
    }

    METRIC_SNAPSHOT {
        uuid id PK
        uuid content_platform_id FK
        uuid social_account_id FK
        datetime captured_at
        bigint views
        bigint likes
        bigint comments
        bigint shares
        bigint saves
        bigint followers_gained
        decimal engagement_rate
    }

    PUBLISHING_JOB {
        uuid id PK
        uuid content_platform_id FK
        string idempotency_key UK
        enum status
        int attempts
        datetime scheduled_at
        datetime started_at
        datetime completed_at
        string error_code
        text error_message
        datetime created_at
    }

    COMMENT {
        uuid id PK
        uuid content_platform_id FK
        string external_comment_id
        string author_external_id
        string author_name
        text body
        datetime published_at
        datetime created_at
    }

    COMMENT_ANALYSIS {
        uuid id PK
        uuid comment_id FK
        string sentiment
        string topic
        string language
        decimal confidence
        string model
        datetime created_at
    }

    CATEGORY {
        uuid id PK
        uuid workspace_id FK
        string name
        string slug
    }

    CONTENT_CATEGORY {
        uuid id PK
        uuid content_id FK
        uuid category_id FK
    }

    HASHTAG {
        uuid id PK
        string value UK
    }

    CONTENT_HASHTAG {
        uuid id PK
        uuid content_id FK
        uuid hashtag_id FK
    }

    AI_INSIGHT {
        uuid id PK
        uuid content_id FK
        string type
        text title
        text body
        string model
        string prompt_version
        datetime created_at
    }

    SYNC_JOB {
        uuid id PK
        uuid social_account_id FK
        string job_type
        enum status
        int attempts
        datetime started_at
        datetime completed_at
        string error_code
        text error_message
    }

    SESSION {
        uuid id PK
        uuid user_id FK
        string session_token UK
        datetime expires_at
    }
```

------------------------------------------------------------------------

# 31. Important Database Constraints

## Unique constraints

``` text
social_account:
(workspace_id, platform_id, external_account_id)

content_platform:
(content_id, social_account_id)

content_hashtag:
(content_id, hashtag_id)

content_category:
(content_id, category_id)

publishing_job:
idempotency_key
```

## Indexes

At minimum:

``` text
social_account(workspace_id, status)

social_token(social_account_id)

content(workspace_id, created_at)

content_platform(social_account_id, published_at)

metric_snapshot(content_platform_id, captured_at)

metric_snapshot(social_account_id, captured_at)

comment(content_platform_id, published_at)

sync_job(social_account_id, status)

publishing_job(status, scheduled_at)
```

------------------------------------------------------------------------

# 32. API Architecture

Use Next.js Route Handlers / server-side services.

Suggested structure:

``` text
src/
  app/
    api/
      auth/
      social/
        tiktok/
        instagram/
        youtube/
      content/
      analytics/
      publishing/
      comments/
      reports/
      ai/

  lib/
    auth/
    crypto/
    db/
    queue/
    storage/

  modules/
    social/
      core/
      providers/
        tiktok/
        instagram/
        youtube/

    content/
    analytics/
    publishing/
    comments/
    ai/
    reports/
```

------------------------------------------------------------------------

# 33. Provider Adapter Contract

Conceptual:

``` ts
interface SocialProvider {
  getAuthorizationUrl(): Promise<string>;

  exchangeAuthorizationCode(
    code: string
  ): Promise<TokenBundle>;

  refreshAccessToken(
    account: SocialAccount
  ): Promise<TokenBundle>;

  getAccountProfile(
    account: SocialAccount
  ): Promise<NormalizedSocialAccount>;

  listContent(
    account: SocialAccount,
    cursor?: string
  ): Promise<PaginatedResult<NormalizedContent>>;

  getContentMetrics(
    account: SocialAccount,
    externalContentId: string
  ): Promise<NormalizedMetrics>;

  getCapabilities(): ProviderCapabilities;
}
```

Publishing methods should be optional/capability-driven.

------------------------------------------------------------------------

# 34. Normalized Metrics

Create an internal normalized metric structure.

``` ts
interface NormalizedMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  followersGained: number | null;
  capturedAt: Date;
}
```

Never convert unsupported metrics into zero.

------------------------------------------------------------------------

# 35. Error Model

Use structured errors.

Example:

``` ts
{
  code: "SOCIAL_TOKEN_REVOKED",
  provider: "youtube",
  retryable: false,
  userActionRequired: true
}
```

Error categories:

``` text
SOCIAL_AUTH_REQUIRED
SOCIAL_TOKEN_EXPIRED
SOCIAL_TOKEN_REVOKED
SOCIAL_PERMISSION_MISSING
SOCIAL_RATE_LIMITED
SOCIAL_API_ERROR
SOCIAL_INVALID_MEDIA
SOCIAL_UNSUPPORTED_OPERATION
SOCIAL_ACCOUNT_RESTRICTED
```

------------------------------------------------------------------------

# 36. Security Requirements

Mandatory:

-   HTTPS in production.
-   HTTP-only secure cookies.
-   CSRF protection where applicable.
-   OAuth state validation.
-   PKCE where supported/appropriate.
-   Server-side token handling.
-   Token encryption.
-   Secret management.
-   No token logging.
-   No secrets in Git.
-   Input validation.
-   File type validation.
-   File size limits.
-   MIME validation.
-   Storage access controls.
-   Signed URLs for private media.
-   Rate limiting on application APIs.
-   Role-based authorization.
-   Audit logging for sensitive operations.

------------------------------------------------------------------------

# 37. OAuth State Security

Every OAuth flow must generate a cryptographically secure state value.

Store temporary authorization state server-side or in a securely
protected short-lived mechanism.

Callback must verify:

``` text
state === expected_state
```

Reject mismatches.

Never trust provider callback parameters without validation.

------------------------------------------------------------------------

# 38. Token Refresh Race Prevention

Example scenario:

``` text
Worker A → token expires → refresh
Worker B → token expires → refresh
Worker C → token expires → refresh
```

This can invalidate/overwrite token state.

Use distributed locking:

``` text
Redis SET NX
```

or equivalent database advisory locking.

Only one worker may refresh a token at a time.

------------------------------------------------------------------------

# 39. Observability

Track:

``` text
OAuth success/failure
Token refresh success/failure
API latency
API errors
Rate-limit events
Sync duration
Sync records
Publishing success/failure
Queue latency
AI generation failures
```

Never log:

``` text
access_token
refresh_token
client_secret
encryption_key
authorization_code
```

------------------------------------------------------------------------

# 40. Audit Log

Create:

``` text
AUDIT_LOG
```

Events:

``` text
ACCOUNT_CONNECTED
ACCOUNT_DISCONNECTED
TOKEN_REFRESH_FAILED
CONTENT_CREATED
CONTENT_UPDATED
CONTENT_PUBLISHED
CONTENT_PUBLISH_FAILED
CONTENT_DELETED
REPORT_GENERATED
MEMBER_ADDED
MEMBER_REMOVED
```

------------------------------------------------------------------------

# 41. Environment Variables

Example:

``` env
DATABASE_URL=

AUTH_SECRET=

TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=

META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

TOKEN_ENCRYPTION_KEY=

REDIS_URL=

STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_BUCKET=

AI_API_KEY=
```

Never commit `.env`.

Commit:

``` text
.env.example
```

with placeholders only.

------------------------------------------------------------------------

# 42. Antigravity Project Structure

Recommended workspace:

``` text
social-media-intelligence/
│
├── .agents/
│   ├── rules/
│   │   ├── architecture.md
│   │   ├── security.md
│   │   └── coding-standards.md
│   │
│   ├── skills/
│   │   └── social-platform-integration/
│   │       └── SKILL.md
│   │
│   └── agents/
│       ├── backend.md
│       ├── frontend.md
│       ├── database.md
│       └── security-reviewer.md
│
├── docs/
│   ├── BRD.md
│   ├── ERD.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── SOCIAL_CAPABILITIES.md
│   └── IMPLEMENTATION_PLAN.md
│
├── prisma/
│   └── schema.prisma
│
├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── modules/
│
├── tests/
│
├── .env.example
├── package.json
└── README.md
```

------------------------------------------------------------------------

# 43. Antigravity Rules

The project should use workspace-specific Agent Rules.

Recommended rules:

## Architecture Rule

The agent must:

-   Respect module boundaries.
-   Keep provider-specific logic inside provider adapters.
-   Never put TikTok/Instagram/YouTube API calls directly inside React
    components.
-   Never access Prisma directly from UI components.
-   Use server-side services for external API calls.

## Security Rule

The agent must:

-   Never expose OAuth tokens to client code.
-   Never log secrets.
-   Never hard-code secrets.
-   Never store social passwords.
-   Never bypass authorization checks.
-   Never disable token encryption.
-   Never add secrets to fixtures or test snapshots.

## Database Rule

The agent must:

-   Use Prisma migrations.
-   Preserve relational integrity.
-   Add indexes for high-volume metric tables.
-   Use nullable fields for unavailable platform metrics.
-   Never silently interpret unsupported metrics as zero.

## Testing Rule

Every social provider integration must have:

-   Unit tests
-   Token lifecycle tests
-   Error mapping tests
-   Rate-limit tests
-   Mock API tests
-   Publishing idempotency tests

------------------------------------------------------------------------

# 44. Antigravity Agent Strategy

Use specialized agents/subagents rather than asking one agent to build
everything blindly.

Suggested roles:

``` text
Architect
    ↓
Database Agent
    ↓
Backend Agent
    ↓
OAuth/Security Agent
    ↓
Provider Integration Agent
    ↓
Frontend Agent
    ↓
QA Agent
    ↓
Security Reviewer
```

Parallel work is acceptable only when dependencies are clear.

Do not allow frontend implementation to invent backend contracts.

------------------------------------------------------------------------

# 45. Implementation Order

## Phase 0 --- Research

Before coding:

1.  Verify current TikTok API capabilities.
2.  Verify current Instagram API capabilities.
3.  Verify current YouTube API capabilities.
4.  Verify required scopes.
5.  Verify account-type requirements.
6.  Verify current publishing limitations.
7.  Verify rate limits.
8.  Verify token lifecycle.
9.  Record findings in `docs/SOCIAL_CAPABILITIES.md`.

This document must be updated whenever provider capabilities change.

## Phase 1 --- Foundation

Implement:

-   Next.js
-   TypeScript
-   Tailwind
-   shadcn/ui
-   PostgreSQL
-   Prisma
-   Auth
-   Workspace
-   RBAC
-   Basic dashboard shell

## Phase 2 --- Social Accounts

Implement:

-   TikTok OAuth
-   Instagram OAuth
-   YouTube OAuth
-   Token encryption
-   Token manager
-   Refresh flow
-   Account connection UI
-   Disconnect flow

## Phase 3 --- Synchronization

Implement:

-   Queue
-   Redis
-   Sync workers
-   Content synchronization
-   Metric snapshots
-   Sync logs

## Phase 4 --- Content

Implement:

-   Content library
-   Upload
-   Storage
-   Content editor
-   Platform configuration

## Phase 5 --- Publishing

Implement provider-specific publishers.

Start with one platform at a time.

Each platform must pass integration tests before moving to the next.

## Phase 6 --- Analytics

Implement:

-   Dashboard
-   Charts
-   Content analytics
-   Comparison
-   Growth
-   Engagement

## Phase 7 --- AI

Implement:

-   AI insights
-   Caption generation
-   Content ideas
-   Performance recommendations

## Phase 8 --- Reports

Implement:

-   Weekly reports
-   Monthly reports
-   PDF
-   CSV
-   XLSX

------------------------------------------------------------------------

# 46. MVP Scope

MVP should NOT include every feature.

Required MVP:

``` text
Authentication
Workspace
Social account connection
TikTok connection
Instagram connection
YouTube connection
Token manager
Content sync
Metric snapshots
Dashboard
Content library
Content detail
Basic analytics
Upload
Basic publishing where officially supported
```

After MVP:

``` text
Calendar
Scheduling
AI
Comment analysis
Best posting time
Viral detection
Reports
Team management
Revenue
```

------------------------------------------------------------------------

# 47. Definition of Done

A feature is not considered complete until:

1.  UI exists.
2.  Server/API exists.
3.  Database migration exists.
4.  Validation exists.
5.  Authorization exists.
6.  Error states exist.
7.  Loading states exist.
8.  Empty states exist.
9.  Tests exist.
10. Documentation is updated.
11. No secrets are exposed.
12. Provider-specific assumptions are documented.

------------------------------------------------------------------------

# 48. Critical Anti-Patterns

DO NOT:

``` text
❌ Store social passwords
❌ Store raw tokens in frontend
❌ Store tokens in localStorage
❌ Call social APIs directly from React components
❌ Store media blobs in PostgreSQL
❌ Hard-code platform assumptions
❌ Assume every platform exposes the same metrics
❌ Treat unavailable metrics as zero
❌ Refresh tokens from multiple workers simultaneously
❌ Retry revoked-token errors forever
❌ Publish synchronously inside a page request
❌ Build one giant social-media service
❌ Commit .env
❌ Log OAuth credentials
```

------------------------------------------------------------------------

# 49. Product Success Metrics

Technical:

``` text
OAuth success rate
Sync success rate
Token refresh success rate
Publishing success rate
API error rate
Average sync duration
Queue latency
```

Product:

``` text
Connected accounts
Active workspaces
Content published
Content analyzed
Reports generated
AI insights generated
```

------------------------------------------------------------------------

# 50. Final Architectural Principle

The application must be designed as:

``` text
                 ┌──────────────────────┐
                 │      Next.js UI      │
                 └──────────┬───────────┘
                            │
                 ┌──────────▼───────────┐
                 │   Application API    │
                 └──────────┬───────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
     Content Service   Analytics Service   AI Service
          │                 │
          │                 ▼
          │            PostgreSQL
          │                 ▲
          ▼                 │
    Storage Service         │
                            │
                    Sync / Worker Layer
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
           TikTok       Instagram       YouTube
```

The external platforms are **providers**, not the application's
database.

PostgreSQL is the canonical internal source of normalized historical
analytics.

OAuth credentials are security-sensitive infrastructure.

All platform-specific behavior belongs behind provider adapters.

All long-running work belongs in background jobs.

All analytics depend on historical snapshots.

All AI insights depend on normalized internal data rather than directly
querying social APIs.

This architecture is the foundation for a professional, scalable
social-media management and analytics product.
