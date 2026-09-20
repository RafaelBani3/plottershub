import { getSessionCookie } from "./session-cookie";
import { validateSession, SessionWithUser } from "@/modules/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  WorkspaceRole,
  Permission,
  hasPermission,
  isAtLeastRole,
} from "./rbac";
import { NextResponse } from "next/server";

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

/**
 * Gets the current authenticated user from request session cookie.
 */
export async function getCurrentUser(): Promise<SessionWithUser["user"] | null> {
  const token = await getSessionCookie();
  if (!token) return null;

  const result = await validateSession(token);
  return result?.user ?? null;
}

/**
 * Ensures request has an active authenticated session.
 * Throws AuthError(401) if unauthenticated.
 */
export async function requireAuth(): Promise<SessionWithUser["user"]> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Authentication required. Please sign in.", 401);
  }
  return user;
}

export interface WorkspaceAuthContext {
  user: SessionWithUser["user"];
  workspaceId: string;
  memberId: string;
  role: WorkspaceRole;
}

/**
 * Ensures user is authenticated and is a member of the workspace with at least `minRole`.
 */
export async function requireWorkspaceMember(
  workspaceId: string,
  minRole?: WorkspaceRole
): Promise<WorkspaceAuthContext> {
  const user = await requireAuth();

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
  });

  if (!membership) {
    throw new AuthError("You do not have access to this workspace.", 403);
  }

  const role = membership.role as WorkspaceRole;

  if (minRole && !isAtLeastRole(role, minRole)) {
    throw new AuthError(
      `Insufficient permissions. Requires minimum role: ${minRole}`,
      403
    );
  }

  return {
    user,
    workspaceId,
    memberId: membership.id,
    role,
  };
}

/**
 * Ensures user is authenticated and has the required permission in the target workspace.
 */
export async function requireWorkspacePermission(
  workspaceId: string,
  permission: Permission
): Promise<WorkspaceAuthContext> {
  const user = await requireAuth();

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
  });

  if (!membership) {
    throw new AuthError("You do not have access to this workspace.", 403);
  }

  const role = membership.role as WorkspaceRole;

  if (!hasPermission(role, permission)) {
    throw new AuthError(
      `Permission denied. Missing required permission: '${permission}'`,
      403
    );
  }

  return {
    user,
    workspaceId,
    memberId: membership.id,
    role,
  };
}

import { SocialError } from "@/modules/social/errors";

/**
 * Helper to wrap route handlers with standard error catching and JSON responses.
 */
export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }

  if (error instanceof SocialError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        provider: error.provider,
        userActionRequired: error.userActionRequired,
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: "An unexpected error occurred." },
    { status: 500 }
  );
}

