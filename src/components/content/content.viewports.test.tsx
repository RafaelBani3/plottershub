import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ContentHeader,
  ContentFilterBar,
  ContentTableView,
  ContentCardGrid,
  ContentDetailSheet,
  ContentEmptyState,
  DEFAULT_FILTER_STATE,
  ContentListItemDTO,
} from "./index";

const mockItems: ContentListItemDTO[] = [
  {
    id: "c_1",
    contentId: "root_1",
    title: "Awesome YouTube Video Tutorial #shorts",
    description: "Learn building web apps fast",
    status: "PUBLISHED",
    publishedAt: "2026-03-01T12:00:00Z",
    createdAt: "2026-03-01T12:00:00Z",
    externalContentId: "yt_123",
    externalUrl: "https://youtube.com/watch?v=yt_123",
    socialAccountId: "sa_1",
    socialAccountName: "Dev Channel",
    contentType: "SHORTS",
    classificationConfidence: "MODERATE",
    classificationSource: "HEURISTIC",
    classificationRationale: "Eligible duration with explicit #shorts tag",
    privacyStatus: "PUBLIC",
    durationSeconds: 45,
    formattedDuration: "00:45",
    thumbnails: {
      default: { url: "https://example.com/thumb.jpg" },
      medium: { url: "https://example.com/thumb-med.jpg" },
    },
    metrics: {
      views: "5200",
      likes: "350",
      comments: "24",
      engagementRate: 0.0719,
      capturedAt: "2026-03-01T12:00:00Z",
    },
    metadata: {
      durationSeconds: 45,
      durationFormatted: "00:45",
      contentType: "SHORTS",
      classificationConfidence: "MODERATE",
      classificationSource: "HEURISTIC",
      classificationRationale: "Eligible duration with explicit #shorts tag",
      privacyStatus: "public",
      uploadStatus: "uploaded",
      license: "youtube",
      embeddable: true,
      madeForKids: false,
      thumbnails: {
        default: { url: "https://example.com/thumb.jpg" },
        medium: { url: "https://example.com/thumb-med.jpg" },
      },
      tags: ["tech", "coding"],
      categoryId: "28",
    },
    socialAccount: {
      id: "sa_1",
      username: "devchannel",
      displayName: "Dev Channel",
      avatarUrl: "https://example.com/avatar.jpg",
      platformCode: "YOUTUBE",
    },
  },
  {
    id: "c_2",
    contentId: "root_2",
    title: "Full 1-Hour Documentary on Space Exploration",
    description: "Deep dive into cosmos",
    status: "PUBLISHED",
    publishedAt: "2026-02-15T15:30:00Z",
    createdAt: "2026-02-15T15:30:00Z",
    externalContentId: "yt_456",
    externalUrl: "https://youtube.com/watch?v=yt_456",
    socialAccountId: "sa_1",
    socialAccountName: "Dev Channel",
    contentType: "LONG_FORM",
    classificationConfidence: "HIGH",
    classificationSource: "AUTHORITATIVE",
    classificationRationale: "Duration exceeds 180 seconds",
    privacyStatus: "PUBLIC",
    durationSeconds: 3600,
    formattedDuration: "01:00:00",
    metrics: {
      views: "85000",
      likes: "4200",
      comments: "610",
      engagementRate: 0.056,
      capturedAt: "2026-02-15T15:30:00Z",
    },
    metadata: null,
    socialAccount: {
      id: "sa_1",
      username: "devchannel",
      displayName: "Dev Channel",
      avatarUrl: "https://example.com/avatar.jpg",
      platformCode: "YOUTUBE",
    },
  },
];

