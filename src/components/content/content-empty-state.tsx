"use client";

import * as React from "react";
import Link from "next/link";
import { Film, RefreshCw, SearchX, Plus, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ContentEmptyStateProps {
  type: "no_accounts" | "no_videos" | "no_search_results";
  onSync?: () => void;
  onResetFilters?: () => void;
  isSyncing?: boolean;
}

export function ContentEmptyState({
  type,
  onSync,
  onResetFilters,
  isSyncing = false,
}: ContentEmptyStateProps) {
  if (type === "no_accounts") {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-border-subtle bg-surface px-4 py-16 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500 mb-3">
          <Youtube className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">No YouTube Channel Connected</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Connect your official YouTube channel to explore and manage your video inventory.
        </p>
        <div className="mt-4">
          <Link href="/dashboard">
            <Button size="sm" className="gap-1.5 text-xs h-8">
              <Plus className="h-3.5 w-3.5" />
              <span>Connect Channel</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (type === "no_search_results") {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-border-subtle bg-surface px-4 py-16 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
          <SearchX className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">No Videos Found</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          No content matches your current search term or filter selection.
        </p>
        {onResetFilters && (
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={onResetFilters}
              className="text-xs h-8"
            >
              Reset Filters
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-border-subtle bg-surface px-4 py-16 text-center shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
        <Film className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">No Videos Synced Yet</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Your channel is connected. Click below to synchronize your uploads playlist into Plottershub.
      </p>
      {onSync && (
        <div className="mt-4">
          <Button
            size="sm"
            onClick={onSync}
            disabled={isSyncing}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing Videos..." : "Sync from YouTube"}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
