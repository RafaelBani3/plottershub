import * as React from "react";
import { DailyTrendPoint } from "@/modules/social/analytics/dashboard.types";
import { formatMetricValue, formatWatchTime } from "./youtube-formatters";

export type TrendMetricKey = "views" | "estimatedMinutesWatched" | "subscribers" | "engagementRate";

export interface PerformanceChartProps {
  series: DailyTrendPoint[];
}

export function PerformanceChart({ series }: PerformanceChartProps) {
  const [selectedMetric, setSelectedMetric] = React.useState<TrendMetricKey>("views");
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  if (!series || series.length === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-surface p-8 text-center text-xs text-muted-foreground">
        No daily trend points available for the selected period.
      </div>
    );
  }

  // Extract values based on metric selection
  const dataPoints = series.map((pt, idx) => {
    let rawVal: number | null = null;
    let label = "";

    if (selectedMetric === "views") {
      rawVal = pt.views !== null ? parseInt(pt.views, 10) : null;
      label = formatMetricValue(rawVal, "integer");
    } else if (selectedMetric === "estimatedMinutesWatched") {
      rawVal = pt.estimatedMinutesWatched !== null ? parseFloat(pt.estimatedMinutesWatched) : null;
      label = formatWatchTime(rawVal);
    } else if (selectedMetric === "subscribers") {
      const gained = pt.subscribersGained !== null ? parseInt(pt.subscribersGained, 10) : 0;
      const lost = pt.subscribersLost !== null ? parseInt(pt.subscribersLost, 10) : 0;
      if (pt.subscribersGained !== null || pt.subscribersLost !== null) {
        rawVal = gained - lost;
        label = `${rawVal >= 0 ? "+" : ""}${rawVal}`;
      } else {
        rawVal = null;
        label = "—";
      }
    } else if (selectedMetric === "engagementRate") {
      rawVal = pt.engagementRate !== null ? pt.engagementRate : null;
      label = rawVal !== null ? `${rawVal.toFixed(2)}%` : "—";
    }

    return {
      index: idx,
      date: pt.date,
      value: rawVal,
      displayLabel: label,
    };
  });

  // Calculate SVG dimensions
  const width = 800;
  const height = 220;
  const paddingX = 40;
  const paddingY = 20;

  const validValues = dataPoints.map((d) => d.value).filter((v): v is number => v !== null);
  const minVal = validValues.length > 0 ? Math.min(...validValues, 0) : 0;
  const maxVal = validValues.length > 0 ? Math.max(...validValues, 10) : 10;
  const range = maxVal - minVal || 1;

  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  // Map data point to SVG x,y coordinates
  const getCoordinates = (index: number, val: number | null) => {
    const x = paddingX + (index / Math.max(series.length - 1, 1)) * chartWidth;
    if (val === null) return { x, y: null };
    const y = height - paddingY - ((val - minVal) / range) * chartHeight;
    return { x, y };
  };

  // Build SVG polyline paths respecting null data gaps
  const segments: string[] = [];
  let currentSegment: string[] = [];

  dataPoints.forEach((pt) => {
    const { x, y } = getCoordinates(pt.index, pt.value);
    if (y !== null) {
      currentSegment.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    } else {
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(" "));
        currentSegment = [];
      }
    }
  });
  if (currentSegment.length > 0) {
    segments.push(currentSegment.join(" "));
  }

  // Active hover point
  const activePoint = hoverIndex !== null ? dataPoints[hoverIndex] : null;
  const activeCoord = activePoint ? getCoordinates(activePoint.index, activePoint.value) : null;

  return (
    <section
      aria-label="Daily Performance Trend"
      className="rounded-md border border-border-subtle bg-surface p-3.5 sm:p-4 space-y-3"
    >
      {/* Chart Header & Metric Selectors */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Daily Performance Trends</h2>
          <p className="text-[11px] text-muted-foreground">
            Daily historical progression over the selected period
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Select trend metric"
          className="flex flex-wrap sm:flex-nowrap items-center gap-1 rounded border border-border-subtle bg-elevated p-0.5 text-xs"
        >
          <button
            role="tab"
            aria-selected={selectedMetric === "views"}
            onClick={() => setSelectedMetric("views")}
            className={`flex-1 sm:flex-initial rounded px-2.5 py-1 text-xs font-medium transition-colors flex items-center justify-center whitespace-nowrap ${
              selectedMetric === "views"
                ? "bg-surface text-foreground font-semibold border border-border-strong"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Views
          </button>
          <button
            role="tab"
            aria-selected={selectedMetric === "estimatedMinutesWatched"}
            onClick={() => setSelectedMetric("estimatedMinutesWatched")}
            className={`flex-1 sm:flex-initial rounded px-2.5 py-1 text-xs font-medium transition-colors flex items-center justify-center whitespace-nowrap ${
              selectedMetric === "estimatedMinutesWatched"
                ? "bg-surface text-foreground font-semibold border border-border-strong"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Watch Time
          </button>
          <button
            role="tab"
            aria-selected={selectedMetric === "subscribers"}
            onClick={() => setSelectedMetric("subscribers")}
            className={`flex-1 sm:flex-initial rounded px-2.5 py-1 text-xs font-medium transition-colors flex items-center justify-center whitespace-nowrap ${
              selectedMetric === "subscribers"
                ? "bg-surface text-foreground font-semibold border border-border-strong"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Subscribers
          </button>
          <button
            role="tab"
            aria-selected={selectedMetric === "engagementRate"}
            onClick={() => setSelectedMetric("engagementRate")}
            className={`flex-1 sm:flex-initial rounded px-2.5 py-1 text-xs font-medium transition-colors flex items-center justify-center whitespace-nowrap ${
              selectedMetric === "engagementRate"
                ? "bg-surface text-foreground font-semibold border border-border-strong"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Engagement %
          </button>
        </div>
      </div>

      {/* Responsive SVG Chart Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          role="img"
          aria-label={`Chart displaying daily ${selectedMetric} over ${series.length} days`}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* Neutral Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="currentColor"
            className="text-zinc-200 dark:text-zinc-800"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={height / 2}
            x2={width - paddingX}
            y2={height / 2}
            stroke="currentColor"
            className="text-zinc-200 dark:text-zinc-800"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            stroke="currentColor"
            className="text-zinc-300 dark:text-zinc-700"
          />

          {/* Render continuous or disjoint segments */}
          {segments.map((points, i) => (
            <polyline
              key={i}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          ))}

          {/* Individual Interactive Markers */}
          {dataPoints.map((pt) => {
            const { x, y } = getCoordinates(pt.index, pt.value);
            if (y === null) return null;
            const isHovered = hoverIndex === pt.index;

            return (
              <g key={pt.index}>
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 4.5 : 2}
                  className={`transition-all duration-150 ${
                    isHovered ? "fill-foreground stroke-blue-500 stroke-2" : "fill-blue-400"
                  }`}
                />
                {/* Touch/Mouse Hitbox */}
                <rect
                  x={x - chartWidth / (series.length * 2)}
                  y={0}
                  width={chartWidth / Math.max(series.length, 1)}
                  height={height}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIndex(pt.index)}
                  onTouchStart={() => setHoverIndex(pt.index)}
                  onClick={() => setHoverIndex(pt.index)}
                />
              </g>
            );
          })}

          {/* Hover Vertical Guide Line */}
          {activeCoord && activeCoord.y !== null && (
            <line
              x1={activeCoord.x}
              y1={paddingY}
              x2={activeCoord.x}
              y2={height - paddingY}
              stroke="currentColor"
              className="text-zinc-400 dark:text-zinc-500"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}
        </svg>

        {/* Dynamic Interactive Tooltip */}
        {activePoint && (
          <div className="mt-2 flex items-center justify-between rounded border border-border-strong bg-elevated px-3 py-1.5 text-xs">
            <div className="font-mono text-muted-foreground text-[11px]">Date: {activePoint.date}</div>
            <div className="flex items-center gap-1.5">
              <span className="capitalize text-muted-foreground text-[11px]">
                {selectedMetric === "estimatedMinutesWatched" ? "Watch Time" : selectedMetric}:
              </span>
              <span className="font-semibold text-foreground font-mono">{activePoint.displayLabel}</span>
            </div>
          </div>
        )}
      </div>

      {/* X-Axis Date Range Indicators */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1">
        <span>{series[0]?.date}</span>
        {series.length > 2 && (
          <span>{series[Math.floor(series.length / 2)]?.date}</span>
        )}
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </section>
  );
}
