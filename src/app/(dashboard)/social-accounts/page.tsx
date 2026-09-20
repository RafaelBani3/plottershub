"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Youtube,
  Share2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Unlink,
  ShieldCheck,
  Video,
  BarChart3,
  Calendar,
  Layers,
  MessageSquare,
  ExternalLink,
  AlertCircle,
  Database,
} from "lucide-react";
import { SanitizedSocialAccount } from "@/modules/social/types";
import { useWorkspace } from "@/components/workspace/workspace-provider";

function SocialAccountsContent() {
  const searchParams = useSearchParams();
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [accounts, setAccounts] = React.useState<SanitizedSocialAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [connectingPlatform, setConnectingPlatform] = React.useState<string | null>(null);
  const [syncingAccountId, setSyncingAccountId] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const workspaceId = currentWorkspace?.id || "default-workspace";

  // Handle URL query feedback (e.g. from Google OAuth callback)
  React.useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      setActionMessage({
        type: "success",
        text: `Successfully connected ${connected} account to this workspace!`,
      });
    } else if (error) {
      setActionMessage({
        type: "error",
        text: `Connection failed: ${error}`,
      });
    }
  }, [searchParams]);

  const fetchAccounts = React.useCallback(async () => {
    if (!currentWorkspace?.id) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/social/accounts?workspaceId=${currentWorkspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch {
      // Ignore fetch failures
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace?.id]);

  React.useEffect(() => {
    if (currentWorkspace?.id) {
      fetchAccounts();
    } else if (!workspaceLoading) {
      setLoading(false);
    }
  }, [currentWorkspace?.id, workspaceLoading, fetchAccounts]);

  const handleConnectYouTube = () => {
    if (!currentWorkspace?.id) {
      setActionMessage({
        type: "error",
        text: "Please select an active workspace before connecting accounts.",
      });
      return;
    }
    setConnectingPlatform("YOUTUBE");
    window.location.href = `/api/social/youtube/connect?workspaceId=${encodeURIComponent(currentWorkspace.id)}`;
  };

  const handleSyncAccount = async (accountId: string, platformCode: string) => {
    if (platformCode !== "YOUTUBE") {
      setActionMessage({
        type: "error",
        text: `Automated data synchronization for ${platformCode} is scheduled for future phases.`,
      });
      return;
    }

    try {
      setSyncingAccountId(accountId);
      setActionMessage(null);

      const res = await fetch("/api/social/youtube/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to synchronize YouTube data.");
      }

      setActionMessage({
        type: "success",
        text: `YouTube sync completed: ${data.videosDiscovered} videos discovered, ${data.videosCreated} created, ${data.videosUpdated} updated, ${data.snapshotsCreated} metric snapshots captured (${data.durationMs}ms).`,
      });

      await fetchAccounts();
    } catch (err: any) {
      setActionMessage({
        type: "error",
        text: `Sync Error: ${err.message}`,
      });
    } finally {
      setSyncingAccountId(null);
    }
  };

  const handleSimulateConnect = async (platform: string) => {
    try {
      setConnectingPlatform(platform);
      setActionMessage(null);

      // Step 1: Request OAuth authorization URL & signed state
      const connectRes = await fetch("/api/social/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          workspaceId,
          redirectUri: `${window.location.origin}/api/social/callback`,
        }),
      });

      const connectData = await connectRes.json();
      if (!connectRes.ok) {
        throw new Error(connectData.error || "Failed to initiate connection");
      }

      // Step 2: Simulate callback exchange (Phase 2 test harness)
      const callbackRes = await fetch("/api/social/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          workspaceId,
          code: `mock_auth_code_${Date.now()}`,
          state: connectData.state,
          redirectUri: `${window.location.origin}/api/social/callback`,
          codeVerifier: connectData.codeVerifier,
        }),
      });

      const callbackData = await callbackRes.json();
      if (!callbackRes.ok) {
        throw new Error(callbackData.error || "Failed to complete authorization exchange");
      }

      setActionMessage({
        type: "success",
        text: `Successfully connected ${platform} account!`,
      });
      await fetchAccounts();
    } catch (err: any) {
      setActionMessage({
        type: "error",
        text: `Error: ${err.message}`,
      });
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      setLoading(true);
      const res = await fetch("/api/social/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, workspaceId }),
      });

      if (res.ok) {
        setActionMessage({
          type: "success",
          text: "Social account safely disconnected and tokens purged.",
        });
        await fetchAccounts();
      }
    } catch (err: any) {
      setActionMessage({
        type: "error",
        text: `Error disconnecting: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CONNECTED":
      case "HEALTHY":
        return (
          <Badge variant="positive" className="text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" /> {status === "HEALTHY" ? "Healthy & Synced" : "Connected"}
          </Badge>
        );
      case "SYNCING":
        return (
          <Badge variant="default" className="text-[10px]">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Syncing...
          </Badge>
        );
      case "REAUTH_REQUIRED":
      case "TOKEN_EXPIRED":
        return (
          <Badge variant="destructive" className="text-[10px]">
            <AlertTriangle className="h-3 w-3 mr-1" /> Reauth Required
          </Badge>
        );
      case "API_ERROR":
      case "RATE_LIMITED":
        return (
          <Badge variant="destructive" className="text-[10px]">
            <AlertTriangle className="h-3 w-3 mr-1" /> Error / Limited
          </Badge>
        );
      case "DISCONNECTED":
        return (
          <Badge variant="outline" className="text-[10px]">
            Disconnected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            {status}
          </Badge>
        );
    }
  };

  const isYouTubeConnected = accounts.some(
    (acc) => acc.platformCode === "YOUTUBE" && (acc.status === "CONNECTED" || acc.status === "HEALTHY")
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="border-b border-border-subtle pb-4">
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
          Social Connection Framework
        </h1>
        <p className="text-xs text-muted-foreground">
          Manage OAuth 2.0 integrations, platform capability matrix, and encrypted token lifecycles.
        </p>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-md border text-xs flex items-center justify-between ${
            actionMessage.type === "success"
              ? "bg-positive/10 border-positive/25 text-positive"
              : "bg-negative/10 border-negative/25 text-negative"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-muted-foreground hover:text-foreground ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Security Architecture Callout */}
      <div className="p-3 rounded-md border border-border-subtle bg-surface text-xs flex items-start space-x-2.5">
        <ShieldCheck className="h-4 w-4 text-positive shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-medium text-foreground">Zero-Exposure Token Architecture</div>
          <p className="text-muted-foreground leading-relaxed">
            Access and refresh tokens are encrypted at rest with AES-256-GCM (<code>v1:&#123;iv&#125;:&#123;auth_tag&#125;:&#123;ciphertext&#125;</code>) and decrypted strictly in server-side memory during provider execution. Token refresh concurrency is protected by distributed locking.
          </p>
        </div>
      </div>

      {/* Connected Accounts Section */}
      {accounts.length > 0 && (
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Active Accounts ({accounts.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {accounts.map((acc) => (
              <Card key={acc.id} className="border-border-subtle bg-surface">
                <CardHeader className="p-3.5 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      {acc.avatarUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={acc.avatarUrl}
                          alt={acc.displayName || acc.username}
                          className="h-8 w-8 rounded-full border border-border-strong object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-elevated border border-border-strong flex items-center justify-center font-bold text-foreground">
                          {acc.platformCode === "YOUTUBE" && <Youtube className="h-4 w-4 text-youtube" />}
                          {acc.platformCode === "TIKTOK" && <Share2 className="h-4 w-4 text-muted-foreground" />}
                          {acc.platformCode === "INSTAGRAM" && <Share2 className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          {acc.displayName || acc.username}
                          {acc.platformCode === "YOUTUBE" && (
                            <Badge variant="youtube" className="text-[9px] px-1 py-0 h-4">
                              Channel
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-[11px] text-muted-foreground">
                          @{acc.username} • {acc.platformName}
                        </CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(acc.status)}
                  </div>
                </CardHeader>
                <CardContent className="p-3.5 pt-0 space-y-2.5">
                  {/* Capabilities List */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {acc.capabilities.canReadContent && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-elevated text-muted-foreground border border-border-subtle">
                        <Video className="h-2.5 w-2.5 text-youtube" /> Read Videos
                      </span>
                    )}
                    {acc.capabilities.canReadContentMetrics && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-elevated text-muted-foreground border border-border-subtle">
                        <BarChart3 className="h-2.5 w-2.5 text-foreground" /> Analytics Read
                      </span>
                    )}
                    {acc.capabilities.canPublishVideo && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-elevated text-muted-foreground border border-border-subtle">
                        <Video className="h-2.5 w-2.5 text-positive" /> Video Upload
                      </span>
                    )}
                    {acc.capabilities.canSchedulePublish && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-elevated text-muted-foreground border border-border-subtle">
                        <Calendar className="h-2.5 w-2.5 text-amber-400" /> Native Schedule
                      </span>
                    )}
                    {acc.capabilities.canPublishCarousel && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-elevated text-muted-foreground border border-border-subtle">
                        <Layers className="h-2.5 w-2.5 text-muted-foreground" /> Carousels
                      </span>
                    )}
                    {acc.capabilities.canManageComments && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-elevated text-muted-foreground border border-border-subtle">
                        <MessageSquare className="h-2.5 w-2.5 text-foreground" /> Comments
                      </span>
                    )}
                  </div>

                  {/* Account Sync Action & Channel Metadata */}
                  <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-muted-foreground">
                        Channel ID: <span className="font-mono text-foreground">{acc.externalAccountId}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {acc.lastSyncedAt
                          ? `Last synced: ${new Date(acc.lastSyncedAt).toLocaleString()}`
                          : "Never synced"}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {acc.status !== "DISCONNECTED" && acc.platformCode === "YOUTUBE" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={syncingAccountId === acc.id || loading}
                          onClick={() => handleSyncAccount(acc.id, acc.platformCode)}
                          className="text-[11px] h-7 px-2 border-border-strong text-foreground"
                        >
                          {syncingAccountId === acc.id ? (
                            <>
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Syncing...
                            </>
                          ) : (
                            <>
                              <Database className="h-3 w-3 mr-1" /> Sync Now
                            </>
                          )}
                        </Button>
                      )}

                      {acc.status !== "DISCONNECTED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnect(acc.id)}
                          className="text-[11px] text-negative hover:bg-negative/10 h-7 px-2"
                        >
                          <Unlink className="h-3 w-3 mr-1" /> Disconnect
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Available Platform Providers */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Available Social Providers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* YouTube */}
          <Card className="border-border-subtle bg-surface flex flex-col justify-between">
            <CardHeader className="p-3.5 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded border border-red-500/25 bg-red-500/10 text-youtube flex items-center justify-center">
                    <Youtube className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold text-foreground">YouTube</CardTitle>
                    <CardDescription className="text-[10px]">Google OAuth 2.0</CardDescription>
                  </div>
                </div>
                {isYouTubeConnected ? (
                  <Badge variant="positive" className="text-[10px]">
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="youtube" className="text-[10px]">
                    Phase 3 Active
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3.5 pt-1 space-y-3 text-xs text-muted-foreground">
              <p className="text-[11px] leading-relaxed">
                Connect your YouTube channel using official Google OAuth 2.0. Securely synchronizes channel identity and enables video & metric snapshot ingestion.
              </p>
              <div className="space-y-1.5">
                <Button
                  onClick={handleConnectYouTube}
                  disabled={connectingPlatform === "YOUTUBE" || loading || !currentWorkspace}
                  size="sm"
                  className="w-full text-xs bg-youtube text-white hover:bg-red-600 font-medium h-8"
                >
                  {connectingPlatform === "YOUTUBE" ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin mr-1.5" /> Redirecting to Google...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-3 w-3 mr-1.5" /> Connect YouTube Channel
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handleSimulateConnect("YOUTUBE")}
                  disabled={connectingPlatform === "YOUTUBE" || loading}
                  variant="outline"
                  size="sm"
                  className="w-full text-[11px] h-7 border-border-subtle text-muted-foreground hover:text-foreground"
                >
                  Simulate in Test Harness
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* TikTok */}
          <Card className="border-border-subtle bg-surface opacity-80 flex flex-col justify-between">
            <CardHeader className="p-3.5 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded border border-border-subtle bg-elevated text-muted-foreground flex items-center justify-center">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold text-muted-foreground">TikTok</CardTitle>
                    <CardDescription className="text-[10px]">Login Kit v2</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Phase 7 Target
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3.5 pt-1 space-y-3 text-xs text-muted-foreground">
              <p className="text-[11px] leading-relaxed">
                Direct Post photo/video uploads and performance insights via official TikTok Content Posting API.
              </p>
              <Button
                onClick={() => handleSimulateConnect("TIKTOK")}
                disabled={connectingPlatform === "TIKTOK" || loading}
                variant="outline"
                size="sm"
                className="w-full text-xs h-8 border-border-subtle text-muted-foreground hover:text-foreground"
              >
                {connectingPlatform === "TIKTOK" ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin mr-1.5" /> Connecting...
                  </>
                ) : (
                  "Test Framework Connect"
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Instagram */}
          <Card className="border-border-subtle bg-surface opacity-80 flex flex-col justify-between">
            <CardHeader className="p-3.5 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded border border-border-subtle bg-elevated text-muted-foreground flex items-center justify-center">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold text-muted-foreground">Instagram</CardTitle>
                    <CardDescription className="text-[10px]">Graph API v21+</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Phase 7 Target
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3.5 pt-1 space-y-3 text-xs text-muted-foreground">
              <p className="text-[11px] leading-relaxed">
                Professional Account media publishing, Reels insights, demographic analytics, and comment moderation.
              </p>
              <Button
                onClick={() => handleSimulateConnect("INSTAGRAM")}
                disabled={connectingPlatform === "INSTAGRAM" || loading}
                variant="outline"
                size="sm"
                className="w-full text-xs h-8 border-border-subtle text-muted-foreground hover:text-foreground"
              >
                {connectingPlatform === "INSTAGRAM" ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin mr-1.5" /> Connecting...
                  </>
                ) : (
                  "Test Framework Connect"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SocialAccountsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading social accounts...</div>}>
      <SocialAccountsContent />
    </Suspense>
  );
}
