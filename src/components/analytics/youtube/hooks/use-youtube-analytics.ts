import * as React from "react";
import {
  DashboardSummaryData,
  DashboardAudienceData,
  DashboardGeographyData,
  DashboardTrafficSourcesData,
  DashboardDevicesData,
  DashboardTopVideosData,
  DashboardResponseMeta,
  TopVideoSortField,
  SortOrder,
} from "@/modules/social/analytics/dashboard.types";
import { SanitizedSocialAccount } from "@/modules/social/types";
import { getPresetDateRange } from "../youtube-formatters";

export interface UseYouTubeAnalyticsResult {
  // Accounts state
  accounts: SanitizedSocialAccount[];
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string) => void;
  isAccountsLoading: boolean;

  // Date range state
  startDate: string;
  endDate: string;
  setDateRange: (start: string, end: string) => void;

  // Primary summary data
  summary: DashboardSummaryData | null;
  meta: DashboardResponseMeta | null;
  isSummaryLoading: boolean;
  summaryError: string | null;

  // Secondary breakdown data
  audience: DashboardAudienceData | null;
  geography: DashboardGeographyData | null;
  trafficSources: DashboardTrafficSourcesData | null;
  devices: DashboardDevicesData | null;
  isSecondaryLoading: boolean;

  // Top videos table state & pagination
  topVideosData: DashboardTopVideosData | null;
  isTopVideosLoading: boolean;
  sortBy: TopVideoSortField;
  sortOrder: SortOrder;
  topVideosOffset: number;
  topVideosLimit: number;
  setSorting: (field: TopVideoSortField) => void;
  setTopVideosOffset: (offset: number) => void;

  // Actions
  refreshAll: () => void;
}

