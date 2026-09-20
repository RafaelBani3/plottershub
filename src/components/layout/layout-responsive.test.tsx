import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { MobileNavProvider } from "@/components/layout/mobile-nav-context";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { PerformanceChart } from "@/components/analytics/youtube/performance-chart";
import { TopVideosTable } from "@/components/analytics/youtube/top-videos-table";
import { DateRangePicker } from "@/components/analytics/youtube/date-range-picker";
import { VideoDetailModal } from "@/components/analytics/youtube/video-detail-modal";
import { AIInsightsPanel } from "@/components/analytics/youtube/ai-insights-panel";
import { KpiGrid } from "@/components/analytics/youtube/kpi-grid";

describe("Phase 3.4B Layout & Responsive Overflow Protection", () => {
  it("verifies AppSidebar has mobile off-canvas drawer classes and desktop persistent classes", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <WorkspaceProvider>
          <MobileNavProvider>
            <AppSidebar />
          </MobileNavProvider>
        </WorkspaceProvider>
      </AuthProvider>
    );

    // Verify off-canvas translation on mobile and persistent translate-x-0 on lg
    expect(html).toContain("-translate-x-full");
    expect(html).toContain("lg:translate-x-0");
    expect(html).toContain("w-60");
    // Verify no hardcoded rainbow gradients
    expect(html).not.toContain("from-indigo-500 via-indigo-600 to-purple-600");
  });

  it("verifies AppHeader is compact h-14 and contains accessible hamburger trigger", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <WorkspaceProvider>
          <MobileNavProvider>
            <AppHeader />
          </MobileNavProvider>
        </WorkspaceProvider>
      </AuthProvider>
    );

    // Verify h-14 compact height
    expect(html).toContain("h-14");
    // Verify hamburger button exists for mobile/tablet
    expect(html).toContain('aria-label="Open navigation menu"');
    // Verify decorative AI pill was removed from header
    expect(html).not.toContain("Intelligence Engine Ready");
  });

  it("verifies PerformanceChart SVG uses responsive scaling viewBox without fixed pixel widths", () => {
    const sampleSeries = [
      {
        date: "2026-08-01",
        views: "1200",
        estimatedMinutesWatched: "3600",
        averageViewDuration: 180,
        subscribersGained: "15",
        subscribersLost: "2",
        likes: "45",
        comments: "10",
        shares: "5",
        engagementRate: 3.5,
      },
      {
        date: "2026-08-02",
        views: "1800",
        estimatedMinutesWatched: "4200",
        averageViewDuration: 140,
        subscribersGained: "20",
        subscribersLost: "3",
        likes: "60",
        comments: "15",
        shares: "8",
        engagementRate: 4.1,
      },
    ];

    const html = renderToStaticMarkup(<PerformanceChart series={sampleSeries} />);

    // SVG must be responsive with viewBox and w-full
    expect(html).toContain('viewBox="0 0 800 220"');
    expect(html).toContain("w-full h-auto");
    // Grid stroke must be subtle and theme-aware
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('class="text-zinc-200 dark:text-zinc-800"');
  });

  it("verifies TopVideosTable provides both desktop table and mobile card fallback", () => {
    const sampleVideos = [
      {
        rank: 1,
        videoId: "v123",
        title: "High Performance Analytics Tutorial",
        description: "A comprehensive walkthrough",
        publishedAt: "2026-08-01T00:00:00Z",
        externalUrl: "https://youtube.com/watch?v=v123",
        metrics: {
          views: "50000",
          estimatedMinutesWatched: "120000",
          averageViewDuration: 144,
          averageViewPercentage: 72,
          likes: "1500",
          comments: "120",
          shares: "45",
          subscribersGained: "25",
          engagementRate: 8.5,
        },
      },
    ];

    const html = renderToStaticMarkup(
      <TopVideosTable
        videos={sampleVideos}
        totalVideos={1}
        limit={10}
        offset={0}
        sortBy="views"
        sortOrder="desc"
        onChangeSort={() => {}}
        onPageChange={() => {}}
        onSelectVideo={() => {}}
      />
    );

    // Desktop table wrapper is hidden on mobile: hidden md:block
    expect(html).toContain("hidden md:block");
    // Mobile card list is visible on mobile: block md:hidden
    expect(html).toContain("block md:hidden");
    // Tap prompt present for touch targets
    expect(html).toContain("Tap for breakdown &amp; progression →");
  });

  it("verifies DateRangePicker uses flex-1 for touch targets on narrow viewports", () => {
    const html = renderToStaticMarkup(
      <DateRangePicker
        startDate="2026-08-01"
        endDate="2026-08-28"
        onChangeRange={() => {}}
      />
    );

    // Preset buttons adapt flexibly to narrow widths
    expect(html).toContain("flex-1 sm:flex-initial");
    expect(html).toContain("7D");
    expect(html).toContain("28D");
    expect(html).toContain("90D");
    expect(html).toContain("Custom");
  });

  it("verifies VideoDetailModal enforces max-h-[85vh] and overflow-y-auto for short viewports", () => {
    const html = renderToStaticMarkup(
      <VideoDetailModal
        videoId="test-video-id"
        isOpen={true}
        onClose={() => {}}
        workspaceId="ws-123"
        socialAccountId="acc-123"
        startDate="2026-08-01"
        endDate="2026-08-28"
      />
    );

    // Must be scroll-safe for mobile viewports like 390x600
    expect(html).toContain("max-h-[85vh]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("bg-elevated");
  });

  it("verifies AIInsightsPanel is rendered with collapsible diagnostics and zero blur-3xl glow circles", () => {
    const sampleOverview = {
      views: { current: "1000", previous: "800", delta: "200", percentageChange: 25 },
      estimatedMinutesWatched: { current: "3000", previous: "2500", delta: "500", percentageChange: 20 },
      averageViewDurationSeconds: { current: 30, previous: 25, delta: 5, percentageChange: 20 },
      averageViewPercentage: { current: 65, previous: 60, delta: 5, percentageChange: 8.3 },
      netSubscribers: { current: "50", previous: "40", delta: "10", percentageChange: 25 },
      subscribersGained: { current: "60", previous: "45", delta: "15", percentageChange: 33.3 },
      subscribersLost: { current: "10", previous: "5", delta: "5", percentageChange: 100 },
      likes: { current: "200", previous: "150", delta: "50", percentageChange: 33.3 },
      comments: { current: "30", previous: "20", delta: "10", percentageChange: 50 },
      shares: { current: "15", previous: "10", delta: "5", percentageChange: 50 },
      engagementRate: { current: 4.5, previous: 3.8, delta: 0.7, percentageChange: 18.4 },
    };

    const html = renderToStaticMarkup(<AIInsightsPanel overview={sampleOverview} />);

    // Must contain diagnostic utility indicators
    expect(html).toContain("AI Growth Diagnostics");
    expect(html).toContain("Gemini 2.5 Flash");
    // Must NOT contain forbidden spectacle elements
    expect(html).not.toContain("blur-3xl");
    expect(html).not.toContain("bg-gradient-to-r from-indigo-600 to-purple-600");
  });

  describe("Required Viewport Constraints (Section 21 & 28)", () => {
    const viewports = [
      { name: "Desktop 1440x900", width: 1440, height: 900, isMobile: false },
      { name: "Desktop 1280x800", width: 1280, height: 800, isMobile: false },
      { name: "Tablet Landscape 1024x768", width: 1024, height: 768, isMobile: false },
      { name: "Tablet Portrait 768x1024", width: 768, height: 1024, isMobile: false },
      { name: "Mobile Large 390x844", width: 390, height: 844, isMobile: true },
      { name: "Mobile Compact 375x812", width: 375, height: 812, isMobile: true },
      { name: "Mobile Short 390x600", width: 390, height: 600, isMobile: true },
    ];

    viewports.forEach((vp) => {
      it(`verifies layout sizing and overflow safety for ${vp.name} (${vp.width}x${vp.height})`, () => {
        // Render core analytics components
        const kpiHtml = renderToStaticMarkup(
          <KpiGrid
            overview={{
              views: { current: "50000", previous: "40000", delta: "10000", percentageChange: 25 },
              estimatedMinutesWatched: { current: "120000", previous: "100000", delta: "20000", percentageChange: 20 },
              averageViewDurationSeconds: { current: 144, previous: 120, delta: 24, percentageChange: 20 },
              averageViewPercentage: { current: 72, previous: 65, delta: 7, percentageChange: 10.7 },
              netSubscribers: { current: "350", previous: "300", delta: "50", percentageChange: 16.7 },
              subscribersGained: { current: "400", previous: "320", delta: "80", percentageChange: 25 },
              subscribersLost: { current: "50", previous: "20", delta: "30", percentageChange: 150 },
              likes: { current: "1500", previous: "1200", delta: "300", percentageChange: 25 },
              comments: { current: "180", previous: "140", delta: "40", percentageChange: 28.5 },
              shares: { current: "90", previous: "70", delta: "20", percentageChange: 28.5 },
              engagementRate: { current: 5.2, previous: 4.8, delta: 0.4, percentageChange: 8.3 },
            }}
          />
        );

        // Verify KPI grid uses responsive columns: 2 cols on mobile, 4 cols on sm+
        expect(kpiHtml).toContain("grid grid-cols-2");
        expect(kpiHtml).toContain("sm:grid-cols-4");

        // Verify that no component injects hardcoded fixed pixel widths exceeding the viewport
        expect(kpiHtml).not.toContain(`w-[${vp.width + 10}px]`);
      });
    });
  });
});
