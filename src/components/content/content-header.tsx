"use client";

import * as React from "react";
import { RefreshCw, Youtube, Video, Zap, Radio, HelpCircle, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SanitizedSocialAccount } from "@/modules/social/types";
import { ContentSummaryDTO } from "./content-types";

export interface ContentHeaderProps {
  accounts: SanitizedSocialAccount[];
  selectedAccountId?: string;
  onSelectAccount: (accountId?: string) => void;
  onSync: () => Promise<void>;
  isSyncing: boolean;
  summary?: ContentSummaryDTO;
  totalCount: number;
  onPublishClick?: () => void;
  userCanPublish?: boolean;
}

export function ContentHeader({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onSync,
  isSyncing,
  summary,
  totalCount,
  onPublishClick,
  userCanPublish = true,
}: ContentHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Content Management
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Synchronized YouTube video library with multi-signal classification and instant local search.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Channel Selector */}
          {accounts.length > 1 ? (
            <select
              value={selectedAccountId || ""}
              onChange={(e) => onSelectAccount(e.target.value ? e.target.value : undefined)}
              disabled={isSyncing}
              className="h-8 rounded-md border border-border-subtle bg-surface px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
            >
              <option value="">All YouTube Channels</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.displayName || acc.username}
                </option>
              ))}
            </select>
          ) : accounts.length === 1 ? (
            <div className="flex h-8 items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2.5 text-xs font-medium text-foreground">
              <Youtube className="h-3.5 w-3.5 text-red-500" />
              <span className="max-w-[140px] truncate">
                {accounts[0].displayName || accounts[0].username}
              </span>
            </div>
          ) : null}

          {/* Sync Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={onSync}
            disabled={isSyncing || accounts.length === 0}
            className="h-8 gap-1.5 px-3 text-xs border-border-subtle bg-surface"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing..." : "Sync from YouTube"}</span>
          </Button>

          {/* Publish Video Button */}
          {onPublishClick && userCanPublish && (
            <Button
              size="sm"
              onClick={onPublishClick}
              disabled={isSyncing || accounts.length === 0}
              className="h-8 gap-1.5 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Publish Video</span>
            </Button>
          )}
        </div>
      </div>

      {/* Summary Stat Pills */}
      {summary ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-foreground shadow-sm">
            <span className="text-muted-foreground font-normal">Total:</span>
            <span className="font-semibold">{summary.total.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-md border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20 px-2.5 py-1 text-blue-700 dark:text-blue-300 shadow-sm">
            <Video className="h-3 w-3" />
            <span className="font-normal opacity-80">Long-form:</span>
            <span className="font-semibold">{summary.longForm.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-md border border-emerald-200/50 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-2.5 py-1 text-emerald-700 dark:text-emerald-300 shadow-sm">
            <Zap className="h-3 w-3" />
            <span className="font-normal opacity-80">Shorts:</span>
            <span className="font-semibold">{summary.shorts.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-md border border-purple-200/50 bg-purple-50/50 dark:border-purple-900/40 dark:bg-purple-950/20 px-2.5 py-1 text-purple-700 dark:text-purple-300 shadow-sm">
            <Radio className="h-3 w-3" />
            <span className="font-normal opacity-80">Live:</span>
            <span className="font-semibold">{summary.liveStream.toLocaleString()}</span>
          </div>

          {summary.unknown > 0 && (
            <div
              className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-muted-foreground shadow-sm"
              title="Videos with duration under 3 minutes lacking orientation or #shorts signals in YouTube Data API."
            >
              <HelpCircle className="h-3 w-3" />
              <span className="font-normal">Unknown:</span>
              <span className="font-semibold text-foreground">{summary.unknown.toLocaleString()}</span>
            </div>
          )}
        </div>
      ) : totalCount > 0 ? (
        <div className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-foreground text-xs shadow-sm w-fit">
          <span className="text-muted-foreground font-normal">Total Videos:</span>
          <span className="font-semibold">{totalCount.toLocaleString()}</span>
        </div>
      ) : null}
    </div>
  );
}
