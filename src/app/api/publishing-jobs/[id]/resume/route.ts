import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { publishingService } from "@/modules/publishing/publishing.service";

/**
 * POST /api/publishing-jobs/[id]/resume
 *
 * Resumes an interrupted or retryable failed publishing job.
 * Enforces workspace membership and content:publish permission.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id: jobId } = await params;

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty if workspaceId is passed as search param
    }

    const searchParams = req.nextUrl.searchParams;
    const workspaceId =
      (typeof body?.workspaceId === "string" ? body.workspaceId : null) ||
      searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required parameter: 'workspaceId'" },
        { status: 400 }
      );
    }

    // RBAC: Verify actor has 'content:publish' in workspace
    await requireWorkspacePermission(workspaceId, "content:publish");

    const job = await publishingService.resumePublishingJob(jobId, user.id, workspaceId);

    return NextResponse.json({ job });
  } catch (error) {
    return handleApiError(error);
  }
}
