import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission } from "@/lib/auth/guard";
import { SocialProviderRegistry } from "@/modules/social/registry";
import { verifyAndConsumeOAuthState } from "@/modules/social/oauth-state";
import { socialAccountService } from "@/modules/social/account-service";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { SocialError } from "@/modules/social/errors";

/**
 * YouTube-specific Browser OAuth Redirect Handler (GET /api/social/callback/youtube).
 * Invoked by Google OAuth 2.0 authorization server upon creator consent or rejection.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");
  const providerErrorDescription = searchParams.get("error_description");

  const redirectUri = `${origin}/api/social/callback/youtube`;

  // 1. Handle user cancellation or provider rejection
  if (providerError) {
    const errorDetail = providerErrorDescription || providerError;
    return NextResponse.redirect(
      new URL(`/social-accounts?error=${encodeURIComponent(`Google OAuth denied: ${errorDetail}`)}`, origin)
    );
  }

  // 2. Validate essential OAuth parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/social-accounts?error=Missing+required+OAuth+parameters+(code+or+state)", origin)
    );
  }

  let workspaceIdForAudit: string | null = null;
  let userIdForAudit: string | null = null;

  try {
    // 3. Atomically verify and consume OAuth state (replay prevention & PKCE verifier lookup)
    const statePayload = await verifyAndConsumeOAuthState(state);
    workspaceIdForAudit = statePayload.workspaceId;
    userIdForAudit = statePayload.userId;

    if (statePayload.provider !== "YOUTUBE") {
      throw new SocialError(
        "OAuth state provider mismatch. Expected YOUTUBE authorization flow.",
        "SOCIAL_INVALID_REQUEST"
      );
    }

    // 4. Validate user session & workspace permission
    const { user } = await requireWorkspacePermission(
      statePayload.workspaceId,
      "social_accounts:connect"
    );

    if (user.id !== statePayload.userId) {
      throw new SocialError(
        "User session mismatch during OAuth callback.",
        "SOCIAL_AUTH_REQUIRED"
      );
    }

    // 5. Retrieve YouTube provider adapter
    const provider = SocialProviderRegistry.getProvider("YOUTUBE");

    // 6. Exchange authorization code for encrypted TokenBundle (server-side)
    const tokenBundle = await provider.exchangeAuthorizationCode({
      code,
      redirectUri,
      codeVerifier: statePayload.codeVerifier,
    });

    // 7. Query YouTube Data API (channels.list?mine=true) to obtain canonical channel identity
    const profile = await provider.getAccountProfile(tokenBundle.accessToken);

    // 8. Connect and persist credentials securely via SocialTokenManager
    await socialAccountService.connectAccount({
      workspaceId: statePayload.workspaceId,
      platformCode: "YOUTUBE",
      externalAccountId: profile.externalAccountId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      tokenBundle,
      actorUserId: user.id,
    });

    // 9. Redirect back to application UI with success notification
    return NextResponse.redirect(
      new URL("/social-accounts?connected=YOUTUBE", origin)
    );
  } catch (error: any) {
    // Audit failure if workspace context exists
    if (workspaceIdForAudit) {
      await logAuditEvent({
        workspaceId: workspaceIdForAudit,
        userId: userIdForAudit,
        action: "ACCOUNT_CONNECTION_FAILED",
        resource: "social_account",
        details: {
          platform: "YOUTUBE",
          error: error instanceof Error ? error.message : "OAuth connection failed",
        },
      });
    }

    const errorMsg = error instanceof SocialError
      ? error.message
      : error?.message || "Failed to complete YouTube OAuth connection.";

    return NextResponse.redirect(
      new URL(`/social-accounts?error=${encodeURIComponent(errorMsg)}`, origin)
    );
  }
}
