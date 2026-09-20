import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { publishingService } from "@/modules/publishing/publishing.service";

/**
 * GET /api/publishing-jobs/[id]
 *
 * Polls or inspects status, progress, bytes uploaded, and failure diagnostics of a publishing job.
 * Enforces workspace membership and content:view permission.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id: jobId } = await params;
    const searchParams = req.nextUrl.searchParams;

    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'workspaceId'" },
        { status: 400 }
      );
    }

    // RBAC: Verify actor has 'content:view' in workspace
    await requireWorkspacePermission(workspaceId, "content:view");

    const job = await publishingService.getPublishingJob(jobId, user.id, workspaceId);

    return NextResponse.json({ job });
  } catch (error) {
    return handleApiError(error);
  }
}
