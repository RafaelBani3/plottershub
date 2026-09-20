---
description: Implement secure OAuth connections, encrypted token
  storage, refresh lifecycle and reauthorization for social providers.
name: oauth-integration
---

# OAuth Integration

Use: - secure state - PKCE where appropriate - server-side callbacks -
encrypted token persistence - TokenManager - refresh locking

Never expose tokens to the frontend.

Handle: - success - expiration - refresh - revocation - missing scope -
reauthorization
