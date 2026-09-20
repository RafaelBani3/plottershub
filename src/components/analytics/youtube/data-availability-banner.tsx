import * as React from "react";
import { AlertTriangle, Info, Clock } from "lucide-react";
import { DataAvailabilityState } from "@/modules/social/analytics/dashboard.types";

export interface DataAvailabilityBannerProps {
  state: DataAvailabilityState;
}

export function DataAvailabilityBanner({ state }: DataAvailabilityBannerProps) {
  if (state === "COMPLETE") {
    return null;
  }

  if (state === "NO_DATA") {
    return (
      <div
        role="alert"
        className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs text-muted-foreground"
      >
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <div>
          <span className="font-semibold text-foreground">No Data: </span>
          No analytics data is available for this period.
        </div>
      </div>
    );
  }

  if (state === "INSUFFICIENT_DATA") {
    return (
      <div
        role="alert"
        className="flex items-center gap-2.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <div>
          <span className="font-semibold">Incomplete Analytics: </span>
          Analytics data is incomplete for this period. Background synchronization may still be in progress.
        </div>
      </div>
    );
  }

  if (state === "PARTIAL_DATA") {
    return (
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-md border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-300"
      >
        <Clock className="h-3.5 w-3.5 text-blue-400 shrink-0" aria-hidden="true" />
        <div>
          <span className="font-semibold">Partial Coverage: </span>
          Some analytics data is unavailable for this period. Video performance lists synchronized items.
        </div>
      </div>
    );
  }

  return null;
}
