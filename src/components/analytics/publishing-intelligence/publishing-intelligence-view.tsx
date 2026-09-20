"use client";

import * as React from "react";
import {
  Clock,
  Sparkles,
  AlertCircle,
  RotateCw,
  Film,
  Zap,
  Globe,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PublishingIntelligenceDTO,
  PublishingIntelligenceFormat,
} from "@/modules/analytics/publishing-intelligence/publishing-intelligence.types";
import { ConsumptionPatternCard } from "./consumption-pattern-card";
import { ContentSupplyCard } from "./content-supply-card";
import { ObservedWindowsTable } from "./observed-windows-table";
import { QuadrantMatrixCard } from "./quadrant-matrix-card";

interface PublishingIntelligenceViewProps {
  socialAccountId: string;
}

export function PublishingIntelligenceView({
  socialAccountId,
}: PublishingIntelligenceViewProps) {
  const [format, setFormat] = React.useState<PublishingIntelligenceFormat>("LONG_FORM");
  const [lookbackDays, setLookbackDays] = React.useState<number>(90);
  const [timezone, setTimezone] = React.useState<string>("UTC");

  const [data, setData] = React.useState<PublishingIntelligenceDTO | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  // Initialize browser timezone if available
  React.useEffect(() => {
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (userTz) setTimezone(userTz);
    } catch {
      // Fallback UTC
    }
  }, []);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        socialAccountId,
        format,
        lookbackDays: lookbackDays.toString(),
        publishingTimezone: timezone,
      });

      const res = await fetch(
        `/api/analytics/publishing-intelligence?${params.toString()}`
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.error || `Failed to fetch publishing intelligence (HTTP ${res.status})`
        );
      }
      const json: PublishingIntelligenceDTO = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load publishing intelligence data.");
    } finally {
      setIsLoading(false);
    }
  }, [socialAccountId, format, lookbackDays, timezone]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              Publishing Intelligence
            </h2>
            <span className="rounded-md border border-border-subtle bg-muted/40 px-2 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
              Descriptive Analytics
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Empirical historical analysis of audience consumption, content supply, and early launch velocity.
          </p>
        </div>

        {/* Filters & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Format Selector */}
          <div className="flex items-center rounded-md border border-border-subtle bg-muted/30 p-0.5">
            <button
              onClick={() => setFormat("LONG_FORM")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                format === "LONG_FORM"
                  ? "bg-surface text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Film className="h-3 w-3" />
              <span>Long-form</span>
            </button>
            <button
              onClick={() => setFormat("SHORTS")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                format === "SHORTS"
                  ? "bg-surface text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="h-3 w-3" />
              <span>Shorts</span>
            </button>
          </div>

          {/* Lookback Selector */}
          <select
            value={lookbackDays}
            onChange={(e) => setLookbackDays(Number(e.target.value))}
            className="h-8 rounded-md border border-border-subtle bg-surface px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
          >
            <option value={30}>Last 30 Days</option>
            <option value={60}>Last 60 Days</option>
            <option value={90}>Last 90 Days</option>
            <option value={180}>Last 180 Days</option>
          </select>

          {/* Timezone Indicator */}
          <div className="flex h-8 items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2.5 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            <span className="max-w-[120px] truncate">{timezone}</span>
          </div>

          {/* Refresh Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchData}
            disabled={isLoading}
            className="h-8 gap-1.5 px-3 text-xs border-border-subtle bg-surface"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* 2. Non-Causal Disclaimer & Freshness Banner */}
      <div className="rounded-md border border-border-subtle bg-muted/20 p-3 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Clock className="h-3.5 w-3.5 text-primary" />
          <span>Historical Pattern Notice & Analytics Lag Boundary</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          These windows describe historical patterns in your channel data. They are not guarantees of future performance.
          YouTube Analytics has an official 48–72h reporting lag; videos released in the last 2 days are excluded from launch baselines until their observation cycles complete.
        </p>
      </div>

      {/* 3. Loading State */}
      {isLoading && !data && (
        <div className="space-y-4">
          <div className="h-48 rounded-lg border border-border-subtle bg-surface animate-pulse" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-64 rounded-lg border border-border-subtle bg-surface animate-pulse" />
            <div className="h-64 rounded-lg border border-border-subtle bg-surface animate-pulse" />
          </div>
        </div>
      )}

      {/* 4. Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="h-4 w-4" />
            <span>Unable to compute publishing intelligence</span>
          </div>
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={fetchData} className="h-7 text-xs">
            Try Again
          </Button>
        </div>
      )}

      {/* 5. Content Data View */}
      {data && (
        <div className="space-y-6">
          {/* Signals A & B: Consumption vs Content Supply */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ConsumptionPatternCard
              days={data.consumptionPattern.daysOfWeek}
              channelDailyMeanViews={data.consumptionPattern.channelDailyMeanViews}
              channelDailyMeanWatchTimeMinutes={
                data.consumptionPattern.channelDailyMeanWatchTimeMinutes
              }
            />

            <ContentSupplyCard
              totalUploads={data.contentSupply.totalUploads}
              buckets={data.contentSupply.buckets}
              mostActivePublishingDay={data.contentSupply.mostActivePublishingDay}
              timezone={data.meta.publishingTimezone}
            />
          </div>

          {/* Signal C: Observed Publishing Windows Table */}
          <ObservedWindowsTable
            windows={data.observedWindows}
            channelBaselineMedian={data.meta.channelBaselineDay1ViewsMedian}
            timezone={data.meta.publishingTimezone}
          />

          {/* Descriptive Quadrant Matrix */}
          <QuadrantMatrixCard quadrants={data.quadrants} />

          {/* Structured Empirical Narrative Cards */}
          <div className="rounded-lg border border-border-subtle bg-surface p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Empirical Narrative Observations
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {data.narrativeObservations.map((obs, idx) => (
                <div
                  key={idx}
                  className="rounded border border-border-subtle bg-muted/10 p-3 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-mono uppercase font-semibold ${
                        obs.type === "OBSERVED"
                          ? "text-blue-700 dark:text-blue-400"
                          : obs.type === "DERIVED"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {obs.type}
                    </span>
                  </div>
                  <h4 className="font-semibold text-foreground">{obs.title}</h4>
                  <p className="text-muted-foreground leading-relaxed text-[11px]">
                    {obs.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Methodology & Technical Boundaries Accordion/Section */}
          <div className="rounded-lg border border-border-subtle bg-muted/10 p-4 text-xs text-muted-foreground space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>Technical Methodology & Guardrails</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px] leading-relaxed">
              {data.methodologyNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
