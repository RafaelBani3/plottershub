"use client";

import { HelpCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentListItemDTO } from "./content-types";

export interface ContentTableViewProps {
  items: ContentListItemDTO[];
  onSelectVideo: (item: ContentListItemDTO) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (newPage: number) => void;
}

export function ContentTableView({
  items,
  onSelectVideo,
  page,
  pageSize,
  total,
  onPageChange,
}: ContentTableViewProps) {
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
      year: "numeric",
    }).format(date);
  };

  const renderTypeBadge = (item: ContentListItemDTO) => {
    const type = item.contentType;
    switch (type) {
      case "SHORTS":
        return (
          <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40">
            Shorts
          </span>
        );
      case "LONG_FORM":
        return (
          <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/40">
            Long-form
          </span>
        );
      case "LIVE_STREAM":
        return (
          <span className="inline-flex items-center rounded bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700 border border-purple-200/60 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800/40">
            Live Stream
          </span>
        );
      case "UNKNOWN":
      default:
        return (
          <span
            className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground border border-border-subtle cursor-help"
            title={item.classificationRationale || "Aspect ratio / orientation is undetermined via Data API"}
          >
            <span>Unknown</span>
            <HelpCircle className="h-2.5 w-2.5 opacity-70" />
          </span>
        );
    }
  };

  const renderPrivacyBadge = (privacy?: string | null) => {
    switch (privacy) {
      case "PUBLIC":
        return (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-foreground bg-muted/30 border border-border-subtle">
            Public
          </span>
        );
      case "UNLISTED":
        return (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40">
            Unlisted
          </span>
        );
      case "PRIVATE":
        return (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40">
            Private
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-md border border-border-subtle bg-surface shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-border-subtle bg-muted/30 text-muted-foreground font-medium h-9">
              <th className="px-3 py-2 text-left font-medium min-w-[280px]">Video</th>
              <th className="px-3 py-2 text-left font-medium w-[110px]">Format</th>
              <th className="px-3 py-2 text-left font-medium w-[90px]">Privacy</th>
              <th className="px-3 py-2 text-right font-medium w-[90px]">Views</th>
              <th className="px-3 py-2 text-right font-medium w-[80px]">Likes</th>
              <th className="px-3 py-2 text-right font-medium w-[80px]">Comments</th>
              <th className="px-3 py-2 text-right font-medium w-[80px]">Duration</th>
              <th className="px-3 py-2 text-right font-medium w-[100px]">Published</th>
              <th className="px-3 py-2 text-center font-medium w-[80px]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {items.map((item) => {
              const thumbnail =
                item.thumbnails?.medium?.url ||
                item.thumbnails?.default?.url ||
                item.thumbnails?.high?.url;

              return (
                <tr
                  key={item.id}
                  onClick={() => onSelectVideo(item)}
                  className="h-10 hover:bg-hover/60 transition-colors cursor-pointer group"
                >
                  {/* Video Thumbnail + Title */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2.5 max-w-[380px]">
                      <div className="relative h-9 w-16 shrink-0 rounded overflow-hidden bg-muted border border-border-subtle">
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
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                          {item.title}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {item.socialAccountName || "YouTube"}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Format Badge */}
                  <td className="px-3 py-1.5">{renderTypeBadge(item)}</td>

                  {/* Privacy Badge */}
                  <td className="px-3 py-1.5">{renderPrivacyBadge(item.privacyStatus)}</td>

                  {/* Views */}
                  <td className="px-3 py-1.5 text-right font-medium text-foreground">
                    {formatNumber(item.metrics?.views)}
                  </td>

                  {/* Likes */}
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {formatNumber(item.metrics?.likes)}
                  </td>

                  {/* Comments */}
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {formatNumber(item.metrics?.comments)}
                  </td>

                  {/* Duration */}
                  <td className="px-3 py-1.5 text-right text-muted-foreground font-mono text-[11px]">
                    {item.formattedDuration || "—"}
                  </td>

                  {/* Published */}
                  <td className="px-3 py-1.5 text-right text-muted-foreground text-[11px]">
                    {formatDate(item.publishedAt)}
                  </td>

                  {/* Action */}
                  <td className="px-3 py-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVideo(item);
                      }}
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Details
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2 text-xs text-muted-foreground bg-surface">
        <div>
          Showing {items.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
          {Math.min(page * pageSize, total)} of {total.toLocaleString()} videos
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="h-7 w-7 p-0"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-1 text-foreground font-medium">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="h-7 w-7 p-0"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
