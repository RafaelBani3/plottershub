-- AlterTable
ALTER TABLE "content_platforms" ADD COLUMN "metadata" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "content_platforms_social_account_id_external_content_id_key" ON "content_platforms"("social_account_id", "external_content_id");
