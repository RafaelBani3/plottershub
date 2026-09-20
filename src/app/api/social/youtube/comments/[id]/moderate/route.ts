import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { commentService } from "@/modules/comment/comment.service";

/**
 * POST /api/social/youtube/comments/[id]/moderate
 * Body: { workspaceId, socialAccountId, action: "PUBLISH" | "HOLD" | "REJECT", banAuthor? }
 * Permission: content:moderate
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await req.json();

    const { workspaceId, socialAccountId, action, banAuthor } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required field: 'workspaceId'" },
        { status: 400 }
      );
    }
    if (!socialAccountId) {
      return NextResponse.json(
        { error: "Missing required field: 'socialAccountId'" },
        { status: 400 }
      );
    }
    if (!action) {
      return NextResponse.json(
        { error: "Missing required field: 'action' ('PUBLISH', 'HOLD', or 'REJECT')" },
        { status: 400 }
      );
    }

    // RBAC: strictly requires content:moderate (OWNER and ADMIN only)
    await requireWorkspacePermission(workspaceId, "content:moderate");

    const result = await commentService.moderateComment(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      id,
      action,
      Boolean(banAuthor)
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
