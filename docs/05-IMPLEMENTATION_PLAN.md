# Implementation Plan

Version: 1.0

## Phase 0 --- Repository foundation

Deliver: - Next.js project - TypeScript - Tailwind - shadcn/ui -
ESLint/formatting - PostgreSQL connection - Prisma - `.env.example` -
base folder structure - CI/test baseline

Do not implement social integrations yet.

## Phase 1 --- Application authentication

Deliver: - registration/login - session management - protected routes -
user model - workspace model - workspace membership - RBAC

Acceptance: - unauthenticated users cannot access private routes -
workspace authorization is enforced server-side

## Phase 2 --- Social connection framework

Deliver: - SocialPlatform - SocialAccount - SocialToken - provider
interface - TokenManager - encrypted token storage - OAuth state
handling - connection/disconnection UI

Start with YouTube or TikTok as the first complete provider.

## Phase 3 --- First provider vertical slice

Complete one provider end-to-end:

``` text
OAuth
→ account profile
→ content sync
→ metrics
→ snapshots
→ dashboard
```

Do not implement all three simultaneously.

## Phase 4 --- Sync engine

Deliver: - Redis - BullMQ - sync jobs - retries - exponential backoff -
rate-limit handling - sync status - job audit

## Phase 5 --- Content library

Deliver: - upload - object storage - content records - asset metadata -
categories - hashtags - content detail

## Phase 6 --- Publishing

Deliver provider-specific publishing adapters.

Each provider: - capability check - upload/publish flow - processing
status - failure handling - idempotency - retry policy

## Phase 7 --- Remaining providers

Complete the remaining two providers one at a time.

## Phase 8 --- Analytics

Deliver: - overview - content analytics - platform comparison - growth
charts - engagement - best-performing content - performance history

## Phase 9 --- Calendar

Deliver: - draft - scheduled - published - failed - platform filters

## Phase 10 --- AI

Deliver: - content summary - caption generator - content ideas -
performance explanation - weekly insight

AI jobs must run asynchronously.

## Phase 11 --- Reports

Deliver: - weekly - monthly - custom - PDF - CSV - XLSX

## Phase 12 --- Hardening

Deliver: - security audit - dependency audit - provider quota review -
load testing - backup/restore test - observability - production runbook

## MVP definition

MVP is complete when:

-   user can sign in
-   user can create a workspace
-   user can connect at least one provider
-   provider account can be synchronized
-   content appears in the internal database
-   historical metrics are stored
-   dashboard shows real metrics
-   token refresh/re-auth states work
-   one publishing workflow works where officially supported
-   automated tests cover critical paths

## Do not start with

-   revenue estimation
-   advanced AI
-   multi-client white labeling
-   complex team workflows
-   every platform at once

Those come after the core data pipeline is reliable.
