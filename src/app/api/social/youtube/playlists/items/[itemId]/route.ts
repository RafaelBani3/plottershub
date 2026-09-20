import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { playlistService } from "@/modules/playlist/playlist.service";

/**
 * PATCH /api/social/youtube/playlists/items/[itemId]
 * Body: { workspaceId, socialAccountId, playlistId, videoId, position }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const user = await requireAuth();
    const { itemId } = await params;
    const body = await req.json();

    const { workspaceId, socialAccountId, playlistId, videoId, position } = body;

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

    await requireWorkspacePermission(workspaceId, "content:edit");

    const item = await playlistService.reorderPlaylistItem(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      itemId,
      playlistId,
      videoId,
      { position }
    );

    return NextResponse.json({ item });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/social/youtube/playlists/items/[itemId]
 * Query/Body: workspaceId, socialAccountId
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const user = await requireAuth();
    const { itemId } = await params;

    let workspaceId = req.nextUrl.searchParams.get("workspaceId");
    let socialAccountId = req.nextUrl.searchParams.get("socialAccountId");

    if (!workspaceId || !socialAccountId) {
      try {
        const body = await req.json();
        workspaceId = workspaceId || body.workspaceId;
        socialAccountId = socialAccountId || body.socialAccountId;
      } catch {
        // no body
      }
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required parameter: 'workspaceId'" },
        { status: 400 }
      );
    }
    if (!socialAccountId) {
      return NextResponse.json(
        { error: "Missing required parameter: 'socialAccountId'" },
        { status: 400 }
      );
    }

    await requireWorkspacePermission(workspaceId, "content:edit");

    const result = await playlistService.removeVideoFromPlaylist(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      itemId
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
