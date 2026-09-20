import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { playlistService } from "@/modules/playlist/playlist.service";

/**
 * GET /api/social/youtube/playlists/[id]/items
 * Query: workspaceId, socialAccountId, pageToken?
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
    const socialAccountId = searchParams.get("socialAccountId");
    const pageToken = searchParams.get("pageToken") || undefined;

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

    await requireWorkspacePermission(workspaceId, "content:view");

    const result = await playlistService.getPlaylistItems(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      id,
      pageToken
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/social/youtube/playlists/[id]/items
 * Body: { workspaceId, socialAccountId, videoId, position? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await req.json();

    const { workspaceId, socialAccountId, videoId, position } = body;

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

    const item = await playlistService.addVideoToPlaylist(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      id,
      { videoId, position }
    );

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
