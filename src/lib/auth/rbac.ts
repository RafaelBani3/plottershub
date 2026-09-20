export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "ANALYST" | "VIEWER";

export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  EDITOR: 60,
  ANALYST: 40,
  VIEWER: 20,
};

export type Permission =
  | "workspace:manage"
  | "workspace:delete"
  | "members:manage"
  | "members:invite"
  | "social_accounts:manage"
  | "social_accounts:connect"
  | "social_accounts:view"
  | "content:view"
  | "content:create"
  | "content:edit"
  | "content:delete"
  | "content:publish"
  | "content:moderate"
  | "analytics:view"
  | "reports:generate"
  | "audit_logs:view";

export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  OWNER: [
    "workspace:manage",
    "workspace:delete",
    "members:manage",
    "members:invite",
    "social_accounts:manage",
    "social_accounts:connect",
    "social_accounts:view",
    "content:view",
    "content:create",
    "content:edit",
    "content:delete",
    "content:publish",
    "content:moderate",
    "analytics:view",
    "reports:generate",
    "audit_logs:view",
  ],
  ADMIN: [
    "workspace:manage",
    "members:manage",
    "members:invite",
    "social_accounts:manage",
    "social_accounts:connect",
    "social_accounts:view",
    "content:view",
    "content:create",
    "content:edit",
    "content:delete",
    "content:publish",
    "content:moderate",
    "analytics:view",
    "reports:generate",
    "audit_logs:view",
  ],
  EDITOR: [
    "social_accounts:view",
    "content:view",
    "content:create",
    "content:edit",
    "content:delete",
    "content:publish",
    "analytics:view",
    "reports:generate",
  ],
  ANALYST: [
    "social_accounts:view",
    "content:view",
    "analytics:view",
    "reports:generate",
  ],
  VIEWER: [
    "social_accounts:view",
    "content:view",
    "analytics:view",
  ],
};

/**
 * Checks if a given role has a specific permission.
 */
export function hasPermission(
  role: WorkspaceRole | string,
  permission: Permission
): boolean {
  const perms = ROLE_PERMISSIONS[role as WorkspaceRole];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Checks if a user's role meets or exceeds a target minimum role.
 */
export function isAtLeastRole(
  userRole: WorkspaceRole | string,
  requiredRole: WorkspaceRole
): boolean {
  const userRank = ROLE_HIERARCHY[userRole as WorkspaceRole] ?? 0;
  const targetRank = ROLE_HIERARCHY[requiredRole] ?? 0;
  return userRank >= targetRank;
}
