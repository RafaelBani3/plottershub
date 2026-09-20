import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KpiCard } from "./kpi-card";
import { DataAvailabilityBanner } from "./data-availability-banner";
import { AccountSelector } from "./account-selector";
import { SanitizedSocialAccount } from "@/modules/social/types";

describe("YouTube Analytics UI Component Rendering (Static HTML/SSR)", () => {
  describe("KpiCard", () => {
    it("renders '—' when metric value is null", () => {
      const html = renderToStaticMarkup(
        <KpiCard
          label="Shares"
          metric={{ current: null, previous: null, delta: null, percentageChange: null }}
        />
      );
      expect(html).toContain("—");
      expect(html).toContain("Shares");
    });

    it("renders '0' when metric value is '0'", () => {
      const html = renderToStaticMarkup(
        <KpiCard
          label="Likes"
          metric={{ current: "0", previous: "0", delta: "0", percentageChange: 0 }}
        />
      );
      expect(html).toContain(">0<");
      expect(html).toContain("Likes");
    });

    it("renders positive delta with accessible label and + sign", () => {
      const html = renderToStaticMarkup(
        <KpiCard
          label="Views"
          metric={{ current: "15000", previous: "10000", delta: "5000", percentageChange: 50 }}
        />
      );
      expect(html).toContain("+50.0%");
      expect(html).toContain("Increased by 50.0% compared to previous period");
    });

    it("renders negative delta with accessible label", () => {
      const html = renderToStaticMarkup(
        <KpiCard
          label="Views"
          metric={{ current: "5000", previous: "10000", delta: "-5000", percentageChange: -50 }}
        />
      );
      expect(html).toContain("-50.0%");
      expect(html).toContain("Decreased by -50.0% compared to previous period");
    });
  });

  describe("DataAvailabilityBanner", () => {
    it("renders nothing when state is COMPLETE", () => {
      const html = renderToStaticMarkup(<DataAvailabilityBanner state="COMPLETE" />);
      expect(html).toBe("");
    });

    it("renders alert when state is NO_DATA", () => {
      const html = renderToStaticMarkup(<DataAvailabilityBanner state="NO_DATA" />);
      expect(html).toContain("No analytics data is available for this period.");
    });

    it("renders alert when state is INSUFFICIENT_DATA", () => {
      const html = renderToStaticMarkup(<DataAvailabilityBanner state="INSUFFICIENT_DATA" />);
      expect(html).toContain("Analytics data is incomplete for this period.");
    });

    it("renders status when state is PARTIAL_DATA", () => {
      const html = renderToStaticMarkup(<DataAvailabilityBanner state="PARTIAL_DATA" />);
      expect(html).toContain("Some analytics data is unavailable for this period.");
    });
  });

  describe("AccountSelector", () => {
    const mockAccount: SanitizedSocialAccount = {
      id: "acc-1",
      workspaceId: "ws-1",
      platformCode: "YOUTUBE",
      platformName: "YouTube",
      externalAccountId: "ext-1",
      username: "techchannel",
      displayName: "Tech Channel",
      avatarUrl: null,
      status: "CONNECTED",
      scopes: [],
      lastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      capabilities: {
        canReadProfile: true,
        canReadContent: true,
        canReadContentMetrics: true,
        canReadAccountMetrics: true,
        canReadAudienceMetrics: true,
        canReadComments: false,
        canPublishVideo: true,
        canPublishPhoto: false,
        canPublishCarousel: false,
        canSchedulePublish: true,
        canManageComments: false,
        canManageMessages: false,
      },
    };

    it("renders nothing when accounts list is empty", () => {
      const html = renderToStaticMarkup(
        <AccountSelector
          accounts={[]}
          selectedAccountId={null}
          onSelectAccount={() => {}}
        />
      );
      expect(html).toBe("");
    });

    it("renders channel badge without select when exactly one account", () => {
      const html = renderToStaticMarkup(
        <AccountSelector
          accounts={[mockAccount]}
          selectedAccountId="acc-1"
          onSelectAccount={() => {}}
        />
      );
      expect(html).toContain("Tech Channel");
      expect(html).not.toContain("<select");
    });

    it("renders select dropdown when multiple accounts exist", () => {
      const mockAccount2: SanitizedSocialAccount = {
        ...mockAccount,
        id: "acc-2",
        username: "vlogchannel",
        displayName: "Vlog Channel",
      };
      const html = renderToStaticMarkup(
        <AccountSelector
          accounts={[mockAccount, mockAccount2]}
          selectedAccountId="acc-1"
          onSelectAccount={() => {}}
        />
      );
      expect(html).toContain("<select");
      expect(html).toContain("Tech Channel (@techchannel)");
      expect(html).toContain("Vlog Channel (@vlogchannel)");
    });
  });
});
