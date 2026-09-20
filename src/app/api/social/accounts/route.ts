import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { socialAccountService } from "@/modules/social/account-service";

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

    await requireWorkspacePermission(workspaceId, "social_accounts:view");

    const accounts = await socialAccountService.getWorkspaceAccounts(workspaceId);

    return NextResponse.json({ accounts });
  } catch (error) {
    return handleApiError(error);
  }
}
