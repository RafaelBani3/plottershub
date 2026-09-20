# Antigravity Operating Rules

Version: 1.0

## Rule 1 --- Read before coding

Before changing code, inspect:

``` text
docs/BRD-ERD.md
docs/01-SOCIAL_API_CAPABILITIES.md
docs/02-ARCHITECTURE.md
docs/03-SECURITY.md
docs/05-IMPLEMENTATION_PLAN.md
```

If requirements conflict, stop and report the conflict instead of
silently choosing.

## Rule 2 --- Research current provider APIs

For TikTok, Instagram and YouTube, use official documentation first.

Never rely on stale blog posts for: - OAuth scopes - API endpoints -
token behavior - publishing capabilities - metric availability - quotas

Update `SOCIAL_CAPABILITIES.md` before implementing a changed provider
capability.

## Rule 3 --- No frontend secrets

Never expose: - access token - refresh token - client secret -
encryption key

to browser code.

## Rule 4 --- Provider isolation

Never place provider-specific API calls inside: - React components -
page components - generic database services

Use:

``` text
modules/social/providers/{provider}
```

## Rule 5 --- Database discipline

-   Use Prisma migrations.
-   Do not manually mutate production schema.
-   Add indexes for high-volume tables.
-   Use nullable metrics for unsupported provider values.
-   Preserve historical snapshots.

## Rule 6 --- Jobs are idempotent

Every worker must be safe to retry.

Publishing must use an idempotency key.

## Rule 7 --- Errors are structured

Use stable error codes such as:

``` text
SOCIAL_AUTH_REQUIRED
SOCIAL_TOKEN_REVOKED
SOCIAL_PERMISSION_MISSING
SOCIAL_RATE_LIMITED
SOCIAL_INVALID_MEDIA
SOCIAL_UNSUPPORTED_OPERATION
```

Do not leak provider secrets or raw credentials into user-facing errors.

## Rule 8 --- Do not overbuild

Implement the smallest complete vertical slice first.

Preferred order:

``` text
Foundation
→ Auth
→ One social provider
→ Sync
→ Metrics
→ Content
→ Publishing
→ Second provider
→ Third provider
→ Advanced analytics
→ AI
```

## Rule 9 --- Tests before expansion

A provider is not complete until: - OAuth callback is tested - token
refresh is tested - revoked token is tested - rate-limit behavior is
tested - API error mapping is tested - sync is tested - publish
idempotency is tested

## Rule 10 --- Explain assumptions

If a provider capability cannot be confirmed, mark it as:

``` text
UNKNOWN — REQUIRES OFFICIAL DOC VERIFICATION
```

Never silently invent behavior.
