import { TokenBundle } from "../../types";
import { GoogleOAuthConfig, GoogleTokenResponse } from "./youtube.types";
import { mapGoogleOAuthError } from "./youtube.errors";
import { SocialError } from "../../errors";

export const DEFAULT_YOUTUBE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export const YOUTUBE_WRITE_SCOPES = [
  ...DEFAULT_YOUTUBE_SCOPES,
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

/**
 * Checks whether the granted OAuth scopes contain the required write scope for videos.update.
 */
export function hasYouTubeWriteScope(scopes?: string[] | string | null): boolean {
  if (!scopes) return false;
  const scopeList = Array.isArray(scopes)
    ? scopes
    : String(scopes).split(/[\s,]+/).filter(Boolean);
  return (
    scopeList.includes("https://www.googleapis.com/auth/youtube") ||
    scopeList.includes("https://www.googleapis.com/auth/youtube.force-ssl") ||
    scopeList.includes("https://www.googleapis.com/auth/youtubepartner")
  );
}

/**
 * Checks whether granted OAuth scopes include comment view/manage permission.
 */
export function hasYouTubeCommentScope(scopes?: string[] | string | null): boolean {
  if (!scopes) return false;
  const scopeList = Array.isArray(scopes)
    ? scopes
    : String(scopes).split(/[\s,]+/).filter(Boolean);
  return (
    scopeList.includes("https://www.googleapis.com/auth/youtube.force-ssl") ||
    scopeList.includes("https://www.googleapis.com/auth/youtube") ||
    scopeList.includes("https://www.googleapis.com/auth/youtubepartner")
  );
}

/**
 * Checks whether granted OAuth scopes include video upload permission.
 */
export function hasYouTubeUploadScope(scopes?: string[] | string | null): boolean {
  if (!scopes) return false;
  const scopeList = Array.isArray(scopes)
    ? scopes
    : String(scopes).split(/[\s,]+/).filter(Boolean);
  return (
    scopeList.includes("https://www.googleapis.com/auth/youtube.upload") ||
    scopeList.includes("https://www.googleapis.com/auth/youtube") ||
    scopeList.includes("https://www.googleapis.com/auth/youtube.force-ssl") ||
    scopeList.includes("https://www.googleapis.com/auth/youtubepartner")
  );
}

export class YouTubeOAuthClient {
  private config: GoogleOAuthConfig;

  constructor(config?: Partial<GoogleOAuthConfig>) {
    this.config = {
      clientId:
        config?.clientId ||
        process.env.GOOGLE_CLIENT_ID ||
        "",
      clientSecret:
        config?.clientSecret ||
        process.env.GOOGLE_CLIENT_SECRET ||
        "",
      redirectUri:
        config?.redirectUri ||
        process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:3000/api/social/callback/youtube",
    };
  }

  private validateConfig(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new SocialError(
        "Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are missing.",
        "SOCIAL_INVALID_REQUEST",
        { provider: "YOUTUBE" }
      );
    }
  }

  /**
   * Constructs the official Google OAuth 2.0 authorization URL.
   */
  getAuthorizationUrl(params: {
    state: string;
    redirectUri?: string;
    codeChallenge?: string;
    scopes?: string[];
  }): string {
    this.validateConfig();

    const redirectUri = params.redirectUri || this.config.redirectUri;
    const scopes = params.scopes && params.scopes.length > 0 ? params.scopes : DEFAULT_YOUTUBE_SCOPES;

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", params.state);

    if (params.codeChallenge) {
      url.searchParams.set("code_challenge", params.codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }

    return url.toString();
  }

  /**
   * Exchanges an authorization code server-side for access and refresh tokens.
   */
  async exchangeAuthorizationCode(params: {
    code: string;
    redirectUri?: string;
    codeVerifier?: string;
  }): Promise<TokenBundle> {
    this.validateConfig();

    if (!params.code) {
      throw new SocialError("Authorization code is required for exchange.", "SOCIAL_INVALID_REQUEST", {
        provider: "YOUTUBE",
      });
    }

    const redirectUri = params.redirectUri || this.config.redirectUri;

    const bodyParams = new URLSearchParams({
      code: params.code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    if (params.codeVerifier) {
      bodyParams.set("code_verifier", params.codeVerifier);
    }

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyParams.toString(),
      });

      const data: GoogleTokenResponse = await response.json();

      if (!response.ok || data.error) {
        throw mapGoogleOAuthError(data);
      }

      const expiresInMs = (data.expires_in || 3600) * 1000;

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        accessTokenExpiresAt: new Date(Date.now() + expiresInMs),
        scopes: data.scope ? data.scope.split(" ") : DEFAULT_YOUTUBE_SCOPES,
        tokenType: data.token_type || "Bearer",
      };
    } catch (error) {
      throw mapGoogleOAuthError(error);
    }
  }

  /**
   * Refreshes an expired Google access token using the stored refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
    this.validateConfig();

    if (!refreshToken) {
      throw new SocialError("Refresh token is required.", "SOCIAL_TOKEN_REVOKED", {
        provider: "YOUTUBE",
        userActionRequired: true,
      });
    }

    const bodyParams = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
    });

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyParams.toString(),
      });

      const data: GoogleTokenResponse = await response.json();

      if (!response.ok || data.error) {
        throw mapGoogleOAuthError(data);
      }

      const expiresInMs = (data.expires_in || 3600) * 1000;

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // Google preserves existing refresh token if not rotated
        accessTokenExpiresAt: new Date(Date.now() + expiresInMs),
        scopes: data.scope ? data.scope.split(" ") : undefined,
        tokenType: data.token_type || "Bearer",
      };
    } catch (error) {
      throw mapGoogleOAuthError(error);
    }
  }

  /**
   * Revokes token authorization on Google servers.
   */
  async revokeAccess(token: string): Promise<boolean> {
    if (!token) return true;

    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      return response.ok;
    } catch {
      return false;
    }
  }
}
