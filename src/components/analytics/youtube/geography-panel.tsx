import * as React from "react";
import { Globe } from "lucide-react";
import { DashboardGeographyData } from "@/modules/social/analytics/dashboard.types";
import { formatMetricValue } from "./youtube-formatters";

export interface GeographyPanelProps {
  data?: DashboardGeographyData | null;
  isLoading?: boolean;
}

export function GeographyPanel({ data, isLoading }: GeographyPanelProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border border-border-subtle bg-surface p-4 animate-pulse space-y-2.5">
        <div className="h-4 w-28 bg-elevated rounded" />
        <div className="h-24 bg-elevated/50 rounded" />
      </div>
    );
  }

  const countries = data?.countries || [];
  const hasData = countries.length > 0;

  return (
    <div className="rounded-md border border-border-subtle bg-surface p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-foreground">Top Geography</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">By View Share</span>
      </div>

      {!hasData ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Geographic distribution is unavailable for this period.
        </div>
      ) : (
        <div className="space-y-2">
          {countries.slice(0, 5).map((c) => (
            <div key={c.countryCode} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground bg-elevated border border-border-subtle px-1 py-0.2 rounded">
                    {c.countryCode}
                  </span>
                  <span className="font-medium text-foreground truncate max-w-[130px] text-[11px]">
                    {c.countryName}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-muted-foreground">{formatMetricValue(c.views, "compact")} views</span>
                  <span className="font-semibold text-foreground w-11 text-right">
                    {c.percentageShare !== null ? `${c.percentageShare.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </div>
              <div className="h-1 w-full rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-blue-500/80 transition-all duration-300"
                  style={{ width: `${Math.min(c.percentageShare ?? 0, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
