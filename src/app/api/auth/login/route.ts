import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/modules/auth/auth-service";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { handleApiError } from "@/lib/auth/guard";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    const result = await loginUser({ email, password });
    await setSessionCookie(result.session.token, result.session.expiresAt);

    return NextResponse.json({
      user: result.user,
      message: "Login successful",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
