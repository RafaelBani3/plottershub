-- CreateEnum
CREATE TYPE "MetricGranularity" AS ENUM ('DAILY', 'AGGREGATED');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('DATA_API', 'ANALYTICS_API', 'REPORTING_API', 'ESTIMATED');

-- CreateTable
CREATE TABLE "analytics_observations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "social_account_id" TEXT NOT NULL,
    "external_account_id" TEXT,
    "external_content_id" TEXT,
    "provider" TEXT NOT NULL,
    "source" "MetricSource" NOT NULL DEFAULT 'ANALYTICS_API',
    "query_pattern" TEXT NOT NULL,
    "granularity" "MetricGranularity" NOT NULL DEFAULT 'DAILY',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "observation_date" DATE,
    "identity_key" TEXT NOT NULL,
    "identity_hash" VARCHAR(64) NOT NULL,
    "dimensions" JSONB,
    "metrics" JSONB NOT NULL,
    "views" BIGINT,
    "estimated_minutes_watched" BIGINT,
    "average_view_duration" INTEGER,
    "average_view_percentage" DECIMAL(5,2),
    "likes" BIGINT,
    "comments" BIGINT,
    "shares" BIGINT,
    "saves" BIGINT,
    "subscribers_gained" BIGINT,
    "subscribers_lost" BIGINT,
    "engagement_rate" DECIMAL(8,4),
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_job_id" TEXT,
    "data_lag_days" INTEGER,

    CONSTRAINT "analytics_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_id_workspace_id_key" ON "social_accounts"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_observations_identity_hash_key" ON "analytics_observations"("identity_hash");

-- CreateIndex
CREATE INDEX "analytics_observations_workspace_id_social_account_id_query_pattern_observation_date_idx" ON "analytics_observations"("workspace_id", "social_account_id", "query_pattern", "observation_date" DESC);

-- CreateIndex
CREATE INDEX "analytics_observations_workspace_id_external_content_id_observation_date_idx" ON "analytics_observations"("workspace_id", "external_content_id", "observation_date" DESC);

-- CreateIndex
CREATE INDEX "analytics_observations_workspace_id_social_account_id_granularity_start_date_end_date_idx" ON "analytics_observations"("workspace_id", "social_account_id", "granularity", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "analytics_observations_social_account_id_captured_at_idx" ON "analytics_observations"("social_account_id", "captured_at" DESC);

-- AddForeignKey
ALTER TABLE "analytics_observations" ADD CONSTRAINT "analytics_observations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_observations" ADD CONSTRAINT "analytics_observations_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_observations" ADD CONSTRAINT "analytics_observations_sync_job_id_fkey" FOREIGN KEY ("sync_job_id") REFERENCES "sync_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
