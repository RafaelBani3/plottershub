import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import {
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
} from "@/modules/workspaces/workspace-service";
import { WorkspaceRole } from "@/lib/auth/rbac";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id, memberId } = await params;
    const auth = await requireWorkspacePermission(id, "members:manage");
    const body = await req.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json({ error: "Role is required" }, { status: 400 });
    }

    const updated = await updateWorkspaceMemberRole(
      id,
      memberId,
      role as WorkspaceRole,
      auth.user.id
    );

    return NextResponse.json({ member: updated, message: "Role updated" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id, memberId } = await params;
    const auth = await requireWorkspacePermission(id, "members:manage");

    await removeWorkspaceMember(id, memberId, auth.user.id);

    return NextResponse.json({ message: "Member removed from workspace" });
  } catch (error) {
    return handleApiError(error);
  }
}
