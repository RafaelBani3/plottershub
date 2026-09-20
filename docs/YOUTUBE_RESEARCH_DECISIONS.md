# YouTube Research Decisions & Architecture Alignment (Phase 3.0A)

**Document Version:** 1.1  
**Date:** 2026-09-11  
**Status:** Approved Architectural Decision Record (ADR)  
**Provider:** YouTube (Google OAuth 2.0, YouTube Data API v3, YouTube Analytics API v2)

---

## 1. Decision Records

### ADR-001: Canonical Identity Model for YouTube Accounts
- **Decision:** A connected YouTube `SocialAccount` canonical identity MUST be the YouTube Channel ID (`UC...` returned by `channels.list(mine=true)`), NOT the Google account email address or Google user ID (`sub`).
- **Rationale:** A single Google account can own or manage multiple YouTube channels (Brand Accounts). Mapping by email would cause key collisions and cannot distinguish between multiple channels managed by the same creator credentials.
- **Classification:** `[VERIFIED OFFICIAL BEHAVIOR]`

### ADR-002: Google Scope Separation & Identity
- **Decision:** 
  - `https://www.googleapis.com/auth/userinfo.profile` provides Google user display name, avatar, and account identifier. It does **NOT** provide email.
  - `https://www.googleapis.com/auth/userinfo.email` is optional and only requested if workspace user audit requires correlating the Google identity.
  - Core MVP connection relies strictly on `openid`, `userinfo.profile`, `https://www.googleapis.com/auth/youtube.readonly`, and `https://www.googleapis.com/auth/yt-analytics.readonly`.
- **Classification:** `[VERIFIED OFFICIAL BEHAVIOR]`

### ADR-003: Quota Policy as Runtime Configuration
- **Decision:** Do NOT hardcode YouTube quota numbers (such as 10,000 units/day or method costs) into immutable business logic. Introduce a configurable `QuotaPolicy` model.
- **Rationale:** Google grants custom quota extensions for enterprise projects, and API method costs or daily limits can change across API revisions.
- **Classification:** `[ARCHITECTURAL RECOMMENDATION]`

### ADR-004: Strict Nullable Metric Semantics (`NULL != 0`)
- **Decision:**
  - `NULL`: Metric was unavailable, unsupported by the provider API, or omitted from the response.
  - `0`: Provider API explicitly returned 0 (e.g., zero views or zero likes).
- **Enforcement:** Applied end-to-end through API clients, data mappers, database columns, business services, and UI visualization.
- **Classification:** `[VERIFIED OFFICIAL BEHAVIOR]`

### ADR-005: Subscribers Gained Dimensional Semantics
- **Decision:** `subscribersGained` must not be treated as a generic scalar without context. The system must track dimensional context:
  - Channel-level daily aggregate (`dimensions=day`): Net subscribers gained across the entire channel on that date.
  - Video-level aggregate (`dimensions=video` or `filters=video==VIDEO_ID`): Subscriptions attributed directly to viewer sessions on that specific video.
- **Classification:** `[VERIFIED OFFICIAL BEHAVIOR]`

### ADR-006: Content Discovery Pattern (98% Quota Savings)
- **Decision:** Never use `search.list` for routine synchronization. Routine video discovery must follow:
  `channels.list(mine=true)` → Uploads Playlist ID (`UU...`) → `playlistItems.list` → `videos.list(part=snippet,statistics,contentDetails,status)`.
- **Classification:** `[ARCHITECTURAL RECOMMENDATION]`

### ADR-007: Provider Code Organization
- **Decision:** Recommended YouTube provider module structure under `src/modules/social/providers/youtube/`:
  - `youtube.provider.ts` — Main adapter implementing `SocialProvider` contract.
  - `youtube.oauth.ts` — Authorization URL builder, PKCE, token exchange.
  - `youtube.data-api.ts` — YouTube Data API v3 HTTP client.
  - `youtube.analytics-api.ts` — YouTube Analytics API v2 client.
  - `youtube.mapper.ts` — DTO transformation into Plottershub normalized types.
  - `youtube.errors.ts` — Google error response parser.
  - `youtube.types.ts` — Raw Google/YouTube API TypeScript interfaces.
- **Constraint:** Centralized `SocialTokenManager` remains the ONLY token management and distributed locking system.
- **Classification:** `[ARCHITECTURAL RECOMMENDATION]`

---

## 2. Status Classification Legend

- `[VERIFIED OFFICIAL BEHAVIOR]`: Confirmed directly by Google / YouTube official developer documentation.
- `[ARCHITECTURAL RECOMMENDATION]`: Best-practice system design tailored for Plottershub scalability, quota efficiency, and security.
- `[IMPLEMENTATION ASSUMPTION]`: Structural choice for Phase 3 development subject to live testing verification.
- `[UNRESOLVED / RUNTIME VERIFICATION REQUIRED]`: Feature requiring runtime API inspection during Phase 3 implementation (e.g., demographic threshold minimums).
