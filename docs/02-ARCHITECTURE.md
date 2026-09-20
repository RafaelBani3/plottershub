# Architecture

Version: 1.0

## Stack

-   Next.js
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   PostgreSQL
-   Prisma ORM
-   Neon PostgreSQL as preferred hosted DB
-   Redis + BullMQ for background jobs
-   S3-compatible object storage, preferably Cloudflare R2
-   Auth.js-compatible application authentication
-   Official TikTok / Meta Instagram / Google APIs

## High-level architecture

``` text
Browser
  |
  v
Next.js App
  |
  +--> Auth
  +--> API / Server Actions
  +--> Application Services
          |
          +--> Social Provider Adapters
          |      +--> TikTok
          |      +--> Instagram
          |      +--> YouTube
          |
          +--> Content Service
          +--> Analytics Service
          +--> Publishing Service
          +--> AI Service
          +--> Token Manager
          |
          +--> PostgreSQL
          +--> Object Storage
          +--> Redis / BullMQ
```

## Source of truth

PostgreSQL is the canonical internal store for normalized application
data and historical metrics.

External platforms are providers, not the application's database.

The dashboard should read primarily from PostgreSQL rather than calling
all providers during page rendering.

## Provider adapter

Each platform gets its own adapter:

``` text
SocialProvider
  +-- TikTokProvider
  +-- InstagramProvider
  +-- YouTubeProvider
```

No React component may call a social API.

## Background jobs

Long-running operations must use jobs:

-   account sync
-   content sync
-   metric sync
-   comment sync
-   token refresh
-   publish now
-   scheduled publish
-   report generation
-   AI analysis

## Idempotency

Every publish job must have a unique idempotency key.

A worker restart must never result in an accidental duplicate publish.

## Sync strategy

First connection: - full initial sync - save provider cursor if
available

Normal sync: - incremental - use provider cursors / updated timestamps
where available - capture metrics as snapshots

Recovery: - manual full resync - admin-controlled

## Recommended module boundaries

``` text
src/modules/social
src/modules/content
src/modules/publishing
src/modules/analytics
src/modules/comments
src/modules/ai
src/modules/reports
```

Shared infrastructure:

``` text
src/lib/db
src/lib/crypto
src/lib/queue
src/lib/storage
src/lib/auth
```

## Architecture decisions

### ADR-001: PostgreSQL + Prisma

Use PostgreSQL as the relational source of truth. Prisma manages schema
and migrations.

### ADR-002: Adapter-based social integrations

Provider-specific differences are isolated behind adapters.

### ADR-003: Snapshot metrics

Never overwrite historical performance. Store timestamped snapshots.

### ADR-004: Queue external operations

Do not perform publishing/syncing in user-facing request lifecycles.

### ADR-005: Server-side credentials

OAuth tokens are server-only secrets and are never returned to the
browser.

### ADR-006: Capability-driven UI

The frontend only exposes operations supported by the connected
provider/account.
