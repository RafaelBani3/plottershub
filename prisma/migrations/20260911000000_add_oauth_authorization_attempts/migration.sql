-- CreateTable
CREATE TABLE "oauth_authorization_attempts" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "code_verifier" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "oauth_authorization_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_authorization_attempts_nonce_key" ON "oauth_authorization_attempts"("nonce");

-- CreateIndex
CREATE INDEX "oauth_authorization_attempts_workspace_id_user_id_idx" ON "oauth_authorization_attempts"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "oauth_authorization_attempts_expires_at_idx" ON "oauth_authorization_attempts"("expires_at");

-- AddForeignKey
ALTER TABLE "oauth_authorization_attempts" ADD CONSTRAINT "oauth_authorization_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_attempts" ADD CONSTRAINT "oauth_authorization_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
