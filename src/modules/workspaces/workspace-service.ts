import { prisma } from "@/lib/db/prisma";
import { WorkspaceRole } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/modules/audit/audit-service";

export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
  ownerId: string;
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${base || "workspace"}-${randomSuffix}`;
}

/**
 * Creates a new workspace and assigns the owner as OWNER member.
 */
export async function createWorkspace(input: CreateWorkspaceInput) {
  const slug = input.slug || generateSlug(input.name);

  // Check if slug already exists
  const existing = await prisma.workspace.findUnique({ where: { slug } });
  const finalSlug = existing ? generateSlug(input.name) : slug;

  const workspace = await prisma.workspace.create({
    data: {
      name: input.name,
      slug: finalSlug,
      ownerId: input.ownerId,
      members: {
        create: {
          userId: input.ownerId,
          role: "OWNER",
        },
      },
    },
    include: {
      members: true,
    },
  });

  await logAuditEvent({
    workspaceId: workspace.id,
    userId: input.ownerId,
    action: "WORKSPACE_CREATED",
    resource: "workspace",
    resourceId: workspace.id,
    details: { name: workspace.name, slug: workspace.slug },
  });

  return workspace;
}

/**
 * Lists all workspaces that the user belongs to.
 */
export async function getUserWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          _count: {
            select: {
              members: true,
              socialAccounts: true,
              contents: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    ...m.workspace,
    currentUserRole: m.role as WorkspaceRole,
    memberCount: m.workspace._count.members,
    socialAccountCount: m.workspace._count.socialAccounts,
    contentCount: m.workspace._count.contents,
  }));
}

/**
 * Gets a workspace by ID with member check.
 */
export async function getWorkspaceById(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      workspace: {
        include: {
          members: {
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
            orderBy: { createdAt: "asc" },
          },
          socialAccounts: {
            include: {
              platform: true,
            },
          },
        },
      },
    },
  });

  if (!membership) return null;

  return {
    ...membership.workspace,
    currentUserRole: membership.role as WorkspaceRole,
  };
}

/**
 * Adds or invites a member to a workspace.
 */
export async function addWorkspaceMember(
  workspaceId: string,
  targetEmail: string,
  role: WorkspaceRole,
  actorUserId: string
) {
  const targetUser = await prisma.user.findUnique({
    where: { email: targetEmail.toLowerCase().trim() },
  });

  if (!targetUser) {
    throw new Error(`User with email '${targetEmail}' was not found. They must register first.`);
  }

  // Check existing membership
  const existing = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: targetUser.id,
      },
    },
  });

  if (existing) {
    throw new Error("This user is already a member of this workspace.");
  }

  const member = await prisma.workspaceMember.create({
    data: {
      workspaceId,
      userId: targetUser.id,
      role: role as any,
    },
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
  });

  await logAuditEvent({
    workspaceId,
    userId: actorUserId,
    action: "MEMBER_INVITED",
    resource: "workspace_member",
    resourceId: member.id,
    details: { memberEmail: targetUser.email, role },
  });

  return member;
}

/**
 * Updates a member's role.
 */
export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberId: string,
  newRole: WorkspaceRole,
  actorUserId: string
) {
  const member = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    include: { user: true },
  });

  if (!member || member.workspaceId !== workspaceId) {
    throw new Error("Workspace member not found.");
  }

  // Prevent changing the workspace owner's role through this method
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (workspace?.ownerId === member.userId && newRole !== "OWNER") {
    throw new Error("Cannot downgrade the primary workspace owner's role.");
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { role: newRole as any },
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
  });

  await logAuditEvent({
    workspaceId,
    userId: actorUserId,
    action: "MEMBER_ROLE_UPDATED",
    resource: "workspace_member",
    resourceId: member.id,
    details: { memberEmail: member.user.email, oldRole: member.role, newRole },
  });

  return updated;
}

/**
 * Removes a member from a workspace.
 */
export async function removeWorkspaceMember(
  workspaceId: string,
  memberId: string,
  actorUserId: string
) {
  const member = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    include: { user: true },
  });

  if (!member || member.workspaceId !== workspaceId) {
    throw new Error("Workspace member not found.");
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (workspace?.ownerId === member.userId) {
    throw new Error("Cannot remove the primary workspace owner.");
  }

  await prisma.workspaceMember.delete({ where: { id: memberId } });

  await logAuditEvent({
    workspaceId,
    userId: actorUserId,
    action: "MEMBER_REMOVED",
    resource: "workspace_member",
    resourceId: memberId,
    details: { memberEmail: member.user.email, role: member.role },
  });
}
