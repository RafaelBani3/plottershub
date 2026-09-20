"use client";

import * as React from "react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { WorkspaceMembersList } from "@/components/workspace/workspace-members-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, ShieldAlert } from "lucide-react";

export default function WorkspaceSettingsPage() {
  const { currentWorkspace, currentRole, refreshWorkspaces } = useWorkspace();
  const [name, setName] = React.useState(currentWorkspace?.name || "");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (currentWorkspace) {
      setName(currentWorkspace.name);
    }
  }, [currentWorkspace]);

  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !canManage) return;

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const res = await fetch(`/api/workspaces/${currentWorkspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update workspace");

      setSuccess("Workspace settings updated successfully.");
      refreshWorkspaces();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Workspace Settings
        </h1>
        <p className="text-sm text-slate-400">
          Configure multi-tenant workspace parameters, branding, and team members.
        </p>
      </div>

      {/* General Settings */}
      <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-md">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">General Information</CardTitle>
              <CardDescription className="text-xs">
                Workspace display name and unique URL slug identifier
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdate} className="space-y-4 max-w-lg">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center space-x-2.5">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center space-x-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="wsName">Workspace Name</Label>
              <Input
                id="wsName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage || isSaving}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wsSlug">Workspace Slug</Label>
              <Input
                id="wsSlug"
                value={currentWorkspace?.slug || ""}
                disabled
                className="bg-slate-950/50 text-slate-400 cursor-not-allowed"
              />
            </div>

            {canManage && (
              <Button type="submit" disabled={isSaving} className="mt-2">
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-md">
        <CardContent className="pt-6">
          <WorkspaceMembersList />
        </CardContent>
      </Card>
    </div>
  );
}
