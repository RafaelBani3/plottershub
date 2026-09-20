import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceMember, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { getWorkspaceById } from "@/modules/workspaces/workspace-service";
import { prisma } from "@/lib/db/prisma";
import { logAuditEvent } from "@/modules/audit/audit-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireWorkspaceMember(id);
    const workspace = await getWorkspaceById(id, auth.user.id);

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json({ workspace });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireWorkspacePermission(id, "workspace:manage");
    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const updated = await prisma.workspace.update({
      where: { id },
      data: { name: name.trim() },
    });

    await logAuditEvent({
      workspaceId: id,
      userId: auth.user.id,
      action: "WORKSPACE_UPDATED",
      resource: "workspace",
      resourceId: id,
      details: { newName: updated.name },
    });

    return NextResponse.json({ workspace: updated, message: "Workspace updated" });
  } catch (error) {
    return handleApiError(error);
  }
}
