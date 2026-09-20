# Social API Capabilities Matrix

Version: 1.0 Date: 2026-09-10

## Purpose

This document is the source of truth for what the application may assume
about TikTok, Instagram and YouTube integrations.

**Rule:** Never implement a platform capability based only on this
document if the official provider documentation has changed. Re-verify
before implementation.

## Current research baseline

### TikTok

The current TikTok developer documentation exposes scopes including
`user.info.basic`, `user.info.stats`, `video.list`, `video.publish`, and
`video.upload`. `video.list` can list a user's public videos;
`video.publish` enables Direct Post; `video.upload` can send content to
the creator's TikTok account as a draft. TikTok's Direct Post
documentation also states that unaudited clients are restricted to
private viewing mode and that the `video.publish` scope must be
approved. The Direct Post initialization endpoint is limited to 6
requests/minute per user access token.

Sources: - https://developers.tiktok.com/docs/en/tiktok-api-scopes -
https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list -
https://developers.tiktok.com/docs/en/content-posting-api-get-started -
https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post

### Instagram

The current Instagram Platform supports Instagram Professional accounts
(Business and Creator). The newer Instagram Login configuration uses
Instagram-specific scopes such as `instagram_business_basic`,
`instagram_business_content_publish`,
`instagram_business_manage_comments`, and
`instagram_business_manage_insights`. The Facebook Login configuration
has a different permission model and can require a linked Facebook Page.

Publishing requires media to be accessible by the provider at publish
time. Insights are available for professional accounts through the
relevant API configuration.

Sources: -
https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api -
Meta Instagram Platform documentation:
https://developers.facebook.com/docs/instagram-platform/

### YouTube

YouTube Data API v3 uses OAuth 2.0 for channel management, content discovery, and publishing operations. YouTube Analytics API v2 provides deep time-series reports, retention metrics, and geographical/demographic distributions.

**Key Architecture Decisions for YouTube:**
- **Content Discovery & Quota Optimization:** Routine video discovery MUST use `channels.list` -> `uploads` playlist ID (`UU...`) -> `playlistItems.list` -> batched `videos.list(part=snippet,statistics,contentDetails,status)` (costing 1 quota unit per 50 videos instead of 100 quota units via `search.list`).
- **Granular Scopes:** MVP requires strictly `https://www.googleapis.com/auth/youtube.readonly` and `https://www.googleapis.com/auth/yt-analytics.readonly`. Write/Upload scopes (`youtube.upload`, `youtube.force-ssl`) are requested only when publishing or moderation features are used.
- **Offline Access:** OAuth initiation must specify `access_type=offline` and `prompt=consent` to guarantee issuance of a refresh token.
- **Publishing & Scheduling:** Resumable chunked upload protocol via `videos.insert`. Video scheduling requires setting `status.privacyStatus = "private"` and `status.publishAt = "{ISO8601_TIMESTAMP}"`.
- **Compliance & Audit:** Production applications uploading public videos require Google OAuth App Verification and YouTube API Compliance Audit.

See [`docs/YOUTUBE_INTEGRATION_SPEC.md`](file:///c:/Users/user/Documents/Project/plottershub/docs/YOUTUBE_INTEGRATION_SPEC.md) and [`docs/YOUTUBE_CONTENT_READ_SPEC.md`](file:///c:/Users/user/Documents/Project/plottershub/docs/YOUTUBE_CONTENT_READ_SPEC.md) for complete technical specifications.

Sources:
- https://developers.google.com/youtube/v3/guides/authentication
- https://developers.google.com/youtube/v3/docs
- https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
- https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- https://developers.google.com/youtube/analytics

## Capability matrix

  ----------------------------------------------------------------------------------
  Capability            TikTok            Instagram               YouTube
  --------------------- ----------------- ----------------------- ------------------
  OAuth                 YES               YES                     YES

  Basic profile         YES,              YES, Professional       YES
                        scope-dependent   accounts                

  Follower/subscriber   YES,              YES, scope/metric       YES
  stats                 scope-dependent   dependent               

  List published        YES, public       YES, Professional       YES
  content               videos            accounts                

  Views                 Provider/API      YES, insights-dependent YES
                        dependent                                 

  Likes                 Provider/API      YES, media insights     YES
                        dependent                                 

  Comments              Must verify exact YES,                    YES
                        approved          permission-dependent    
                        API/scope                                 

  Shares                Must verify exact Metric availability     Not equivalent to
                        metric/API        must be verified        Instagram/TikTok
                        availability                              share metric

  Saves                 Must verify exact Metric availability     Not equivalent to
                        metric/API        must be verified        Instagram/TikTok
                        availability                              save metric

  Upload                YES,              YES, Professional       YES
                        `video.upload` /  accounts                
                        posting flows                             

  Direct publish        YES,              YES, Professional       YES
                        `video.publish`   accounts                

  Scheduling            App-level job     App-level scheduling +  App-level
                        scheduling +      provider publishing     scheduling using
                        provider workflow workflow                upload/publish
                                                                  metadata

  Content status        YES               YES                     YES

  Comments sync         Scope/API         YES,                    YES
                        dependent         permission-dependent    

  Deep analytics        Scope/API         Insights API            YouTube Analytics
                        dependent                                 API

  Webhooks              Verify current    Recommended/available   Use polling/API
                        product support   for relevant events     where appropriate
                        before                                    
                        implementation                            
  ----------------------------------------------------------------------------------

## Important implementation rules

1.  Do not map unavailable metrics to zero.
2.  Use `NULL` for unsupported/unavailable values.
3.  Store raw provider payloads only when useful and safe; never store
    tokens in raw payloads.
4.  Keep provider-specific code behind adapters.
5.  Every capability must have a feature flag/capability check.
6.  Before implementation, the Social API Agent must re-check official
    docs and update this file if anything changed.
7.  For publishing, provider approval/audit requirements are part of
    deployment readiness, not merely coding.

## Normalized metrics

Use nullable fields:

``` ts
type NormalizedMetrics = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  followersGained: number | null;
  capturedAt: Date;
};
```

`null` means unavailable/unsupported/not returned. `0` means the
provider explicitly returned zero.
