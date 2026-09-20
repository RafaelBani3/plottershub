import { NextResponse } from "next/server";
import { getCurrentUser, handleApiError } from "@/lib/auth/guard";
import { getUserWorkspaces } from "@/modules/workspaces/workspace-service";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const workspaces = await getUserWorkspaces(user.id);

    return NextResponse.json({
      user,
      workspaces,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
