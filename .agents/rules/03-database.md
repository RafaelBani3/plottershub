# Database Rule

Use PostgreSQL + Prisma.

Use migrations.

Do not store large media binaries in PostgreSQL.

Add indexes to high-volume metric and job tables.

Use NULL for metrics unavailable from a provider; do not silently
convert unsupported values to zero.

Preserve external provider IDs and internal IDs separately.
