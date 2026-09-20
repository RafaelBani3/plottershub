import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { socialAccountService } from "@/modules/social/account-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, workspaceId } = body as {
      accountId?: string;
      workspaceId?: string;
    };

    if (!accountId || !workspaceId) {
      return NextResponse.json(
        { error: "Missing required fields: accountId, workspaceId" },
        { status: 400 }
      );
    }

    const { user } = await requireWorkspacePermission(workspaceId, "social_accounts:manage");

    await socialAccountService.disconnectAccount({
      accountId,
      workspaceId,
      actorUserId: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
