import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { youtubeDashboardService } from "@/modules/social/analytics/dashboard.service";

/**
 * GET /api/social/youtube/analytics/trends
 * Daily time-series trends for performance charts (max 90 days).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'workspaceId'" },
        { status: 400 }
      );
    }

    await requireWorkspacePermission(workspaceId, "analytics:view");

    const socialAccountId = searchParams.get("socialAccountId") ?? undefined;
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;
    const metrics = searchParams.get("metrics") ?? undefined;

    const result = await youtubeDashboardService.getTrends({
      workspaceId,
      socialAccountId,
      startDate,
      endDate,
      metrics,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-cache" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
