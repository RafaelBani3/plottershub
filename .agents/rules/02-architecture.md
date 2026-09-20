# Architecture Rule

Keep provider-specific code inside provider adapters.

Never call TikTok/Instagram/YouTube APIs from React components.

Long-running work belongs in BullMQ workers.

Use PostgreSQL as the canonical internal data store.

Use metric snapshots for historical analytics.

Keep frontend, application services, provider integrations and
infrastructure clearly separated.
