import { NextResponse } from "next/server";
import { getSessionCookie, clearSessionCookie } from "@/lib/auth/session-cookie";
import { invalidateSession } from "@/modules/auth/session";

export async function POST() {
  try {
    const token = await getSessionCookie();
    if (token) {
      await invalidateSession(token);
    }
    await clearSessionCookie();

    return NextResponse.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("[Auth API] Logout error:", error);
    await clearSessionCookie();
    return NextResponse.json({ message: "Logged out" });
  }
}
