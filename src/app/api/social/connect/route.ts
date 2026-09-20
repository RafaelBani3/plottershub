import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { SocialProviderRegistry } from "@/modules/social/registry";
import { createOAuthState, generatePKCE } from "@/modules/social/oauth-state";
import { PlatformCode } from "@/modules/social/types";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { SocialError } from "@/modules/social/errors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, workspaceId, redirectUri } = body as {
      platform?: string;
      workspaceId?: string;
      redirectUri?: string;
    };

    if (!platform || !workspaceId || !redirectUri) {
      return NextResponse.json(
        { error: "Missing required fields: platform, workspaceId, redirectUri" },
        { status: 400 }
      );
    }

    const platformCode = platform.toUpperCase() as PlatformCode;
    const { user } = await requireWorkspacePermission(workspaceId, "social_accounts:connect");

    let provider;
    try {
      provider = SocialProviderRegistry.getProvider(platformCode);
    } catch {
      throw new SocialError(`Unsupported platform: ${platform}`, "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: platformCode,
      });
    }

    // Generate PKCE
    const { codeVerifier, codeChallenge } = generatePKCE();

    // Create signed, expiring OAuth state token and persist attempt
    const state = await createOAuthState({
      userId: user.id,
      workspaceId,
      provider: platformCode,
      codeVerifier,
    });

    // Obtain provider authorization URL
    const authorizationUrl = await provider.getAuthorizationUrl({
      state,
      redirectUri,
      codeChallenge,
    });

    // Audit log connection attempt initiated
    await logAuditEvent({
      workspaceId,
      userId: user.id,
      action: "ACCOUNT_CONNECTION_STARTED",
      resource: "social_account",
      details: {
        platform: platformCode,
        redirectUri,
      },
    });

    return NextResponse.json({
      authorizationUrl,
      state,
      codeVerifier,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
