"use client";

import * as React from "react";
import { Eye, ThumbsUp, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentListItemDTO } from "./content-types";

export interface ContentCardGridProps {
  items: ContentListItemDTO[];
  onSelectVideo: (item: ContentListItemDTO) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (newPage: number) => void;
}

export function ContentCardGrid({
  items,
  onSelectVideo,
  page,
  pageSize,
  total,
  onPageChange,
}: ContentCardGridProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const formatNumber = (val: number | string | null | undefined) => {
    if (val === null || val === undefined) return "—";
    const num = typeof val === "string" ? Number(val) : val;
    if (isNaN(num)) return "—";
    return new Intl.NumberFormat("en-US", { notation: "compact" }).format(num);
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "—";
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  };

  const renderTypeBadge = (item: ContentListItemDTO) => {
    switch (item.contentType) {
      case "SHORTS":
        return (
          <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40">
            Shorts
          </span>
        );
      case "LONG_FORM":
        return (
          <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/40">
            Long-form
          </span>
        );
      case "LIVE_STREAM":
        return (
          <span className="inline-flex items-center rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 border border-purple-200/60 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800/40">
            Live
          </span>
        );
      case "UNKNOWN":
      default:
        return (
          <span className="inline-flex items-center gap-0.5 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border-subtle">
            <span>Unknown</span>
            <HelpCircle className="h-2 w-2 opacity-70" />
          </span>
        );
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {items.map((item) => {
          const thumbnail =
            item.thumbnails?.medium?.url ||
            item.thumbnails?.default?.url ||
            item.thumbnails?.high?.url;

          return (
            <div
              key={item.id}
              onClick={() => onSelectVideo(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onSelectVideo(item);
                }
              }}
              className="flex flex-col justify-between rounded-md border border-border-subtle bg-surface p-3 shadow-sm hover:border-border-strong hover:bg-hover/30 transition-all cursor-pointer min-h-[44px]"
            >
              <div className="flex gap-3">
                {/* Thumbnail with duration overlay */}
                <div className="relative h-16 w-28 shrink-0 rounded overflow-hidden bg-muted border border-border-subtle">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={item.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground text-[10px]">
                      No img
                    </div>
                  )}
                  {item.formattedDuration && (
                    <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-mono font-medium text-white">
                      {item.formattedDuration}
                    </div>
                  )}
                </div>

                {/* Title and metadata */}
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-xs font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.socialAccountName || "YouTube"} • {formatDate(item.publishedAt)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {renderTypeBadge(item)}
                    {item.privacyStatus && item.privacyStatus !== "PUBLIC" && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400">
                        {item.privacyStatus}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Metrics footer */}
              <div className="mt-2.5 flex items-center justify-between border-t border-border-subtle pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    <span className="font-medium text-foreground">
                      {formatNumber(item.metrics?.views)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3 w-3" />
                    <span>{formatNumber(item.metrics?.likes)}</span>
                  </span>
                </div>

                <span className="text-[11px] font-medium text-primary hover:underline">
                  View Details &rarr;
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs text-muted-foreground shadow-sm">
        <div>
          Showing {items.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
          {Math.min(page * pageSize, total)} of {total.toLocaleString()}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="h-8 w-8 p-0"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-1 text-foreground font-medium">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="h-8 w-8 p-0"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
