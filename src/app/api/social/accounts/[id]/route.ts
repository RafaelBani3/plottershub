import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { socialAccountService } from "@/modules/social/account-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'workspaceId'" },
        { status: 400 }
      );
    }

    await requireWorkspacePermission(workspaceId, "social_accounts:view");

    const account = await socialAccountService.getAccountById(id, workspaceId);

    return NextResponse.json({ account });
  } catch (error) {
    return handleApiError(error);
  }
}
