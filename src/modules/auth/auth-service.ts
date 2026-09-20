import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/crypto/password";
import { createSession } from "./session";
import { createWorkspace } from "@/modules/workspaces/workspace-service";
import { logAuditEvent } from "@/modules/audit/audit-service";

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Registers a new user, creates their primary workspace, and issues an active session.
 */
export async function registerUser(input: RegisterInput) {
  const email = input.email.toLowerCase().trim();

  if (!email || !input.password) {
    throw new Error("Email and password are required.");
  }

  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    throw new Error("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name?.trim() || null,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
    },
  });

  // Automatically provision default workspace
  const workspaceName = user.name ? `${user.name}'s Workspace` : "My Workspace";
  const defaultWorkspace = await createWorkspace({
    name: workspaceName,
    ownerId: user.id,
  });

  // Issue session
  const { token, expiresAt } = await createSession(user.id);

  return {
    user,
    defaultWorkspace,
    session: { token, expiresAt },
  };
}

/**
 * Authenticates user credentials and issues a new active session.
 */
export async function loginUser(input: LoginInput) {
  const email = input.email.toLowerCase().trim();

  if (!email || !input.password) {
    throw new Error("Email and password are required.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        include: {
          workspace: true,
        },
        take: 1,
      },
    },
  });

  if (!user || !user.passwordHash) {
    throw new Error("Invalid email or password.");
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password.");
  }

  // Issue session
  const { token, expiresAt } = await createSession(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
    session: { token, expiresAt },
  };
}

/**
 * Changes a user's password and invalidates existing sessions.
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  workspaceId?: string
) {
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters long.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    throw new Error("User not found.");
  }

  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new Error("Current password is incorrect.");
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  if (workspaceId) {
    await logAuditEvent({
      workspaceId,
      userId,
      action: "SECURITY_PASSWORD_CHANGED",
      resource: "user",
      resourceId: userId,
    });
  }

  // Issue a fresh session
  return createSession(userId);
}
