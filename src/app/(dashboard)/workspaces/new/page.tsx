"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function NewWorkspacePage() {
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const { refreshWorkspaces } = useWorkspace();

  const handleNameChange = (val: string) => {
    setName(val);
    // Auto-generate suggested slug
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(autoSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create workspace");

      await refreshWorkspaces();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-4">
      <Link
        href="/workspaces"
        className="inline-flex items-center text-xs text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
        Back to Workspaces
      </Link>

      <Card className="border-slate-800 bg-slate-900/70 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-1">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-2">
            <Building2 className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl font-bold text-white">Create New Workspace</CardTitle>
          <CardDescription className="text-slate-400">
            Provision an isolated tenant environment for a brand, client, or team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center space-x-2.5">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="wsName">Workspace Name</Label>
              <Input
                id="wsName"
                placeholder="Acme Media Group"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wsSlug">Workspace Slug (URL Identifier)</Label>
              <Input
                id="wsSlug"
                placeholder="acme-media"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
              <p className="text-[11px] text-slate-400">
                Lowercase alphanumeric characters and hyphens only.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-3">
              <Link href="/workspaces">
                <Button type="button" variant="outline" disabled={isLoading}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Workspace"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
