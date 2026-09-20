import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/auth/guard";
import { changeUserPassword } from "@/modules/auth/auth-service";
import { setSessionCookie } from "@/lib/auth/session-cookie";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { currentPassword, newPassword, workspaceId } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current and new password are required." },
        { status: 400 }
      );
    }

    const { token, expiresAt } = await changeUserPassword(
      user.id,
      currentPassword,
      newPassword,
      workspaceId
    );

    // Refresh session cookie
    await setSessionCookie(token, expiresAt);

    return NextResponse.json({ message: "Password changed successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
