"use client";

import * as React from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Check } from "lucide-react";

export default function WorkspacesPage() {
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace();

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Your Workspaces
          </h1>
          <p className="text-sm text-slate-400">
            Switch between tenant workspaces or create a new multi-tenant environment.
          </p>
        </div>

        <Link href="/workspaces/new">
          <Button className="flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>New Workspace</span>
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {workspaces.map((ws) => {
          const isActive = ws.id === currentWorkspace?.id;
          return (
            <Card
              key={ws.id}
              className={`transition-all ${
                isActive
                  ? "border-indigo-500/50 bg-indigo-950/20 shadow-indigo-500/10 shadow-lg"
                  : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-sm">
                      {ws.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">{ws.name}</CardTitle>
                      <CardDescription className="text-xs">{ws.slug}</CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Badge
                      variant={
                        ws.currentUserRole === "OWNER"
                          ? "default"
                          : ws.currentUserRole === "ADMIN"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {ws.currentUserRole}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-2">
                <div className="grid grid-cols-3 gap-2 text-center py-2 px-3 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs">
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-semibold">Members</div>
                    <div className="text-white font-bold mt-0.5">{ws.memberCount ?? 1}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-semibold">Channels</div>
                    <div className="text-white font-bold mt-0.5">{ws.socialAccountCount ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-semibold">Content</div>
                    <div className="text-white font-bold mt-0.5">{ws.contentCount ?? 0}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  {isActive ? (
                    <span className="text-xs text-indigo-400 font-medium flex items-center">
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Active Workspace
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => switchWorkspace(ws.id)}
                      className="text-xs border-slate-700 hover:bg-slate-800"
                    >
                      Switch to Workspace
                    </Button>
                  )}

                  <Link href="/settings/workspace">
                    <Button variant="ghost" size="sm" className="text-xs text-slate-400 hover:text-white">
                      Settings
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
