import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { SocialProviderRegistry } from "@/modules/social/registry";
import { createOAuthState, generatePKCE } from "@/modules/social/oauth-state";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { DEFAULT_YOUTUBE_SCOPES, YOUTUBE_WRITE_SCOPES } from "@/modules/social/providers/youtube/youtube.oauth";

/**
 * Initiates the Google / YouTube OAuth 2.0 browser flow (GET /api/social/youtube/connect).
 * Query parameter: ?workspaceId=...&mode=...
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'workspaceId'" },
        { status: 400 }
      );
    }

    const { user } = await requireWorkspacePermission(workspaceId, "social_accounts:connect");

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const { codeVerifier, codeChallenge } = generatePKCE();

    // 1. Create and persist single-use OAuth authorization attempt
    const state = await createOAuthState({
      userId: user.id,
      workspaceId,
      provider: "YOUTUBE",
      codeVerifier,
    });

    const redirectUri = `${origin}/api/social/callback/youtube`;
    const mode = searchParams.get("mode");
    const scopes = mode === "readonly" ? DEFAULT_YOUTUBE_SCOPES : YOUTUBE_WRITE_SCOPES;

    // 2. Build Google authorization URL
    const authorizationUrl = await provider.getAuthorizationUrl({
      state,
      redirectUri,
      codeChallenge,
      scopes,
    });

    // 3. Log audit event
    await logAuditEvent({
      workspaceId,
      userId: user.id,
      action: "ACCOUNT_CONNECTION_STARTED",
      resource: "social_account",
      details: {
        platform: "YOUTUBE",
        redirectUri,
      },
    });

    // 4. Redirect browser to Google OAuth consent screen
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    return handleApiError(error);
  }
}
