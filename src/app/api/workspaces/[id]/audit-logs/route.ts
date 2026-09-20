import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { getWorkspaceAuditLogs } from "@/modules/audit/audit-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireWorkspacePermission(id, "audit_logs:view");

    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

    const result = await getWorkspaceAuditLogs(id, { limit, offset });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
