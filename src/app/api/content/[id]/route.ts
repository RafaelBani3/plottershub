import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { contentService } from "@/modules/content/content.service";

/**
 * GET /api/content/[id]
 *
 * Retrieves a single content item with its YouTube platform metadata and latest metrics.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;

    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'workspaceId'" },
        { status: 400 }
      );
    }

    // Verify user has 'content:view' in the workspace
    await requireWorkspacePermission(workspaceId, "content:view");

    const item = await contentService.getContentById(
      { actorUserId: user.id, workspaceId },
      id
    );

    return NextResponse.json({ item });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/content/[id]
 *
 * Updates video metadata, privacy status, scheduling, or child-directed settings on YouTube.
 * Enforces RBAC 'content:edit' and executes safe Read-Modify-Write merge.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspaceId") || body?.workspaceId;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required parameter: 'workspaceId'" },
        { status: 400 }
      );
    }

    // Verify user has 'content:edit' in the workspace
    await requireWorkspacePermission(workspaceId, "content:edit");

    // Execute safe update
    const updatedItem = await contentService.updateContent(
      { actorUserId: user.id, workspaceId },
      id,
      body
    );

    return NextResponse.json({ item: updatedItem });
  } catch (error) {
    return handleApiError(error);
  }
}
