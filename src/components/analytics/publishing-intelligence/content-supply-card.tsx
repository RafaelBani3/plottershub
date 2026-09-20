"use client";

import * as React from "react";
import { UploadCloud, Calendar } from "lucide-react";
import { ContentSupplyBucket } from "@/modules/analytics/publishing-intelligence/publishing-intelligence.types";

interface ContentSupplyCardProps {
  totalUploads: number;
  buckets: ContentSupplyBucket[];
  mostActivePublishingDay: string | null;
  timezone: string;
}

export function ContentSupplyCard({
  totalUploads,
  buckets,
  mostActivePublishingDay,
  timezone,
}: ContentSupplyCardProps) {
  // Aggregate uploads by day of week
  const dayTotals: Record<string, number> = {};
  for (const b of buckets) {
    dayTotals[b.dayOfWeek] = (dayTotals[b.dayOfWeek] || 0) + b.uploadCount;
  }

  // Filter top active hourly windows
  const activeWindows = buckets
    .filter((b) => b.uploadCount > 0)
    .sort((a, b) => b.uploadCount - a.uploadCount)
    .slice(0, 5);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <UploadCloud className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Content Supply Distribution
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            When your channel has historically published content ({timezone}).
          </p>
        </div>
        <div className="rounded border border-border-subtle bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {totalUploads} Upload{totalUploads === 1 ? "" : "s"}
        </div>
      </div>

      {/* Day of Week Breakdown */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">
          Upload Volume by Day
        </p>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((shortDay, idx) => {
            const fullDays = [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ];
            const fullDay = fullDays[idx];
            const count = dayTotals[fullDay] || 0;
            const isTop = fullDay === mostActivePublishingDay && count > 0;

            return (
              <div
                key={shortDay}
                className={`rounded border p-1.5 transition-colors ${
                  isTop
                    ? "border-primary/50 bg-primary/5 font-semibold text-primary"
                    : "border-border-subtle bg-muted/20 text-muted-foreground"
                }`}
              >
                <div className="text-[10px] uppercase">{shortDay}</div>
                <div className="text-xs font-mono font-medium mt-0.5">
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Publishing Windows */}
      <div className="space-y-1.5 pt-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          Most Frequent Publishing Windows
        </p>
        {activeWindows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            No published videos recorded within the lookback window.
          </p>
        ) : (
          <div className="space-y-1.5">
            {activeWindows.map((w) => (
              <div
                key={`${w.dayOfWeek}-${w.hourBucket}`}
                className="flex items-center justify-between rounded border border-border-subtle bg-surface px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-foreground">
                    {w.dayOfWeek} {w.windowLabel}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono">
                    {w.uploadCount} upload{w.uploadCount === 1 ? "" : "s"}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {w.percentageOfTotal}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-1 text-[11px] text-muted-foreground border-t border-border-subtle">
        Reflects your upload frequency. Does not infer audience availability or predict viewership.
      </div>
    </div>
  );
}
