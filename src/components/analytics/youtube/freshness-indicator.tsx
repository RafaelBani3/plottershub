import * as React from "react";
import { Clock, ShieldAlert } from "lucide-react";
import { DashboardResponseMeta } from "@/modules/social/analytics/dashboard.types";

export interface FreshnessIndicatorProps {
  meta?: DashboardResponseMeta | null;
}

export function FreshnessIndicator({ meta }: FreshnessIndicatorProps) {
  if (!meta) return null;

  const { freshness, period } = meta;
  const isStale = freshness.status === "STALE";
  const asOfDate = freshness.dataAsOf || freshness.latestObservationDate;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground py-0.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-medium text-[11px] border border-border-subtle bg-surface text-foreground">
          <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          {asOfDate ? `Data as of ${asOfDate}` : "Observation window active"}
        </span>

        {freshness.analyticsDataLagDays > 0 && (
          <span className="text-muted-foreground text-[11px]">
            • Processing lag: ~{freshness.analyticsDataLagDays}d
          </span>
        )}

        {isStale && (
          <span className="inline-flex items-center gap-1 text-amber-400 font-medium text-[11px]">
            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            Sync delayed
          </span>
        )}
      </div>

      <div className="text-muted-foreground font-mono text-[11px]">
        {period.startDate} to {period.endDate} ({period.days}d)
      </div>
    </div>
  );
}
