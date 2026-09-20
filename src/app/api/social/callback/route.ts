import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { SocialProviderRegistry } from "@/modules/social/registry";
import { verifyAndConsumeOAuthState } from "@/modules/social/oauth-state";
import { socialAccountService } from "@/modules/social/account-service";
import { PlatformCode } from "@/modules/social/types";
import { logAuditEvent } from "@/modules/audit/audit-service";

/**
 * Standard Browser OAuth Redirect Handler (GET).
 * Invoked directly by the OAuth provider upon user consent.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error") || searchParams.get("error_description");

  const redirectUri = `${origin}/api/social/callback`;

  // Handle provider cancellation or denial
  if (providerError) {
    return NextResponse.redirect(
      new URL(`/social-accounts?error=${encodeURIComponent(providerError)}`, origin)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/social-accounts?error=Missing+required+OAuth+parameters", origin)
    );
  }

  try {
    // 1. Verify and atomically consume OAuth state attempt (replay protection)
    const statePayload = await verifyAndConsumeOAuthState(state);

    const platformCode = statePayload.provider as PlatformCode;

    // 2. Ensure current session user matches authorization attempt
    const { user } = await requireWorkspacePermission(
      statePayload.workspaceId,
      "social_accounts:connect"
    );

    if (user.id !== statePayload.userId) {
      throw new Error("User session mismatch during OAuth callback.");
    }

    // 3. Obtain provider adapter
    const provider = SocialProviderRegistry.getProvider(platformCode);

    // 4. Exchange code for TokenBundle
    const tokenBundle = await provider.exchangeAuthorizationCode({
      code,
      redirectUri,
      codeVerifier: statePayload.codeVerifier,
    });

    // 5. Retrieve creator profile info
    const profile = await provider.getAccountProfile(tokenBundle.accessToken);

    // 6. Connect and persist encrypted credentials
    await socialAccountService.connectAccount({
      workspaceId: statePayload.workspaceId,
      platformCode,
      externalAccountId: profile.externalAccountId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      tokenBundle,
      actorUserId: user.id,
    });

    return NextResponse.redirect(
      new URL(`/social-accounts?connected=${encodeURIComponent(platformCode)}`, origin)
    );
  } catch (error: any) {
    const errorMsg = error?.message || "OAuth authorization failed.";
    return NextResponse.redirect(
      new URL(`/social-accounts?error=${encodeURIComponent(errorMsg)}`, origin)
    );
  }
}

/**
 * Programmatic OAuth Callback Endpoint (POST).
 * Used for headless clients, unit testing, and test harness simulations.
 */
export async function POST(req: NextRequest) {
  let workspaceIdForAudit = "";
  let platformForAudit = "";
  let userIdForAudit: string | null = null;

  try {
    const body = await req.json();
    const {
      platform,
      workspaceId,
      code,
      state,
      redirectUri,
      codeVerifier,
    } = body as {
      platform?: string;
      workspaceId?: string;
      code?: string;
      state?: string;
      redirectUri?: string;
      codeVerifier?: string;
    };

    if (!platform || !workspaceId || !code || !state || !redirectUri) {
      return NextResponse.json(
        { error: "Missing required fields: platform, workspaceId, code, state, redirectUri" },
        { status: 400 }
      );
    }

    workspaceIdForAudit = workspaceId;
    platformForAudit = platform;

    const platformCode = platform.toUpperCase() as PlatformCode;
    const { user } = await requireWorkspacePermission(workspaceId, "social_accounts:connect");
    userIdForAudit = user.id;

    // 1. Verify and atomically consume signed OAuth state (replay prevention)
    const statePayload = await verifyAndConsumeOAuthState(state, {
      userId: user.id,
      workspaceId,
      provider: platformCode,
    });

    // 2. Obtain provider adapter
    const provider = SocialProviderRegistry.getProvider(platformCode);

    // 3. Exchange code for TokenBundle
    const tokenBundle = await provider.exchangeAuthorizationCode({
      code,
      redirectUri,
      codeVerifier: codeVerifier || statePayload.codeVerifier,
    });

    // 4. Retrieve creator profile info
    const profile = await provider.getAccountProfile(tokenBundle.accessToken);

    // 5. Connect and persist encrypted credentials
    const account = await socialAccountService.connectAccount({
      workspaceId,
      platformCode,
      externalAccountId: profile.externalAccountId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      tokenBundle,
      actorUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      account,
    });
  } catch (error) {
    if (workspaceIdForAudit) {
      await logAuditEvent({
        workspaceId: workspaceIdForAudit,
        userId: userIdForAudit,
        action: "ACCOUNT_CONNECTION_FAILED",
        resource: "social_account",
        details: {
          platform: platformForAudit,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }

    return handleApiError(error);
  }
}
