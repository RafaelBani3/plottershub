import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/modules/auth/auth-service";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { handleApiError } from "@/lib/auth/guard";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    const result = await registerUser({ email, password, name });
    await setSessionCookie(result.session.token, result.session.expiresAt);

    return NextResponse.json({
      user: result.user,
      defaultWorkspace: result.defaultWorkspace,
      message: "Registration successful",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
