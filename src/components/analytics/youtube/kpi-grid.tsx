import * as React from "react";
import { DashboardOverviewData } from "@/modules/social/analytics/dashboard.types";
import { KpiCard } from "./kpi-card";

export interface KpiGridProps {
  overview?: DashboardOverviewData | null;
}

export function KpiGrid({ overview }: KpiGridProps) {
  if (!overview) return null;

  const totalSubscribersFormatted = overview.lifetimeStats?.totalSubscribers
    ? parseInt(overview.lifetimeStats.totalSubscribers, 10).toLocaleString()
    : null;

  const totalViewsLifetimeFormatted = overview.lifetimeStats?.totalViews
    ? parseInt(overview.lifetimeStats.totalViews, 10).toLocaleString()
    : null;

  const totalVideosLifetimeFormatted = overview.lifetimeStats?.totalVideos
    ? parseInt(overview.lifetimeStats.totalVideos, 10).toLocaleString()
    : null;

  return (
    <section aria-label="Key Performance Indicators" className="space-y-2.5">
      {/* Live Channel Lifetime Stats Bar */}
      {totalSubscribersFormatted && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-border-subtle bg-surface px-3 py-2">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-positive"></span>
            </span>
            <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-positive">
              Channel Lifetime
            </span>
            <span className="h-3 w-px bg-border-subtle" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground">Subscribers:</span>
              <span className="text-sm font-semibold text-foreground font-mono">
                {totalSubscribersFormatted}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono text-[11px]">
            {totalViewsLifetimeFormatted && (
              <div>
                Views:{" "}
                <span className="font-medium text-foreground">
                  {totalViewsLifetimeFormatted}
                </span>
              </div>
            )}
            {totalVideosLifetimeFormatted && (
              <div>
                Uploads:{" "}
                <span className="font-medium text-foreground">
                  {totalVideosLifetimeFormatted}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {/* Row 1: Core Viewership & Retention */}
        <KpiCard
          label="Total Views"
          metric={overview.views}
          format="integer"
          subtext="Channel video views"
        />
        <KpiCard
          label="Watch Time"
          metric={overview.estimatedMinutesWatched}
          format="watchTime"
          subtext="Estimated watch duration"
        />
        <KpiCard
          label="Avg View Duration"
          metric={overview.averageViewDurationSeconds}
          format="duration"
          subtext="Average watch length (mm:ss)"
        />
        <KpiCard
          label="Avg View Percentage"
          metric={overview.averageViewPercentage}
          format="percent"
          subtext="Audience retention percentage"
        />

        {/* Row 2: Audience Engagement & Growth */}
        <KpiCard
          label="Net Subscribers"
          metric={overview.netSubscribers}
          format="integer"
          subtext={`+${overview.subscribersGained?.current ?? "0"} / -${overview.subscribersLost?.current ?? "0"}`}
        />
        <KpiCard
          label="Likes"
          metric={overview.likes}
          format="integer"
          subtext="User likes on videos"
        />
        <KpiCard
          label="Comments"
          metric={overview.comments}
          format="integer"
          subtext="User comments received"
        />
        <KpiCard
          label="Shares"
          metric={overview.shares}
          format="integer"
          subtext="Video share events"
        />
      </div>

      {overview.engagementRate?.current !== null && (
        <div className="flex items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-xs text-muted-foreground">
          <span>Overall Channel Engagement Rate:</span>
          <span className="font-semibold text-foreground font-mono">
            {overview.engagementRate.current.toFixed(2)}%
          </span>
        </div>
      )}
    </section>
  );
}
