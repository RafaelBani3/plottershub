import * as React from "react";
import { TopVideoItem, TopVideoSortField, SortOrder } from "@/modules/social/analytics/dashboard.types";
import { formatMetricValue, formatWatchTime } from "./youtube-formatters";
import { ArrowUpDown, ChevronLeft, ChevronRight, PlaySquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TopVideosTableProps {
  videos: TopVideoItem[];
  totalVideos: number;
  limit: number;
  offset: number;
  sortBy: TopVideoSortField;
  sortOrder: SortOrder;
  onChangeSort: (field: TopVideoSortField) => void;
  onPageChange: (newOffset: number) => void;
  onSelectVideo: (videoId: string) => void;
  isLoading?: boolean;
}

export function TopVideosTable({
  videos,
  totalVideos,
  limit,
  offset,
  sortBy,
  sortOrder,
  onChangeSort,
  onPageChange,
  onSelectVideo,
  isLoading = false,
}: TopVideosTableProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(Math.ceil(totalVideos / limit), 1);

  const renderSortIndicator = (field: TopVideoSortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground opacity-50 inline" />;
    }
    return (
      <span className="ml-1 text-foreground font-bold inline">
        {sortOrder === "desc" ? "↓" : "↑"}
      </span>
    );
  };

  return (
    <section
      aria-label="Top Performing Videos"
      className="rounded-md border border-border-subtle bg-surface p-3.5 sm:p-4 space-y-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Top Performing Videos</h2>
          <p className="text-[11px] text-muted-foreground">
            Ranked video performance for the selected observation window
          </p>
        </div>

        {/* Pagination header info */}
        <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-muted-foreground">
          <span className="text-[11px]">
            Showing {videos.length > 0 ? offset + 1 : 0}–{Math.min(offset + videos.length, totalVideos)} of{" "}
            {totalVideos}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0 || isLoading}
              onClick={() => onPageChange(Math.max(offset - limit, 0))}
              className="h-7 w-7 p-0 border-border-strong text-foreground"
              aria-label="Previous Page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] font-mono text-foreground px-1">
              {currentPage}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= totalVideos || isLoading}
              onClick={() => onPageChange(offset + limit)}
              className="h-7 w-7 p-0 border-border-strong text-foreground"
              aria-label="Next Page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile-only Sort Bar */}
      {videos.length > 0 && (
        <div className="flex items-center justify-between gap-2 sm:hidden pt-2 border-t border-border-subtle text-xs">
          <span className="text-muted-foreground font-medium text-[11px]">Sort videos by:</span>
          <div className="flex items-center gap-1">
            <select
              aria-label="Sort videos by"
              value={sortBy}
              onChange={(e) => onChangeSort(e.target.value as TopVideoSortField)}
              className="h-7 px-2 rounded border border-border-strong bg-elevated text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
            >
              <option value="views">Views</option>
              <option value="estimatedMinutesWatched">Watch Time</option>
              <option value="engagementRate">Engagement Rate</option>
            </select>
          </div>
        </div>
      )}

      {videos.length === 0 ? (
        <div className="rounded border border-border-subtle bg-elevated p-8 text-center text-xs text-muted-foreground">
          No video performance observations found for this period.
        </div>
      ) : (
        <>
          {/* Desktop & Tablet Table View */}
          <div className="hidden md:block overflow-x-auto rounded border border-border-subtle bg-surface">
            <table className="w-full text-left text-xs">
              <thead className="bg-elevated text-muted-foreground border-b border-border-subtle">
                <tr>
                  <th className="py-2 px-2.5 font-medium w-12 text-center text-[11px]">Rank</th>
                  <th className="py-2 px-2.5 font-medium text-[11px]">Video Title</th>
                  <th
                    className="py-2 px-2.5 font-medium text-right cursor-pointer hover:text-foreground transition-colors text-[11px]"
                    onClick={() => onChangeSort("views")}
                  >
                    Views {renderSortIndicator("views")}
                  </th>
                  <th
                    className="py-2 px-2.5 font-medium text-right cursor-pointer hover:text-foreground transition-colors text-[11px]"
                    onClick={() => onChangeSort("estimatedMinutesWatched")}
                  >
                    Watch Time {renderSortIndicator("estimatedMinutesWatched")}
                  </th>
                  <th className="py-2 px-2.5 font-medium text-right text-[11px]">Avg Duration</th>
                  <th
                    className="py-2 px-2.5 font-medium text-right cursor-pointer hover:text-foreground transition-colors text-[11px]"
                    onClick={() => onChangeSort("engagementRate")}
                  >
                    Engagement {renderSortIndicator("engagementRate")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-foreground font-mono">
                {videos.map((vid) => {
                  return (
                    <tr
                      key={vid.videoId}
                      onClick={() => onSelectVideo(vid.videoId)}
                      className="cursor-pointer hover:bg-hover/50 transition-colors group"
                    >
                      <td className="py-2 px-2.5 text-center font-bold text-muted-foreground group-hover:text-foreground text-[11px]">
                        #{vid.rank}
                      </td>
                      <td className="py-2 px-2.5 font-sans">
                        <div className="flex items-center gap-2 max-w-md">
                          <PlaySquare className="h-3.5 w-3.5 text-youtube shrink-0 opacity-90" />
                          <span className="font-medium text-foreground truncate text-xs group-hover:underline">
                            {vid.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-right font-medium text-foreground text-xs">
                        {formatMetricValue(vid.metrics.views, "integer")}
                      </td>
                      <td className="py-2 px-2.5 text-right text-muted-foreground text-xs">
                        {formatWatchTime(vid.metrics.estimatedMinutesWatched)}
                      </td>
                      <td className="py-2 px-2.5 text-right text-muted-foreground text-xs">
                        {formatMetricValue(vid.metrics.averageViewDuration, "duration")}
                      </td>
                      <td className="py-2 px-2.5 text-right font-semibold text-foreground text-xs">
                        {formatMetricValue(vid.metrics.engagementRate, "percent")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View (below md breakpoint) */}
          <div className="block md:hidden space-y-2.5">
            {videos.map((vid) => (
              <div
                key={vid.videoId}
                role="button"
                tabIndex={0}
                onClick={() => onSelectVideo(vid.videoId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectVideo(vid.videoId);
                  }
                }}
                className="rounded-md border border-border-subtle bg-elevated p-3 space-y-2 active:bg-hover transition-colors cursor-pointer"
              >
                {/* Card Header: Rank & Title */}
                <div className="flex items-start gap-2">
                  <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded border border-border-strong bg-surface text-[10px] font-bold text-foreground font-mono shrink-0">
                    #{vid.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                      <PlaySquare className="h-3 w-3 text-youtube shrink-0" />
                      <span className="font-mono">{vid.videoId}</span>
                    </div>
                    <h3 className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                      {vid.title}
                    </h3>
                  </div>
                </div>

                {/* 2x2 Metric Grid */}
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-border-subtle text-xs">
                  <div className="bg-surface rounded p-1.5 border border-border-subtle">
                    <span className="text-[10px] text-muted-foreground block">Views</span>
                    <span className="font-mono font-semibold text-foreground text-xs">
                      {formatMetricValue(vid.metrics.views, "integer")}
                    </span>
                  </div>
                  <div className="bg-surface rounded p-1.5 border border-border-subtle">
                    <span className="text-[10px] text-muted-foreground block">Watch Time</span>
                    <span className="font-mono font-semibold text-foreground text-xs">
                      {formatWatchTime(vid.metrics.estimatedMinutesWatched)}
                    </span>
                  </div>
                  <div className="bg-surface rounded p-1.5 border border-border-subtle">
                    <span className="text-[10px] text-muted-foreground block">Avg Duration</span>
                    <span className="font-mono text-muted-foreground text-xs">
                      {formatMetricValue(vid.metrics.averageViewDuration, "duration")}
                    </span>
                  </div>
                  <div className="bg-surface rounded p-1.5 border border-border-subtle">
                    <span className="text-[10px] text-muted-foreground block">Engagement</span>
                    <span className="font-mono font-semibold text-foreground text-xs">
                      {formatMetricValue(vid.metrics.engagementRate, "percent")}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground text-right">
                  Tap for breakdown & progression →
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
