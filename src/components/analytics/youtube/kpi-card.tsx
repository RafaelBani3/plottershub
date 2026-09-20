import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { MetricComparison } from "@/modules/social/analytics/dashboard.types";
import { formatMetricValue, formatWatchTime } from "./youtube-formatters";

export interface KpiCardProps {
  label: string;
  metric?: MetricComparison<string | number | null> | null;
  format?: "integer" | "duration" | "percent" | "decimal" | "watchTime";
  subtext?: string;
  tooltip?: string;
}

export function KpiCard({
  label,
  metric,
  format = "integer",
  subtext,
  tooltip,
}: KpiCardProps) {
  const currentVal = metric?.current;
  const pctChange = metric?.percentageChange;

  // Format current value with strict NULL != 0 handling
  let formattedCurrent = "—";
  if (currentVal !== null && currentVal !== undefined) {
    if (format === "watchTime") {
      formattedCurrent = formatWatchTime(currentVal);
    } else {
      formattedCurrent = formatMetricValue(currentVal, format);
    }
  }

  // Format comparison delta
  const hasComparison = pctChange !== null && pctChange !== undefined;
  const isPositive = (pctChange ?? 0) > 0;
  const isNegative = (pctChange ?? 0) < 0;
  const isFlat = pctChange === 0;

  return (
    <div
      className="rounded-md border border-border-subtle bg-surface p-3 transition-colors hover:border-border-strong"
      title={tooltip}
    >
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{label}</span>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-1.5">
        <div className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl font-mono">
          {formattedCurrent}
        </div>

        {hasComparison && (
          <div
            className={`inline-flex items-center gap-0.5 text-xs font-mono font-medium ${
              isPositive
                ? "text-positive"
                : isNegative
                ? "text-negative"
                : "text-muted-foreground"
            }`}
            title={`Comparison to previous period`}
          >
            {isPositive && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
            {isNegative && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
            {isFlat && <Minus className="h-3 w-3" aria-hidden="true" />}
            <span>
              {isPositive ? "+" : ""}
              {pctChange?.toFixed(1)}%
            </span>
            <span className="sr-only">
              {isPositive ? "Increased by" : isNegative ? "Decreased by" : "Unchanged"} {pctChange?.toFixed(1)}% compared to previous period
            </span>
          </div>
        )}
      </div>

      {subtext && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate">{subtext}</p>
      )}
    </div>
  );
}
