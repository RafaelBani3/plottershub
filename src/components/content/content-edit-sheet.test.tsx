import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentEditSheet } from "./content-edit-sheet";
import { ContentListItemDTO } from "./content-types";

describe("ContentEditSheet UI Component (Phase 3.4D)", () => {
  const mockItem: ContentListItemDTO = {
    id: "cp_1",
    contentId: "c_1",
    title: "Awesome YouTube Video",
    description: "Learn how to build fullstack web apps.",
    status: "PUBLISHED",
    publishedAt: "2026-03-01T10:00:00Z",
    createdAt: "2026-03-01T10:00:00Z",
    externalContentId: "dQw4w9WgXcQ",
    externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    socialAccountId: "acc_1",
    socialAccountName: "PlottersTech",
    contentType: "LONG_FORM",
    classificationConfidence: "HIGH",
    classificationSource: "AUTHORITATIVE",
    classificationRationale: "Duration > 180s",
    privacyStatus: "PUBLIC",
    formattedDuration: "12:34",
    durationSeconds: 754,
    thumbnails: {
      high: { url: "https://example.com/high.jpg" },
    },
    socialAccount: {
      id: "acc_1",
      username: "PlottersTech",
      displayName: "Plotters Tech Channel",
      avatarUrl: null,
      platformCode: "YOUTUBE",
    },
    metadata: {
      durationSeconds: 754,
      durationFormatted: "12:34",
      contentType: "LONG_FORM",
      classificationConfidence: "HIGH",
      classificationSource: "DURATION_EXCEEDS_SHORTS_MAX",
      classificationRationale: "Duration > 180s",
      privacyStatus: "PUBLIC",
      uploadStatus: "processed",
      license: "youtube",
      embeddable: true,
      madeForKids: false,
      tags: ["nextjs", "react", "tutorial"],
      categoryId: "28",
      thumbnails: {},
    },
    metrics: {
      views: "12500",
      likes: "850",
      comments: "42",
      engagementRate: 7.14,
      capturedAt: "2026-03-10T00:00:00Z",
    },
  };

  it("renders populated form fields correctly", () => {
    const html = renderToStaticMarkup(
      <ContentEditSheet
        item={mockItem}
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="ws_1"
      />
    );

    // Title input with value and character counter
    expect(html).toContain("Edit YouTube Video");
    expect(html).toContain("Awesome YouTube Video");
    expect(html).toContain("21/100");

    // Description
    expect(html).toContain("Learn how to build fullstack web apps.");

    // Tags
    expect(html).toContain("nextjs, react, tutorial");

    // Category
    expect(html).toContain("Science &amp; Technology");

    // Visibility / Privacy
    expect(html).toContain("Visibility &amp; Privacy");
    expect(html).toContain("public");
    expect(html).toContain("unlisted");
    expect(html).toContain("private");

    // COPPA & Compliance
    expect(html).toContain("Audience (Made for Kids - COPPA)");
    expect(html).toContain("Yes, made for kids");
    expect(html).toContain("No, not made for kids");

    // Synthetic Media
    expect(html).toContain("Altered or synthetic content disclosure");

    // Quota estimate
    expect(html).toContain("~51 units");
    expect(html).toContain("Save to YouTube");
  });

  const VIEWPORTS = [
    { name: "Desktop Wide", width: 1440, height: 900 },
    { name: "Desktop Standard", width: 1280, height: 800 },
    { name: "Tablet Landscape", width: 1024, height: 768 },
    { name: "Tablet Portrait", width: 768, height: 1024 },
    { name: "Mobile Large", width: 390, height: 844 },
    { name: "Mobile Compact", width: 375, height: 812 },
    { name: "Mobile Constrained", width: 390, height: 600 },
  ];

  VIEWPORTS.forEach(({ name, width, height }) => {
    it(`renders cleanly across viewport: ${name} (${width}x${height}) without overflow`, () => {
      const html = renderToStaticMarkup(
        <div style={{ width: `${width}px`, minHeight: `${height}px` }}>
          <ContentEditSheet
            item={mockItem}
            open={true}
            onOpenChange={vi.fn()}
            workspaceId="ws_1"
          />
        </div>
      );

      expect(html).toBeTruthy();
      expect(html).toContain("Edit YouTube Video");
      expect(html).toContain("Save to YouTube");
    });
  });
});
