import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export type AuditAction =
  | "ACCOUNT_CONNECTION_STARTED"
  | "ACCOUNT_CONNECTED"
  | "ACCOUNT_CONNECTION_FAILED"
  | "ACCOUNT_DISCONNECTED"
  | "SYNC_STARTED"
  | "SYNC_COMPLETED"
  | "SYNC_FAILED"
  | "TOKEN_REFRESHED"
  | "TOKEN_REFRESH_FAILED"
  | "SOCIAL_REAUTH_REQUIRED"
  | "CONTENT_CREATED"
  | "CONTENT_UPDATED"
  | "CONTENT_UPDATE_REQUESTED"
  | "CONTENT_UPDATE_SUCCEEDED"
  | "CONTENT_UPDATE_FAILED"
  | "CONTENT_PRIVACY_CHANGED"
  | "CONTENT_SCHEDULE_CHANGED"
  | "CONTENT_UPDATE_RECONCILIATION_REQUIRED"
  | "CONTENT_PUBLISHED"
  | "CONTENT_PUBLISH_FAILED"
  | "CONTENT_DELETED"
  | "MEMBER_INVITED"
  | "MEMBER_REMOVED"
  | "MEMBER_ROLE_UPDATED"
  | "WORKSPACE_CREATED"
  | "WORKSPACE_UPDATED"
  | "REPORT_GENERATED"
  | "SECURITY_PASSWORD_CHANGED"
  | "ANALYTICS_SYNC_STARTED"
  | "ANALYTICS_SYNC_COMPLETED"
  | "ANALYTICS_SYNC_FAILED"
  | "ANALYTICS_SYNC_LOCKED"
  | "ANALYTICS_SYNC_REAUTH_REQUIRED"
  | "ANALYTICS_QUOTA_EXHAUSTED"
  | "PLAYLIST_CREATED"
  | "PLAYLIST_UPDATED"
  | "PLAYLIST_DELETED"
  | "PLAYLIST_ITEM_ADDED"
  | "PLAYLIST_ITEM_REMOVED"
  | "PLAYLIST_ITEM_REORDERED"
  | "COMMENT_CREATED"
  | "COMMENT_REPLIED"
  | "COMMENT_UPDATED"
  | "COMMENT_DELETED"
  | "COMMENT_MODERATION_CHANGED"
  // Phase 3.4F Publishing Audit Actions
  | "VIDEO_UPLOAD_REQUESTED"
  | "VIDEO_UPLOAD_STARTED"
  | "VIDEO_UPLOAD_COMPLETED"
  | "VIDEO_UPLOAD_FAILED"
  | "PUBLISH_SCHEDULED"
  | "THUMBNAIL_UPDATED"
  | "THUMBNAIL_FAILED"
  | "PUBLISHING_RECONCILED"
  | "PUBLISHING_CANCELLED"
  | "PUBLISHING_RESUMED";

export interface LogAuditParams {
  workspaceId: string;
  userId?: string | null;
  action: AuditAction;
  resource: string;
  resourceId?: string | null;
  details?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Logs an auditable workspace event.
 * Ensures credentials/tokens are never stored.
 */
export async function logAuditEvent(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        details: params.details ?? undefined,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (error) {
    // Audit logging should not crash the main application workflow, but log error
    console.error("[AuditService] Failed to record audit event:", error);
  }
}

/**
 * Fetches paginated audit logs for a workspace.
 */
export async function getWorkspaceAuditLogs(
  workspaceId: string,
  options: { limit?: number; offset?: number } = {}
) {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
          },
        },
      },
    }),
    prisma.auditLog.count({
      where: { workspaceId },
    }),
  ]);

  return { logs, total, limit, offset };
}
