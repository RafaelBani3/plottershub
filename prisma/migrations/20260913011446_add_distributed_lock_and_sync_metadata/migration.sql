-- AlterTable
ALTER TABLE "sync_jobs" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "distributed_locks" (
    "key" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "owner_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributed_locks_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "distributed_locks_expires_at_idx" ON "distributed_locks"("expires_at");

-- RenameIndex
ALTER INDEX "analytics_observations_workspace_id_external_content_id_observa" RENAME TO "analytics_observations_workspace_id_external_content_id_obs_idx";

-- RenameIndex
ALTER INDEX "analytics_observations_workspace_id_social_account_id_granulari" RENAME TO "analytics_observations_workspace_id_social_account_id_granu_idx";

-- RenameIndex
ALTER INDEX "analytics_observations_workspace_id_social_account_id_query_pat" RENAME TO "analytics_observations_workspace_id_social_account_id_query_idx";

-- RenameIndex
ALTER INDEX "social_accounts_workspace_id_platform_id_external_account__key" RENAME TO "social_accounts_workspace_id_platform_id_external_account_i_key";
