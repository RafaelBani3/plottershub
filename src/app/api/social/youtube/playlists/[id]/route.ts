import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { playlistService } from "@/modules/playlist/playlist.service";

/**
 * PATCH /api/social/youtube/playlists/[id]
 * Body: { workspaceId, socialAccountId, title?, description?, privacyStatus? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await req.json();

    const { workspaceId, socialAccountId, title, description, privacyStatus } = body;

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

    const playlist = await playlistService.updatePlaylist(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      id,
      { title, description, privacyStatus }
    );

    return NextResponse.json({ playlist });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/social/youtube/playlists/[id]
 * Query/Body: workspaceId, socialAccountId
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

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

    const result = await playlistService.deletePlaylist(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      id
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
