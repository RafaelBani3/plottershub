import * as React from "react";
import { AudiencePanel } from "./audience-panel";
import { GeographyPanel } from "./geography-panel";
import { TrafficSourcesPanel } from "./traffic-sources-panel";
import { DevicesPanel } from "./devices-panel";
import {
  DashboardAudienceData,
  DashboardGeographyData,
  DashboardTrafficSourcesData,
  DashboardDevicesData,
} from "@/modules/social/analytics/dashboard.types";

export interface BreakdownGridProps {
  audience?: DashboardAudienceData | null;
  geography?: DashboardGeographyData | null;
  trafficSources?: DashboardTrafficSourcesData | null;
  devices?: DashboardDevicesData | null;
  isLoadingSecondary?: boolean;
}

export function BreakdownGrid({
  audience,
  geography,
  trafficSources,
  devices,
  isLoadingSecondary = false,
}: BreakdownGridProps) {
  return (
    <section aria-label="Audience & Discovery Breakdowns" className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Audience & Distribution</h2>
        <span className="text-xs text-muted-foreground">Demographics, Geo, Sources & Devices</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AudiencePanel data={audience} isLoading={isLoadingSecondary} />
        <GeographyPanel data={geography} isLoading={isLoadingSecondary} />
        <TrafficSourcesPanel data={trafficSources} isLoading={isLoadingSecondary} />
        <DevicesPanel data={devices} isLoading={isLoadingSecondary} />
      </div>
    </section>
  );
}
