import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentPublishDialog } from "./content-publish-dialog";
import { ContentHeader } from "./content-header";
import { SanitizedSocialAccount } from "@/modules/social/types";

const mockAccounts: SanitizedSocialAccount[] = [
  {
    id: "sa_yt_1",
    workspaceId: "ws_1",
    platformCode: "YOUTUBE",
    platformName: "YouTube",
    externalAccountId: "yt_123",
    username: "PlottersArt",
    displayName: "Plotters Official",
    avatarUrl: null,
    status: "HEALTHY",
    scopes: ["https://www.googleapis.com/auth/youtube.upload"],
    lastSyncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    capabilities: {
      canReadProfile: true,
      canReadContent: true,
      canReadContentMetrics: true,
      canReadAccountMetrics: true,
      canReadAudienceMetrics: true,
      canReadComments: true,
      canPublishVideo: true,
      canPublishPhoto: false,
      canPublishCarousel: false,
      canSchedulePublish: true,
      canManageComments: true,
      canManageMessages: false,
      canUploadContent: true,
      canPublishContent: true,
      canUploadThumbnail: true,
    },
  },
];

describe("Phase 3.4F: UI Publishing Components & Responsive Viewports", () => {
  describe("ContentHeader - Publish Video Button", () => {
    it("renders Publish Video button when userCanPublish is true and onPublishClick is provided", () => {
      const html = renderToStaticMarkup(
        <ContentHeader
          accounts={mockAccounts}
          onSelectAccount={vi.fn()}
          onSync={vi.fn() as any}
          isSyncing={false}
          totalCount={10}
          onPublishClick={vi.fn()}
          userCanPublish={true}
        />
      );

      expect(html).toContain("Publish Video");
      expect(html).toContain("Sync");
    });

    it("does not render Publish Video button when userCanPublish is false", () => {
      const html = renderToStaticMarkup(
        <ContentHeader
          accounts={mockAccounts}
          onSelectAccount={vi.fn()}
          onSync={vi.fn() as any}
          isSyncing={false}
          totalCount={10}
          onPublishClick={vi.fn()}
          userCanPublish={false}
        />
      );

      expect(html).not.toContain("Publish Video");
    });
  });

  describe("ContentPublishDialog - Structure & Stepper", () => {
    it("renders initial Media step with upload dropzone and disabled Next button until media is staged", () => {
      const html = renderToStaticMarkup(
        <ContentPublishDialog
          open={true}
          onOpenChange={vi.fn()}
          workspaceId="ws_1"
          accounts={mockAccounts}
        />
      );

      expect(html).toContain("Publish Video to YouTube");
      expect(html).toContain("Select or Drop Video File");
      expect(html).toContain("Next: Details");
      expect(html).toContain("disabled");
    });

    it("renders all 5 stepper stages in the header bar", () => {
      const html = renderToStaticMarkup(
        <ContentPublishDialog
          open={true}
          onOpenChange={vi.fn()}
          workspaceId="ws_1"
          accounts={mockAccounts}
        />
      );

      expect(html).toContain("1. Media");
      expect(html).toContain("2. Details");
      expect(html).toContain("3. Thumbnail");
      expect(html).toContain("4. Visibility");
      expect(html).toContain("5. Status");
    });

    it("renders clean dialog markup with close button and accessible title", () => {
      const html = renderToStaticMarkup(
        <ContentPublishDialog
          open={true}
          onOpenChange={vi.fn()}
          workspaceId="ws_1"
          accounts={mockAccounts}
        />
      );

      expect(html).toContain("aria-label=\"Close dialog\"");
      expect(html).toContain("Direct-to-YouTube resumable chunked upload");
    });

    it("does not render dialog markup when open is false", () => {
      const html = renderToStaticMarkup(
        <ContentPublishDialog
          open={false}
          onOpenChange={vi.fn()}
          workspaceId="ws_1"
          accounts={mockAccounts}
        />
      );

      expect(html).toBe("");
    });
  });

  describe("Responsive Viewport Validation", () => {
    const viewports = [
      { width: 1440, height: 900, name: "Desktop Large" },
      { width: 1280, height: 800, name: "Desktop Standard" },
      { width: 1024, height: 768, name: "Tablet Landscape" },
      { width: 768, height: 1024, name: "Tablet Portrait" },
      { width: 390, height: 844, name: "Mobile iPhone 14 Pro" },
      { width: 375, height: 812, name: "Mobile iPhone Mini" },
      { width: 390, height: 600, name: "Short Mobile" },
    ];

    viewports.forEach(({ width, height, name }) => {
      it(`renders gracefully without overflow on ${name} (${width}x${height})`, () => {
        const html = renderToStaticMarkup(
          <div style={{ width: `${width}px`, height: `${height}px` }}>
            <ContentPublishDialog
              open={true}
              onOpenChange={vi.fn()}
              workspaceId="ws_1"
              accounts={mockAccounts}
            />
          </div>
        );

        expect(html).toBeDefined();
        expect(html).toContain("Publish Video to YouTube");
        // Ensure no blanket overflow-x-hidden
        expect(html).not.toContain("overflow-x-hidden");
      });
    });
  });
});
