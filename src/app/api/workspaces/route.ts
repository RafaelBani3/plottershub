import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/auth/guard";
import {
  getUserWorkspaces,
  createWorkspace,
} from "@/modules/workspaces/workspace-service";

export async function GET() {
  try {
    const user = await requireAuth();
    const workspaces = await getUserWorkspaces(user.id);
    return NextResponse.json({ workspaces });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { name, slug } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Workspace name is required." },
        { status: 400 }
      );
    }

    const workspace = await createWorkspace({
      name,
      slug,
      ownerId: user.id,
    });

    return NextResponse.json({ workspace, message: "Workspace created successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
