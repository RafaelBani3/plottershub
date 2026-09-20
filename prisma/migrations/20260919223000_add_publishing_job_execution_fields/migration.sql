-- CreateEnum
CREATE TYPE "PublishingStatus" AS ENUM ('DRAFT', 'QUEUED', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'RECONCILING');

-- AlterTable
ALTER TABLE "publishing_jobs" ADD COLUMN "publishing_status" "PublishingStatus" NOT NULL DEFAULT 'QUEUED';
ALTER TABLE "publishing_jobs" ADD COLUMN "storage_key" TEXT;
ALTER TABLE "publishing_jobs" ADD COLUMN "upload_session_url_encrypted" TEXT;
ALTER TABLE "publishing_jobs" ADD COLUMN "bytes_uploaded" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "publishing_jobs" ADD COLUMN "total_bytes" BIGINT;
ALTER TABLE "publishing_jobs" ADD COLUMN "thumbnail_status" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "publishing_jobs" ADD COLUMN "metadata" JSONB;

-- CreateIndex
CREATE INDEX "publishing_jobs_publishing_status_scheduled_at_idx" ON "publishing_jobs"("publishing_status", "scheduled_at");
