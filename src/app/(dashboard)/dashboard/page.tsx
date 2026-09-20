"use client";

import * as React from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Share2,
  Users,
  FolderPlus,
  ShieldCheck,
  Youtube,
  History,
} from "lucide-react";

export default function DashboardPage() {
  const { currentWorkspace, currentRole, isLoading } = useWorkspace();
  const { user } = useAuth();

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-12 bg-surface rounded-md border border-border-subtle" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-surface rounded-md border border-border-subtle" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workspace Operational Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
              {currentWorkspace?.name || "Workspace Dashboard"}
            </h1>
            <Badge variant="outline" className="text-[10px] uppercase font-mono">
              {currentRole || "VIEWER"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Active tenant overview • Signed in as <span className="text-foreground font-medium">{user?.name || user?.email}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/settings/workspace">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              Team & Roles
            </Button>
          </Link>
          <Link href="/settings/audit-logs">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <History className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              Audit Logs
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Connected Channels</span>
            <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold tracking-tight font-mono text-foreground">
            {currentWorkspace?.socialAccountCount ?? 0}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Phase 2 OAuth connections active
          </p>
        </Card>

        <Card className="p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Content Items</span>
            <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold tracking-tight font-mono text-foreground">
            {currentWorkspace?.contentCount ?? 0}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Media assets in library
          </p>
        </Card>

        <Card className="p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Team Members</span>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold tracking-tight font-mono text-foreground">
            {currentWorkspace?.memberCount ?? 1}
          </div>
          <p className="text-[11px] text-muted-foreground">
            RBAC protection enforced
          </p>
        </Card>

        <Card className="p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Security Status</span>
            <ShieldCheck className="h-3.5 w-3.5 text-positive" />
          </div>
          <div className="text-2xl font-semibold tracking-tight font-mono text-positive">
            Optimal
          </div>
          <p className="text-[11px] text-muted-foreground">
            AES-256-GCM + Audit trail active
          </p>
        </Card>
      </div>

      {/* Provider Integration Roadmap */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Provider Integration Matrix</h2>
          <p className="text-xs text-muted-foreground">
            Social platforms connected in isolated modules under strict capability guidelines.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* YouTube (Phase 3 Slice) */}
          <Card className="border-border-strong bg-surface">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded border border-red-500/25 bg-red-500/10 text-red-500">
                    <Youtube className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold">YouTube</CardTitle>
                </div>
                <Badge variant="youtube" className="text-[10px]">
                  Phase 3 Primary
                </Badge>
              </div>
              <CardDescription className="text-xs pt-1">
                Data API v3 + YouTube Analytics API integration
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2 text-xs text-muted-foreground border-t border-border-subtle mt-2">
              <div className="flex items-center justify-between">
                <span>Quota Strategy</span>
                <span className="text-foreground font-mono text-[11px]">1 unit sync</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Token Refresh</span>
                <span className="text-foreground font-mono text-[11px]">Offline consent</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Direct Publish</span>
                <span className="text-foreground font-mono text-[11px]">Resumable chunking</span>
              </div>
            </CardContent>
          </Card>

          {/* TikTok */}
          <Card className="opacity-80">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded border border-border-subtle bg-elevated text-muted-foreground">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold text-muted-foreground">TikTok</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Phase 7
                </Badge>
              </div>
              <CardDescription className="text-xs pt-1">
                Content Posting API & Login Kit v2
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2 text-xs text-muted-foreground border-t border-border-subtle mt-2">
              <div className="flex items-center justify-between">
                <span>Direct Post</span>
                <span className="text-muted-foreground font-mono text-[11px]">Creator verify</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Rate Limit</span>
                <span className="text-muted-foreground font-mono text-[11px]">6 req/min</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Scope Requirement</span>
                <span className="text-muted-foreground font-mono text-[11px]">video.publish</span>
              </div>
            </CardContent>
          </Card>

          {/* Instagram */}
          <Card className="opacity-80">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded border border-border-subtle bg-elevated text-muted-foreground">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Instagram</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Phase 7
                </Badge>
              </div>
              <CardDescription className="text-xs pt-1">
                Instagram Graph API with Instagram Login
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2 text-xs text-muted-foreground border-t border-border-subtle mt-2">
              <div className="flex items-center justify-between">
                <span>Account Type</span>
                <span className="text-muted-foreground font-mono text-[11px]">Professional</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Publishing Flow</span>
                <span className="text-muted-foreground font-mono text-[11px]">2-step container</span>
              </div>
              <div className="flex items-center justify-between">
                <span>24h Quota</span>
                <span className="text-muted-foreground font-mono text-[11px]">50 posts max</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
