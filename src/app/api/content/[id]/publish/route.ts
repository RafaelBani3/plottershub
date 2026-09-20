import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { publishingService } from "@/modules/publishing/publishing.service";
import { PublishVideoInput } from "@/modules/publishing/publishing.types";

/**
 * POST /api/content/[id]/publish
 *
 * Initiates an end-to-end publishing job for a video content item to YouTube.
 * Enforces 6/7-stage authorization, workspace RBAC (content:publish), OAuth scope,
 * and launches chunked resumable upload with atomic distributed locking.
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

    const videoStorageKey = typeof body.videoStorageKey === "string" ? body.videoStorageKey : null;
    if (!videoStorageKey) {
      return NextResponse.json(
        { error: "Missing required parameter: 'videoStorageKey'" },
        { status: 400 }
      );
    }

    // RBAC: Verify actor has 'content:publish' in workspace
    await requireWorkspacePermission(workspaceId, "content:publish");

    const input: PublishVideoInput = {
      workspaceId,
      contentId,
      socialAccountId,
      videoStorageKey,
      title: typeof body.title === "string" ? body.title : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      privacyStatus: typeof body.privacyStatus === "string" ? (body.privacyStatus as "public" | "private" | "unlisted") : undefined,
      publishAt: typeof body.publishAt === "string" ? body.publishAt : undefined,
      publishingTimezone: typeof body.publishingTimezone === "string" ? body.publishingTimezone : undefined,
      madeForKids: typeof body.madeForKids === "boolean" ? body.madeForKids : undefined,
      thumbnailStorageKey: typeof body.thumbnailStorageKey === "string" ? body.thumbnailStorageKey : undefined,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    };

    const job = await publishingService.createAndStartPublishingJob(input, user.id);

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