export function useYouTubeAnalytics(
  workspaceId: string | null | undefined,
  initialAccountId?: string | null
): UseYouTubeAnalyticsResult {
  // Accounts
  const [accounts, setAccounts] = React.useState<SanitizedSocialAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(initialAccountId || null);
  const [isAccountsLoading, setIsAccountsLoading] = React.useState(true);

  // Date range default: 28D preset
  const defaultRange = React.useMemo(() => getPresetDateRange("28d"), []);
  const [startDate, setStartDate] = React.useState<string>(defaultRange.startDate);
  const [endDate, setEndDate] = React.useState<string>(defaultRange.endDate);

  // Summary
  const [summary, setSummary] = React.useState<DashboardSummaryData | null>(null);
  const [meta, setMeta] = React.useState<DashboardResponseMeta | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState<string | null>(null);

  // Secondary
  const [audience, setAudience] = React.useState<DashboardAudienceData | null>(null);
  const [geography, setGeography] = React.useState<DashboardGeographyData | null>(null);
  const [trafficSources, setTrafficSources] = React.useState<DashboardTrafficSourcesData | null>(null);
  const [devices, setDevices] = React.useState<DashboardDevicesData | null>(null);
  const [isSecondaryLoading, setIsSecondaryLoading] = React.useState(false);

  // Top Videos custom sorting/pagination
  const [topVideosData, setTopVideosData] = React.useState<DashboardTopVideosData | null>(null);
  const [isTopVideosLoading, setIsTopVideosLoading] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<TopVideoSortField>("views");
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("desc");
  const [topVideosOffset, setTopVideosOffset] = React.useState(0);
  const topVideosLimit = 10;

  // Refresh trigger counter
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);

  // 1. Fetch connected YouTube accounts
  React.useEffect(() => {
    if (!workspaceId) {
      setAccounts([]);
      setIsAccountsLoading(false);
      return;
    }

    let isMounted = true;
    setIsAccountsLoading(true);

    fetch(`/api/social/accounts?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to fetch accounts"))))
      .then((data) => {
        if (!isMounted) return;
        const rawAccounts: SanitizedSocialAccount[] = data.accounts || [];
        const activeStatuses = ["CONNECTED", "HEALTHY", "SYNCING", "WARNING"];
        const youtubeAccounts = rawAccounts.filter(
          (acc) => acc.platformCode === "YOUTUBE" && activeStatuses.includes(acc.status)
        );
        setAccounts(youtubeAccounts);

        // Auto-select logic
        if (youtubeAccounts.length === 1) {
          setSelectedAccountId(youtubeAccounts[0].id);
        } else if (youtubeAccounts.length > 1) {
          // If previous selection is invalid, select first
          setSelectedAccountId((prev) => {
            const exists = youtubeAccounts.some((a) => a.id === prev);
            return exists ? prev : youtubeAccounts[0].id;
          });
        } else {
          setSelectedAccountId(null);
        }
      })
      .catch((_err) => {
        if (!isMounted) return;
        setAccounts([]);
        setSelectedAccountId(null);
      })
      .finally(() => {
        if (isMounted) setIsAccountsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  // 2. Fetch primary /summary on account or date change
  React.useEffect(() => {
    if (!workspaceId || !selectedAccountId) {
      setSummary(null);
      setMeta(null);
      setTopVideosData(null);
      return;
    }

    let isMounted = true;
    setIsSummaryLoading(true);
    setSummaryError(null);

    const summaryUrl = `/api/social/youtube/analytics/summary?workspaceId=${encodeURIComponent(
      workspaceId
    )}&socialAccountId=${encodeURIComponent(selectedAccountId)}&startDate=${encodeURIComponent(
      startDate
    )}&endDate=${encodeURIComponent(endDate)}`;

    fetch(summaryUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Analytics service returned HTTP ${res.status}`);
        return res.json();
      })
      .then((envelope) => {
        if (!isMounted) return;
        setSummary(envelope.data);
        setMeta(envelope.meta);
        // Initialize top videos data from summary composite
        if (envelope.data?.topVideos) {
          setTopVideosData(envelope.data.topVideos);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setSummaryError(err.message || "Failed to load summary analytics");
      })
      .finally(() => {
        if (isMounted) setIsSummaryLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceId, selectedAccountId, startDate, endDate, refreshTrigger]);

  // 3. Fetch secondary endpoints in parallel (Audience, Geography, Sources, Devices)
  React.useEffect(() => {
    if (!workspaceId || !selectedAccountId) {
      setAudience(null);
      setGeography(null);
      setTrafficSources(null);
      setDevices(null);
      return;
    }

    let isMounted = true;
    setIsSecondaryLoading(true);

    const baseQuery = `workspaceId=${encodeURIComponent(workspaceId)}&socialAccountId=${encodeURIComponent(
      selectedAccountId
    )}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;

    Promise.allSettled([
      fetch(`/api/social/youtube/analytics/audience?${baseQuery}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/social/youtube/analytics/geography?${baseQuery}&limit=10`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/social/youtube/analytics/traffic-sources?${baseQuery}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/social/youtube/analytics/devices?${baseQuery}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([audRes, geoRes, srcRes, devRes]) => {
        if (!isMounted) return;
        if (audRes.status === "fulfilled" && audRes.value?.data) {
          setAudience(audRes.value.data);
        }
        if (geoRes.status === "fulfilled" && geoRes.value?.data) {
          setGeography(geoRes.value.data);
        }
        if (srcRes.status === "fulfilled" && srcRes.value?.data) {
          setTrafficSources(srcRes.value.data);
        }
        if (devRes.status === "fulfilled" && devRes.value?.data) {
          setDevices(devRes.value.data);
        }
      })
      .finally(() => {
        if (isMounted) setIsSecondaryLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceId, selectedAccountId, startDate, endDate, refreshTrigger]);

  // 4. Handle pagination or custom sorting for Top Videos independently
  React.useEffect(() => {
    // Only fetch if offset > 0 or custom sort is different from default (views, desc, offset 0)
    if (topVideosOffset === 0 && sortBy === "views" && sortOrder === "desc") {
      // Already populated from summary
      return;
    }

    if (!workspaceId || !selectedAccountId) return;

    let isMounted = true;
    setIsTopVideosLoading(true);

    const url = `/api/social/youtube/analytics/top-videos?workspaceId=${encodeURIComponent(
      workspaceId
    )}&socialAccountId=${encodeURIComponent(selectedAccountId)}&startDate=${encodeURIComponent(
      startDate
    )}&endDate=${encodeURIComponent(endDate)}&sortBy=${sortBy}&sortOrder=${sortOrder}&limit=${topVideosLimit}&offset=${topVideosOffset}`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((envelope) => {
        if (!isMounted || !envelope?.data) return;
        setTopVideosData(envelope.data);
      })
      .finally(() => {
        if (isMounted) setIsTopVideosLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceId, selectedAccountId, startDate, endDate, sortBy, sortOrder, topVideosOffset]);

  const handleSetSorting = (field: TopVideoSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setTopVideosOffset(0);
  };

  const handleSetDateRange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setTopVideosOffset(0);
  };

  const handleRefreshAll = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    isAccountsLoading,
    startDate,
    endDate,
    setDateRange: handleSetDateRange,
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
    setSorting: handleSetSorting,
    setTopVideosOffset,
    refreshAll: handleRefreshAll,
  };
}
