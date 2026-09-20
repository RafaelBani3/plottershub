import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { publishingService } from "@/modules/publishing/publishing.service";

/**
 * POST /api/content/[id]/thumbnail
 *
 * Sets or updates a custom thumbnail for an existing published YouTube video.
 * Enforces workspace membership and content:publish RBAC.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id: contentId } = await params;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required parameter: 'workspaceId'" },
        { status: 400 }
      );
    }

    const socialAccountId = typeof body.socialAccountId === "string" ? body.socialAccountId : null;
    if (!socialAccountId) {
      return NextResponse.json(
        { error: "Missing required parameter: 'socialAccountId'" },
        { status: 400 }
      );
    }

    const thumbnailStorageKey = typeof body.thumbnailStorageKey === "string" ? body.thumbnailStorageKey : null;
    if (!thumbnailStorageKey) {
      return NextResponse.json(
        { error: "Missing required parameter: 'thumbnailStorageKey'" },
        { status: 400 }
      );
    }

    // RBAC: Verify actor has 'content:publish' in workspace
    await requireWorkspacePermission(workspaceId, "content:publish");

    await publishingService.uploadCustomThumbnail(
      contentId,
      socialAccountId,
      thumbnailStorageKey,
      user.id,
      workspaceId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
