# Security Rule

Never expose OAuth access/refresh tokens to client code.

Never log: - tokens - authorization codes - client secrets - encryption
keys

Use server-side token management and encrypted storage.

Validate OAuth state and use PKCE where supported/appropriate.

Treat provider credentials as secrets.
