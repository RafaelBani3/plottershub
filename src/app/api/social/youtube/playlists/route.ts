import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { playlistService } from "@/modules/playlist/playlist.service";

/**
 * GET /api/social/youtube/playlists
 * Query: workspaceId, socialAccountId, pageToken?
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
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

    const result = await playlistService.listPlaylists(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      pageToken
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/social/youtube/playlists
 * Body: { workspaceId, socialAccountId, title, description?, privacyStatus? }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
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

    const playlist = await playlistService.createPlaylist(
      { actorUserId: user.id, workspaceId },
      socialAccountId,
      { title, description, privacyStatus }
    );

    return NextResponse.json({ playlist }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