describe("Content UI Components & Viewports (Phase 3.4C)", () => {
  const VIEWPORTS = [
    { name: "Desktop Large", width: 1440, height: 900 },
    { name: "Desktop Standard", width: 1280, height: 800 },
    { name: "Laptop / Small Desktop", width: 1024, height: 768 },
    { name: "Tablet Portrait", width: 768, height: 1024 },
    { name: "Mobile Large (iPhone 14 Pro)", width: 390, height: 844 },
    { name: "Mobile Medium (iPhone SE)", width: 375, height: 812 },
    { name: "Mobile Landscape / Compact", width: 390, height: 600 },
  ];

  VIEWPORTS.forEach(({ name, width, height }) => {
    it(`renders content views cleanly under viewport: ${name} (${width}x${height})`, () => {
      // 1. Render Header
      const headerHtml = renderToStaticMarkup(
        <ContentHeader
          accounts={[{ id: "sa_1", username: "dev", displayName: "Dev Channel", platformCode: "YOUTUBE" } as any]}
          selectedAccountId="sa_1"
          onSelectAccount={() => {}}
          onSync={async () => {}}
          isSyncing={false}
          totalCount={2}
          summary={{
            total: 2,
            totalVideos: 2,
            totalViews: "90200",
            longForm: 1,
            longFormCount: 1,
            shorts: 1,
            shortsCount: 1,
            liveStream: 0,
            liveCount: 0,
            unknown: 0,
            unknownCount: 0,
            lastSyncedAt: null,
          }}
        />
      );
      expect(headerHtml).toContain("Content Management");
      expect(headerHtml).toContain("Sync from YouTube");
      expect(headerHtml).toContain("Dev Channel");

      // 2. Render Filter Bar
      const filterHtml = renderToStaticMarkup(
        <ContentFilterBar
          filterState={DEFAULT_FILTER_STATE}
          onChange={() => {}}
          onReset={() => {}}
          isFiltered={false}
        />
      );
      expect(filterHtml).toContain("Search by title or description...");
      expect(filterHtml).toContain("All Formats");
      expect(filterHtml).toContain("Shorts");
      expect(filterHtml).toContain("Long-form");

      // 3. Render Desktop Table View
      const tableHtml = renderToStaticMarkup(
        <ContentTableView
          items={mockItems}
          onSelectVideo={() => {}}
          page={1}
          pageSize={20}
          total={2}
          onPageChange={() => {}}
        />
      );
      expect(tableHtml).toContain("Awesome YouTube Video Tutorial #shorts");
      expect(tableHtml).toContain("00:45");
      expect(tableHtml).toContain("01:00:00");
      expect(tableHtml).toContain("Shorts");
      expect(tableHtml).toContain("Long-form");

      // 4. Render Mobile Card Grid
      const cardHtml = renderToStaticMarkup(
        <ContentCardGrid
          items={mockItems}
          onSelectVideo={() => {}}
          page={1}
          pageSize={20}
          total={2}
          onPageChange={() => {}}
        />
      );
      expect(cardHtml).toContain("Awesome YouTube Video Tutorial #shorts");
      expect(cardHtml).toContain("00:45");
      expect(cardHtml).toContain("View Details");

      // 5. Render Detail Sheet
      const sheetHtml = renderToStaticMarkup(
        <ContentDetailSheet
          item={mockItems[0]}
          open={true}
          onOpenChange={() => {}}
        />
      );
      expect(sheetHtml).toContain("Video Details");
      expect(sheetHtml).toContain("Eligible duration with explicit #shorts tag");
      expect(sheetHtml).toContain("Modify title, description, tags, privacy, or COPPA settings.");
    });
  });

  it("renders empty states cleanly", () => {
    const emptyHtml = renderToStaticMarkup(<ContentEmptyState type="no_accounts" />);
    expect(emptyHtml).toContain("No YouTube Channel Connected");

    const noVideosHtml = renderToStaticMarkup(<ContentEmptyState type="no_videos" onSync={() => {}} />);
    expect(noVideosHtml).toContain("No Videos Synced Yet");

    const noSearchHtml = renderToStaticMarkup(<ContentEmptyState type="no_search_results" onResetFilters={() => {}} />);
    expect(noSearchHtml).toContain("No Videos Found");
  });
});
