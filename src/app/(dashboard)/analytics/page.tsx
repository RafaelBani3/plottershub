"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import {
  YouTubeDashboardHeader,
  FreshnessIndicator,
  DataAvailabilityBanner,
  KpiGrid,
  PerformanceChart,
  BreakdownGrid,
  TopVideosTable,
  VideoDetailModal,
  AnalyticsSkeleton,
  NoAccountState,
  NoDataState,
  ErrorState,
  useYouTubeAnalytics,
  AIInsightsPanel,
} from "@/components/analytics/youtube";
import { PublishingIntelligenceView } from "@/components/analytics/publishing-intelligence";

export default function YouTubeAnalyticsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentWorkspace, isLoading: isWorkspaceLoading } = useWorkspace();

  const urlAccountId = searchParams.get("accountId");
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = React.useState<"overview" | "publishing-intelligence">(
    tabParam === "publishing-intelligence" ? "publishing-intelligence" : "overview"
  );
  const [selectedVideoId, setSelectedVideoId] = React.useState<string | null>(null);

  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    isAccountsLoading,
    startDate,
    endDate,
    setDateRange,
    summary,
    meta,
    isSummaryLoading,
    summaryError,
    audience,
    geography,
    trafficSources,
    devices,
    isSecondaryLoading,
    topVideosData,
    isTopVideosLoading,
    sortBy,
    sortOrder,
    topVideosOffset,
    topVideosLimit,
    setSorting,
    setTopVideosOffset,
    refreshAll,
  } = useYouTubeAnalytics(currentWorkspace?.id, urlAccountId);

  // Sync selected account with URL query parameter
  const handleSelectAccount = React.useCallback(
    (accountId: string) => {
      setSelectedAccountId(accountId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("accountId", accountId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams, setSelectedAccountId]
  );

  // 1. Workspace or initial accounts loading
  if (isWorkspaceLoading || isAccountsLoading) {
    return <AnalyticsSkeleton />;
  }

  // 2. Zero connected YouTube accounts
  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            YouTube Analytics
          </h1>
          <p className="text-xs text-muted-foreground">
            Channel audience demographics, aggregated video reach, and growth trends
          </p>
        </div>
        <NoAccountState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Dashboard Controls Header */}
      <YouTubeDashboardHeader
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={handleSelectAccount}
        startDate={startDate}
        endDate={endDate}
        onChangeDateRange={setDateRange}
        onRefresh={refreshAll}
        isRefreshing={isSummaryLoading || isSecondaryLoading}
      />

      {/* View Switcher: Channel Overview vs Publishing Intelligence */}
      <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "overview"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "border border-border-subtle bg-surface text-muted-foreground hover:bg-hover hover:text-foreground"
          }`}
        >
          <span>Channel Overview</span>
        </button>
        <button
          onClick={() => setActiveTab("publishing-intelligence")}
          className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "publishing-intelligence"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "border border-border-subtle bg-surface text-muted-foreground hover:bg-hover hover:text-foreground"
          }`}
        >
          <span>Publishing Intelligence</span>
        </button>
      </div>

      {activeTab === "publishing-intelligence" ? (
        selectedAccountId ? (
          <PublishingIntelligenceView socialAccountId={selectedAccountId} />
        ) : (
          <NoAccountState />
        )
      ) : (
        <>
          {/* 2. Error boundary / fetch failure */}
          {summaryError ? (
            <ErrorState message={summaryError} onRetry={refreshAll} />
          ) : isSummaryLoading && !summary ? (
            <AnalyticsSkeleton />
          ) : (
            <>
              {/* 3. Freshness & Observation Window Status */}
              <FreshnessIndicator meta={meta} />

          {/* 4. Data Availability Banner (COMPLETE, PARTIAL_DATA, INSUFFICIENT_DATA, NO_DATA) */}
          {meta?.dataAvailability && (
            <DataAvailabilityBanner state={meta.dataAvailability} />
          )}

          {meta?.dataAvailability === "NO_DATA" ? (
            <NoDataState />
          ) : (
            <>
              {/* 5. Core KPI Overview Grid */}
              <KpiGrid overview={summary?.overview} />

              {/* 6. Daily Performance Trends Chart */}
              {summary?.trends?.series && (
                <PerformanceChart series={summary.trends.series} />
              )}

              {/* 7. AI Growth Diagnosis & Strategic Recommendations */}
              <AIInsightsPanel overview={summary?.overview} />

              {/* 8. Audience & Distribution Breakdowns */}
              <BreakdownGrid
                audience={audience}
                geography={geography}
                trafficSources={trafficSources}
                devices={devices}
                isLoadingSecondary={isSecondaryLoading}
              />

              {/* 8. Top Performing Videos Table */}
              {topVideosData && (
                <TopVideosTable
                  videos={topVideosData.videos}
                  totalVideos={topVideosData.pagination.total}
                  limit={topVideosLimit}
                  offset={topVideosOffset}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onChangeSort={setSorting}
                  onPageChange={setTopVideosOffset}
                  onSelectVideo={(id) => setSelectedVideoId(id)}
                  isLoading={isTopVideosLoading}
                />
              )}
            </>
          )}
        </>
      )}
    </>
  )}

      {/* 9. Video Detail Inspection Modal */}
      {selectedVideoId && currentWorkspace?.id && selectedAccountId && (
        <VideoDetailModal
          videoId={selectedVideoId}
          isOpen={Boolean(selectedVideoId)}
          onClose={() => setSelectedVideoId(null)}
          workspaceId={currentWorkspace.id}
          socialAccountId={selectedAccountId}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  );
}
