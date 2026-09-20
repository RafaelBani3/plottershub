import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { publishingIntelligenceService } from "@/modules/analytics/publishing-intelligence/publishing-intelligence.service";
import { isValidIanaTimezone } from "@/modules/analytics/publishing-intelligence/publishing-intelligence.time";
import { PublishingIntelligenceFormat } from "@/modules/analytics/publishing-intelligence/publishing-intelligence.types";

/**
 * GET /api/analytics/publishing-intelligence
 *
 * Publishing Intelligence Analysis Endpoint.
 *
 * Parameters:
 * - socialAccountId (required): string
 * - format (optional): "LONG_FORM" | "SHORTS" (default: "LONG_FORM")
 * - lookbackDays (optional): number (30, 60, 90, 180, default: 90)
 * - publishingTimezone (optional): string (valid IANA timezone)
 *
 * Security:
 * - Authenticates user session
 * - Server-side resolves workspace from socialAccountId (never trusts client workspaceId)
 * - Enforces workspace RBAC ('analytics:view' permission)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const socialAccountId = searchParams.get("socialAccountId");

    if (!socialAccountId || socialAccountId.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'socialAccountId'" },
        { status: 400 }
      );
    }

    // 1. Resolve Account & Workspace server-side
    const account = await prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { id: true, workspaceId: true },
    });

    if (!account) {
      return NextResponse.json(
        { error: `Social account '${socialAccountId}' not found.` },
        { status: 404 }
      );
    }

    // 2. Enforce RBAC permission in the account's resolved workspace
    await requireWorkspacePermission(account.workspaceId, "analytics:view");

    // 3. Validate Format parameter
    const rawFormat = searchParams.get("format") || "LONG_FORM";
    if (rawFormat !== "LONG_FORM" && rawFormat !== "SHORTS") {
      return NextResponse.json(
        { error: "Invalid 'format' parameter. Supported values: 'LONG_FORM', 'SHORTS'." },
        { status: 400 }
      );
    }
    const format = rawFormat as PublishingIntelligenceFormat;

    // 4. Validate Lookback Days
    let lookbackDays = 90;
    const rawLookback = searchParams.get("lookbackDays");
    if (rawLookback) {
      const parsed = parseInt(rawLookback, 10);
      if (isNaN(parsed) || parsed < 7 || parsed > 365) {
        return NextResponse.json(
          { error: "Invalid 'lookbackDays' parameter. Must be an integer between 7 and 365." },
          { status: 400 }
        );
      }
      lookbackDays = parsed;
    }

    // 5. Validate Timezone
    const rawTimezone =
      searchParams.get("publishingTimezone") || searchParams.get("timezone");
    if (rawTimezone && !isValidIanaTimezone(rawTimezone)) {
      return NextResponse.json(
        { error: `Invalid IANA timezone identifier: '${rawTimezone}'.` },
        { status: 400 }
      );
    }

    // 6. Execute Calculation
    const result = await publishingIntelligenceService.getPublishingIntelligence(
      account.workspaceId,
      {
        socialAccountId: account.id,
        format,
        lookbackDays,
        publishingTimezone: rawTimezone || undefined,
      }
    );

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
