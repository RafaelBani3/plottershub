# Security Specification

Version: 1.0

## Core rule

The application must never request or store a user's TikTok, Instagram,
Meta, Google or YouTube password.

Use OAuth only.

## Token storage

Store encrypted credentials server-side:

``` text
access_token_encrypted
refresh_token_encrypted
access_token_expires_at
refresh_token_expires_at
scopes
token_status
last_refresh_at
last_error
```

Use authenticated encryption such as AES-256-GCM.

The encryption key lives only in server-side secrets.

## Token lifecycle

``` text
OAuth callback
   |
   v
validate state / PKCE
   |
   v
exchange authorization code
   |
   v
encrypt tokens
   |
   v
persist
   |
   v
TokenManager
   |
   +--> valid --> use
   |
   +--> expired --> refresh under distributed lock
                         |
                         +--> success --> encrypt + persist
                         |
                         +--> revoked --> REAUTH_REQUIRED
```

## Refresh race prevention

Only one worker may refresh a given social account at a time.

Recommended lock:

``` text
social-token-refresh:{socialAccountId}
```

Use Redis distributed locking or a database advisory lock.

## Never log

-   access tokens
-   refresh tokens
-   authorization codes
-   client secrets
-   encryption keys
-   session tokens

## OAuth security

-   Use cryptographically secure `state`.
-   Validate callback state.
-   Use PKCE where supported/appropriate.
-   Validate redirect URI exactly.
-   Use HTTPS in production.
-   Keep OAuth callback endpoints server-side.
-   Never place tokens in query strings.
-   Never store tokens in localStorage.

## Application security

-   Secure HTTP-only cookies
-   CSRF protection where applicable
-   RBAC
-   Request validation
-   Rate limiting
-   Audit logging
-   File type/size validation
-   Signed private media URLs
-   Server-side authorization on every workspace resource

## File security

Uploaded files must be validated using: - extension - MIME type - file
signature where practical - size - media metadata

Do not trust a browser-provided MIME type alone.

## Secrets

Use environment variables or deployment secret managers.

Commit only:

``` text
.env.example
```

Never commit real secrets.

## Incident states

Social connection status:

``` text
CONNECTED
SYNCING
WARNING
TOKEN_EXPIRED
REAUTH_REQUIRED
RATE_LIMITED
ERROR
DISCONNECTED
```

The UI should explain required user action without revealing provider
internals or secrets.

## Audit events

Record: - account connected - account disconnected - authorization
failure - token refresh failure - content created - content published -
content publish failed - report generated - member added/removed

Audit records must not contain credentials.
