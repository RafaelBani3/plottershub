import * as React from "react";
import { BarChart3 } from "lucide-react";

export interface NoDataStateProps {
  message?: string;
  subtext?: string;
}

export function NoDataState({
  message = "No analytics data is available for this period.",
  subtext = "Try adjusting the date range or ensure recent channel sync jobs have completed.",
}: NoDataStateProps) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface p-8 text-center text-foreground">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-elevated text-muted-foreground border border-border-subtle">
        <BarChart3 className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{message}</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{subtext}</p>
    </div>
  );
}
