import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { commentService } from "@/modules/comment/comment.service";

/**
 * GET /api/social/youtube/comments
 * Query: workspaceId, socialAccountId, videoId, pageToken?, order?
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const searchParams = req.nextUrl.searchParams;

    const workspaceId = searchParams.get("workspaceId");
    const socialAccountId = searchParams.get("socialAccountId");
    const videoId = searchParams.get("videoId");
    const pageToken = searchParams.get("pageToken") || undefined;
    const order = (searchParams.get("order") as "time" | "relevance") || "time";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'workspaceId'" },
        { status: 400 }
      );
    }
    if (!socialAccountId) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'socialAccountId'" },
        { status: 400 }
      );
    }
    if (!videoId) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'videoId'" },
        { status: 400 }
      );
    }

    await requireWorkspacePermission(workspaceId, "content:view");

    const result = await commentService.listCommentThreads(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      videoId,
      pageToken,
      order
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/social/youtube/comments
 * Body: { workspaceId, socialAccountId, videoId, text }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();

    const { workspaceId, socialAccountId, videoId, text } = body;

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
    if (!videoId) {
      return NextResponse.json(
        { error: "Missing required field: 'videoId'" },
        { status: 400 }
      );
    }

    await requireWorkspacePermission(workspaceId, "content:edit");

    const comment = await commentService.createComment(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      videoId,
      { text }
    );

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
