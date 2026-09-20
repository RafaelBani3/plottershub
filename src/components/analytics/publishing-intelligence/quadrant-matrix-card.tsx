"use client";

import * as React from "react";
import { Compass, Info } from "lucide-react";
import { ObservedPublishingWindow } from "@/modules/analytics/publishing-intelligence/publishing-intelligence.types";

interface QuadrantMatrixCardProps {
  quadrants: {
    q1: ObservedPublishingWindow[];
    q2: ObservedPublishingWindow[];
    q3: ObservedPublishingWindow[];
    q4: ObservedPublishingWindow[];
    unclassified: ObservedPublishingWindow[];
  };
}

export function QuadrantMatrixCard({ quadrants }: QuadrantMatrixCardProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Compass className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Descriptive Quadrant Matrix
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Empirical intersection of Catalog Consumption (X) and Launch Velocity (Y).
          </p>
        </div>
      </div>

      {/* 2x2 Descriptive Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Q3: Lower Consumption / Higher Velocity */}
        <div className="rounded border border-border-subtle bg-muted/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
              Quadrant 3
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {quadrants.q3.length} Window{quadrants.q3.length === 1 ? "" : "s"}
            </span>
          </div>
          <h4 className="text-xs font-semibold text-foreground">
            Lower Consumption / Higher Early Velocity
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Videos achieved above-baseline Day 1 velocity despite lower channel-wide consumption on that day.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quadrants.q3.length === 0 ? (
              <span className="text-[11px] text-muted-foreground italic">None observed</span>
            ) : (
              quadrants.q3.map((w) => (
                <span
                  key={w.id}
                  className="rounded border border-border-subtle bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {w.dayOfWeek.slice(0, 3)} {w.windowLabel}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Q1: Higher Consumption / Higher Velocity */}
        <div className="rounded border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
              Quadrant 1
            </span>
            <span className="text-[11px] font-medium text-primary">
              {quadrants.q1.length} Window{quadrants.q1.length === 1 ? "" : "s"}
            </span>
          </div>
          <h4 className="text-xs font-semibold text-foreground">
            Higher Consumption / Higher Early Velocity
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Coincides with both higher channel consumption and above-baseline Day 1 launch velocity.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quadrants.q1.length === 0 ? (
              <span className="text-[11px] text-muted-foreground italic">None observed</span>
            ) : (
              quadrants.q1.map((w) => (
                <span
                  key={w.id}
                  className="rounded border border-primary/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground shadow-xs"
                >
                  {w.dayOfWeek.slice(0, 3)} {w.windowLabel} ({w.performance.relativeDeltaPercent ? `+${w.performance.relativeDeltaPercent}%` : ""})
                </span>
              ))
            )}
          </div>
        </div>

        {/* Q4: Lower Consumption / Lower Velocity */}
        <div className="rounded border border-border-subtle bg-muted/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
              Quadrant 4
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {quadrants.q4.length} Window{quadrants.q4.length === 1 ? "" : "s"}
            </span>
          </div>
          <h4 className="text-xs font-semibold text-foreground">
            Lower Consumption / Lower Early Velocity
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Both lower channel-wide consumption and below-baseline early launch velocity.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quadrants.q4.length === 0 ? (
              <span className="text-[11px] text-muted-foreground italic">None observed</span>
            ) : (
              quadrants.q4.map((w) => (
                <span
                  key={w.id}
                  className="rounded border border-border-subtle bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {w.dayOfWeek.slice(0, 3)} {w.windowLabel}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Q2: Higher Consumption / Lower Velocity */}
        <div className="rounded border border-border-subtle bg-muted/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
              Quadrant 2
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {quadrants.q2.length} Window{quadrants.q2.length === 1 ? "" : "s"}
            </span>
          </div>
          <h4 className="text-xs font-semibold text-foreground">
            Higher Consumption / Lower Early Velocity
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Channel consumption is strong, but videos published here did not achieve above-baseline Day 1 velocity.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quadrants.q2.length === 0 ? (
              <span className="text-[11px] text-muted-foreground italic">None observed</span>
            ) : (
              quadrants.q2.map((w) => (
                <span
                  key={w.id}
                  className="rounded border border-border-subtle bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {w.dayOfWeek.slice(0, 3)} {w.windowLabel}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground border-t border-border-subtle">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          Quadrant classifications describe historical patterns. They are descriptive labels, not prescriptive recommendations or quality rankings.
        </span>
      </div>
    </div>
  );
}
