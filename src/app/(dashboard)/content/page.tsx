"use client";

import * as React from "react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { SanitizedSocialAccount } from "@/modules/social/types";
import {
  ContentHeader,
  ContentFilterBar,
  ContentTableView,
  ContentCardGrid,
  ContentDetailSheet,
  ContentEditSheet,
  ContentEmptyState,
  ContentSkeleton,
  ContentPublishDialog,
  ContentListItemDTO,
  ContentFilterState,
  ContentSummaryDTO,
  DEFAULT_FILTER_STATE,
} from "@/components/content";

export default function ContentLibraryPage() {
  const { currentWorkspace, isLoading: isWorkspaceLoading } = useWorkspace();

  const [accounts, setAccounts] = React.useState<SanitizedSocialAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | undefined>(undefined);
  const [isAccountsLoading, setIsAccountsLoading] = React.useState(true);

  const [items, setItems] = React.useState<ContentListItemDTO[]>([]);
  const [total, setTotal] = React.useState(0);
  const [summary, setSummary] = React.useState<ContentSummaryDTO | undefined>(undefined);
  const [isContentLoading, setIsContentLoading] = React.useState(true);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);

  const [filterState, setFilterState] = React.useState<ContentFilterState>(DEFAULT_FILTER_STATE);
  const [selectedVideo, setSelectedVideo] = React.useState<ContentListItemDTO | null>(null);
  const [isDetailOpen, setIsDetailOpen] = React.useState(false);

  const [editingVideo, setEditingVideo] = React.useState<ContentListItemDTO | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isPublishOpen, setIsPublishOpen] = React.useState(false);

  const handleOpenEdit = React.useCallback((item: ContentListItemDTO) => {
    setEditingVideo(item);
    setIsEditOpen(true);
  }, []);

  const handleEditSuccess = React.useCallback((updatedItem: ContentListItemDTO) => {
    setItems((prev) =>
      prev.map((it) => (it.id === updatedItem.id ? updatedItem : it))
    );
    setSelectedVideo((prev) => (prev?.id === updatedItem.id ? updatedItem : prev));
  }, []);

  // 1. Fetch connected YouTube accounts for the current workspace
  const fetchAccounts = React.useCallback(async () => {
    if (!currentWorkspace?.id) return;
    setIsAccountsLoading(true);
    try {
      const res = await fetch(`/api/social/accounts?workspaceId=${currentWorkspace.id}`);
      if (res.ok) {
        const data = await res.json();
        const youtubeAccounts = (data.accounts || []).filter(
          (acc: SanitizedSocialAccount) => acc.platformCode === "YOUTUBE"
        );
        setAccounts(youtubeAccounts);
      }
    } catch (err) {
      console.error("Failed to load accounts", err);
    } finally {
      setIsAccountsLoading(false);
    }
  }, [currentWorkspace?.id]);

  React.useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // 2. Fetch content items based on filterState and selectedAccountId
  const fetchContent = React.useCallback(async () => {
    if (!currentWorkspace?.id) return;
    setIsContentLoading(true);
    try {
      const params = new URLSearchParams({
        workspaceId: currentWorkspace.id,
        contentType: filterState.contentType,
        status: filterState.status,
        privacy: filterState.privacy,
        sortBy: filterState.sortBy,
        sortOrder: filterState.sortOrder,
        limit: filterState.pageSize.toString(),
        offset: ((filterState.page - 1) * filterState.pageSize).toString(),
        includeSummary: "true",
      });

      if (filterState.search.trim()) {
        params.set("search", filterState.search.trim());
      }

      const activeAccountId = selectedAccountId || filterState.socialAccountId;
      if (activeAccountId) {
        params.set("socialAccountId", activeAccountId);
      }

      const res = await fetch(`/api/content?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
        if (data.summary) {
          setSummary(data.summary);
        }
      }
    } catch (err) {
      console.error("Failed to fetch content", err);
    } finally {
      setIsContentLoading(false);
    }
  }, [currentWorkspace?.id, filterState, selectedAccountId]);

  React.useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // 3. Trigger manual sync from YouTube
  const handleSync = async () => {
    if (!currentWorkspace?.id || accounts.length === 0) return;
    const targetAccountId = selectedAccountId || accounts[0]?.id;
    if (!targetAccountId) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      const res = await fetch("/api/social/youtube/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: targetAccountId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSyncError(data.error || "Failed to synchronize YouTube channel.");
      } else {
        await fetchContent();
      }
    } catch {
      setSyncError("Network error while synchronizing with YouTube.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFilterChange = (updates: Partial<ContentFilterState>) => {
    setFilterState((prev) => ({ ...prev, ...updates }));
  };

  const handleResetFilters = () => {
    setFilterState(DEFAULT_FILTER_STATE);
  };

  const isFiltered =
    filterState.search !== "" ||
    filterState.contentType !== "ALL" ||
    filterState.status !== "ALL" ||
    filterState.privacy !== "ALL" ||
    filterState.sortBy !== "publishedAt" ||
    filterState.sortOrder !== "desc";

  const handleOpenDetail = (item: ContentListItemDTO) => {
    setSelectedVideo(item);
    setIsDetailOpen(true);
  };

  if (isWorkspaceLoading || isAccountsLoading) {
    return <ContentSkeleton />;
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Header with summary counters and sync button */}
      <ContentHeader
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={(accId) => {
          setSelectedAccountId(accId);
          handleFilterChange({ page: 1 });
        }}
        onSync={handleSync}
        isSyncing={isSyncing}
        summary={summary}
        totalCount={total}
        onPublishClick={() => setIsPublishOpen(true)}
        userCanPublish={["OWNER", "ADMIN", "EDITOR"].includes(currentWorkspace?.currentUserRole || "")}
      />

      {/* Sync Error Banner */}
      {syncError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between">
          <span>{syncError}</span>
          <button
            onClick={() => setSyncError(null)}
            className="text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* When no accounts are connected */}
      {accounts.length === 0 ? (
        <ContentEmptyState type="no_accounts" />
      ) : (
        <>
          {/* Filter Bar */}
          <ContentFilterBar
            filterState={filterState}
            onChange={handleFilterChange}
            onReset={handleResetFilters}
            isFiltered={isFiltered}
          />

          {/* Content Views */}
          {isContentLoading ? (
            <ContentSkeleton />
          ) : items.length === 0 ? (
            isFiltered ? (
              <ContentEmptyState
                type="no_search_results"
                onResetFilters={handleResetFilters}
              />
            ) : (
              <ContentEmptyState
                type="no_videos"
                onSync={handleSync}
                isSyncing={isSyncing}
              />
            )
          ) : (
            <>
              {/* Desktop Dense Table View (>= 768px) */}
              <div className="hidden md:block">
                <ContentTableView
                  items={items}
                  onSelectVideo={handleOpenDetail}
                  page={filterState.page}
                  pageSize={filterState.pageSize}
                  total={total}
                  onPageChange={(page) => handleFilterChange({ page })}
                />
              </div>

              {/* Mobile Card Grid View (< 768px) */}
              <div className="block md:hidden">
                <ContentCardGrid
                  items={items}
                  onSelectVideo={handleOpenDetail}
                  page={filterState.page}
                  pageSize={filterState.pageSize}
                  total={total}
                  onPageChange={(page) => handleFilterChange({ page })}
                />
              </div>
            </>
          )}
        </>
      )}

      {/* Video Detail Sheet / Modal */}
      <ContentDetailSheet
        item={selectedVideo}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onEditClick={handleOpenEdit}
        workspaceId={currentWorkspace?.id || ""}
        userRole={currentWorkspace?.currentUserRole || "VIEWER"}
      />

      {/* Video Edit Sheet (Phase 3.4D) */}
      <ContentEditSheet
        item={editingVideo}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        workspaceId={currentWorkspace?.id || ""}
        onSuccess={handleEditSuccess}
      />

      {/* Video Publish Dialog (Phase 3.4F) */}
      <ContentPublishDialog
        open={isPublishOpen}
        onOpenChange={setIsPublishOpen}
        workspaceId={currentWorkspace?.id || ""}
        accounts={accounts}
        onSuccess={() => {
          fetchContent();
        }}
      />
    </div>
  );
}
