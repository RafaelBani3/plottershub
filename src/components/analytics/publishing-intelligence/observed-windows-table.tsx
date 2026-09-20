"use client";

import * as React from "react";
import { Clock, HelpCircle, Layers } from "lucide-react";
import {
  EvidenceStrength,
  ObservedPublishingWindow,
} from "@/modules/analytics/publishing-intelligence/publishing-intelligence.types";
import {
  EvidenceStrengthBadge,
  EvidenceStrengthLevel,
} from "@/components/ui/evidence-strength-badge";

interface ObservedWindowsTableProps {
  windows: ObservedPublishingWindow[];
  channelBaselineMedian: number;
  timezone: string;
}

/**
 * Maps internal EvidenceStrength enum to the UI EvidenceStrengthLevel.
 */
function mapEvidenceLevel(strength: EvidenceStrength): EvidenceStrengthLevel {
  switch (strength) {
    case "HIGH":
      return "Strong";
    case "MODERATE":
      return "Moderate";
    case "LOW":
      return "Limited";
    case "INSUFFICIENT":
    default:
      return "Insufficient";
  }
}

export function ObservedWindowsTable({
  windows,
  channelBaselineMedian,
  timezone,
}: ObservedWindowsTableProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface shadow-sm overflow-hidden">
      <div className="flex flex-col gap-1 p-4 border-b border-border-subtle sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Observed Publishing Windows
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Early launch performance by publishing window ({timezone}). Minimum 3 uploads required per window.
          </p>
        </div>
        <div className="rounded border border-border-subtle bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground">
          Channel Baseline:{" "}
          <span className="font-mono font-semibold">
            {channelBaselineMedian.toLocaleString()}
          </span>{" "}
          Day 1 views
        </div>
      </div>

      {windows.length === 0 ? (
        <div className="p-8 text-center space-y-2">
          <Clock className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="text-xs font-medium text-foreground">
            No Publishing Windows with Recorded Uploads
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No published videos matching this format and lookback period were found.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-muted/30 text-[11px] font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Window</th>
                <th className="px-3 py-2.5 text-center">Uploads</th>
                <th className="px-3 py-2.5 text-right">Day 1 Median</th>
                <th className="px-3 py-2.5 text-right">Day 2 Cumul.</th>
                <th className="px-3 py-2.5 text-right">Day 3 Cumul.</th>
                <th className="px-3 py-2.5 text-right">vs. Baseline</th>
                <th className="px-4 py-2.5 text-center">Evidence Strength</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {windows.map((w) => {
                const sampleSize = w.performance.sampleSize;
                const delta = w.performance.relativeDeltaPercent;
                const isPositive = delta !== null && delta > 0;
                const isNegative = delta !== null && delta < 0;

                return (
                  <tr
                    key={w.id}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                      <div>
                        <span>{w.dayOfWeek}</span>{" "}
                        <span className="font-mono text-muted-foreground">
                          {w.windowLabel}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-normal">
                        {w.quadrantLabel}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-center font-mono text-muted-foreground whitespace-nowrap">
                      {w.uploadCount}
                      {sampleSize < w.uploadCount && (
                        <span
                          className="ml-1 text-[10px] text-amber-600 dark:text-amber-400"
                          title={`${w.uploadCount - sampleSize} upload(s) currently maturing`}
                        >
                          *
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                      {w.performance.day1ViewsMedian !== null ? (
                        w.performance.day1ViewsMedian.toLocaleString()
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">
                      {w.performance.day2CumulativeViewsMedian !== null ? (
                        w.performance.day2CumulativeViewsMedian.toLocaleString()
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">
                      {w.performance.day3CumulativeViewsMedian !== null ? (
                        w.performance.day3CumulativeViewsMedian.toLocaleString()
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                      {delta !== null ? (
                        <span
                          className={`font-semibold ${
                            isPositive
                              ? "text-emerald-700 dark:text-emerald-400"
                              : isNegative
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {delta > 0 ? `+${delta}%` : `${delta}%`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <EvidenceStrengthBadge
                        level={mapEvidenceLevel(w.evidenceStrength)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-[11px] text-muted-foreground border-t border-border-subtle bg-muted/10">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            * Asterisks denote recent uploads still maturing within the 48–72h analytics lag window.
          </span>
        </div>
        <div>
          Day 1/2/3 values reflect calendar observation days of release.
        </div>
      </div>
    </div>
  );
}
