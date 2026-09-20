"use client";

import * as React from "react";
import { BarChart3, Info } from "lucide-react";
import { ConsumptionPatternDay } from "@/modules/analytics/publishing-intelligence/publishing-intelligence.types";

interface ConsumptionPatternCardProps {
  days: ConsumptionPatternDay[];
  channelDailyMeanViews: number;
  channelDailyMeanWatchTimeMinutes: number;
}

export function ConsumptionPatternCard({
  days,
  channelDailyMeanViews,
  channelDailyMeanWatchTimeMinutes: _channelDailyMeanWatchTimeMinutes,
}: ConsumptionPatternCardProps) {
  const maxViews = Math.max(...days.map((d) => d.averageDailyViews), 1);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Historical Consumption Pattern
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Daily viewing volume across your channel catalog by day of week.
          </p>
        </div>
        <div className="rounded border border-border-subtle bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Mean: {channelDailyMeanViews.toLocaleString()} views/day
        </div>
      </div>

      {/* Bar Distribution */}
      <div className="space-y-2 pt-1">
        {days.map((d) => {
          const barWidthPercent = Math.min(
            100,
            Math.max(4, Math.round((d.averageDailyViews / maxViews) * 100))
          );
          const isAboveAverage = d.relativeLevel === "ABOVE_AVERAGE";
          const isBelowAverage = d.relativeLevel === "BELOW_AVERAGE";

          return (
            <div key={d.dayOfWeek} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground w-24">
                  {d.dayOfWeek}
                </span>
                <div className="flex items-center gap-2 text-right">
                  <span className="text-muted-foreground">
                    {d.averageDailyViews.toLocaleString()} views/day
                  </span>
                  <span
                    className={`inline-block w-14 text-[11px] font-mono font-medium ${
                      isAboveAverage
                        ? "text-emerald-700 dark:text-emerald-400"
                        : isBelowAverage
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {d.consumptionIndex >= 1.0
                      ? `+${Math.round((d.consumptionIndex - 1) * 100)}%`
                      : `${Math.round((d.consumptionIndex - 1) * 100)}%`}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isAboveAverage
                      ? "bg-primary"
                      : isBelowAverage
                      ? "bg-zinc-400 dark:bg-zinc-500"
                      : "bg-primary/70"
                  }`}
                  style={{ width: `${barWidthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground border-t border-border-subtle">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          Reflects daily catalog-wide watch time and views. Does not represent hourly concurrent online presence.
        </span>
      </div>
    </div>
  );
}
