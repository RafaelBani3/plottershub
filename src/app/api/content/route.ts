import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { contentService } from "@/modules/content/content.service";
import {
  ListContentQuery,
  ContentFilterType,
  ContentFilterStatus,
  ContentFilterPrivacy,
} from "@/modules/content/content.types";

/**
 * GET /api/content
 *
 * Lists content items for a workspace with multi-filtering, sorting, and bounded pagination.
 * Zero YouTube Data API quota consumed (sync-backed database query).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const searchParams = req.nextUrl.searchParams;

    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'workspaceId'" },
        { status: 400 }
      );
    }

    // Verify user has 'content:view' in the workspace
    await requireWorkspacePermission(workspaceId, "content:view");

    // Parse query options
    const socialAccountId = searchParams.get("socialAccountId") || undefined;
    const contentType = (searchParams.get("contentType") as ContentFilterType) || "ALL";
    const status = (searchParams.get("status") as ContentFilterStatus) || "ALL";
    const privacy = (searchParams.get("privacy") as ContentFilterPrivacy) || "ALL";
    const search = searchParams.get("search") || undefined;
    const sortBy = (searchParams.get("sortBy") as ListContentQuery["sortBy"]) || "publishedAt";
    const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "desc";

    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const offsetParam = parseInt(searchParams.get("offset") || "0", 10);

    const limit = Math.min(100, Math.max(1, isNaN(limitParam) ? 20 : limitParam));
    const offset = Math.max(0, isNaN(offsetParam) ? 0 : offsetParam);

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (searchParams.get("startDate")) {
      const parsed = new Date(searchParams.get("startDate")!);
      if (!isNaN(parsed.getTime())) startDate = parsed;
    }

    if (searchParams.get("endDate")) {
      const parsed = new Date(searchParams.get("endDate")!);
      if (!isNaN(parsed.getTime())) endDate = parsed;
    }

    const result = await contentService.listContent(
      { actorUserId: user.id, workspaceId },
      {
        socialAccountId,
        contentType,
        status,
        privacy,
        search,
        startDate,
        endDate,
        sortBy,
        sortOrder,
        limit,
        offset,
      }
    );

    const includeSummary = searchParams.get("includeSummary") === "true";
    let summary = undefined;
    if (includeSummary) {
      summary = await contentService.getSummaryMetrics(
        { actorUserId: user.id, workspaceId },
        socialAccountId
      );
    }

    return NextResponse.json({
      items: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore,
      summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
