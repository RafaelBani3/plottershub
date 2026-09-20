import * as React from "react";
import { Monitor } from "lucide-react";
import { DashboardDevicesData } from "@/modules/social/analytics/dashboard.types";
import { formatMetricValue } from "./youtube-formatters";

export interface DevicesPanelProps {
  data?: DashboardDevicesData | null;
  isLoading?: boolean;
}

export function DevicesPanel({ data, isLoading }: DevicesPanelProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border border-border-subtle bg-surface p-4 animate-pulse space-y-2.5">
        <div className="h-4 w-28 bg-elevated rounded" />
        <div className="h-24 bg-elevated/50 rounded" />
      </div>
    );
  }

  const devices = data?.devices || [];
  const hasData = devices.length > 0;

  return (
    <div className="rounded-md border border-border-subtle bg-surface p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-foreground">Playback Devices</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">Device Category</span>
      </div>

      {!hasData ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Device distribution is unavailable for this period.
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d.deviceType} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground truncate max-w-[140px] text-[11px]">
                  {d.displayName || d.deviceType}
                </span>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-muted-foreground">{formatMetricValue(d.views, "compact")} views</span>
                  <span className="font-semibold text-foreground w-11 text-right">
                    {d.percentageShare !== null ? `${d.percentageShare.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </div>
              <div className="h-1 w-full rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-positive/80 transition-all duration-300"
                  style={{ width: `${Math.min(d.percentageShare ?? 0, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
