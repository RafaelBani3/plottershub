import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { addWorkspaceMember } from "@/modules/workspaces/workspace-service";
import { prisma } from "@/lib/db/prisma";
import { WorkspaceRole } from "@/lib/auth/rbac";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireWorkspacePermission(id, "members:manage");

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: id },
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
    });

    return NextResponse.json({ members });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireWorkspacePermission(id, "members:invite");
    const body = await req.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json(
        { error: "Email and role are required." },
        { status: 400 }
      );
    }

    const member = await addWorkspaceMember(
      id,
      email,
      role as WorkspaceRole,
      auth.user.id
    );

    return NextResponse.json({ member, message: "Member added successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
