"use client";

import * as React from "react";
import { Search, X, ArrowUpDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContentFilterType,
  ContentFilterStatus,
  ContentFilterPrivacy,
  ContentFilterState,
} from "./content-types";

export interface ContentFilterBarProps {
  filterState: ContentFilterState;
  onChange: (updates: Partial<ContentFilterState>) => void;
  onReset: () => void;
  isFiltered: boolean;
}

const TYPE_TABS: Array<{ label: string; value: ContentFilterType }> = [
  { label: "All Formats", value: "ALL" },
  { label: "Long-form", value: "LONG_FORM" },
  { label: "Shorts", value: "SHORTS" },
  { label: "Live Stream", value: "LIVE_STREAM" },
  { label: "Unknown", value: "UNKNOWN" },
];

export function ContentFilterBar({
  filterState,
  onChange,
  onReset,
  isFiltered,
}: ContentFilterBarProps) {
  const [searchInput, setSearchInput] = React.useState(filterState.search);

  // Synchronize local search input if filterState changes externally
  React.useEffect(() => {
    setSearchInput(filterState.search);
  }, [filterState.search]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onChange({ search: searchInput, page: 1 });
    }
  };

  const handleClearSearch = () => {
    setSearchInput("");
    onChange({ search: "", page: 1 });
  };

  return (
    <div className="space-y-3 rounded-md border border-border-subtle bg-surface p-3 shadow-sm">
      {/* Top row: Search and Format Tabs */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Box */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by title or description..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onBlur={() => {
              if (searchInput !== filterState.search) {
                onChange({ search: searchInput, page: 1 });
              }
            }}
            className="h-8 w-full rounded-md border border-border-subtle bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-focus"
          />
          {searchInput && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Format Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border-subtle bg-muted/40 p-0.5">
          {TYPE_TABS.map((tab) => {
            const isActive = filterState.contentType === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => onChange({ contentType: tab.value, page: 1 })}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-surface text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom row: Status, Privacy, Sort, and Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status Dropdown */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Status:</span>
            <select
              value={filterState.status}
              onChange={(e) =>
                onChange({ status: e.target.value as ContentFilterStatus, page: 1 })
              }
              className="h-7 rounded border border-border-subtle bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
            >
              <option value="ALL">All Status</option>
              <option value="PUBLISHED">Published</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived / Deleted</option>
            </select>
          </div>

          {/* Privacy Dropdown */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Privacy:</span>
            <select
              value={filterState.privacy}
              onChange={(e) =>
                onChange({ privacy: e.target.value as ContentFilterPrivacy, page: 1 })
              }
              className="h-7 rounded border border-border-subtle bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
            >
              <option value="ALL">All Privacy</option>
              <option value="PUBLIC">Public</option>
              <option value="UNLISTED">Unlisted</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Sort:</span>
            <select
              value={filterState.sortBy}
              onChange={(e) =>
                onChange({
                  sortBy: e.target.value as ContentFilterState["sortBy"],
                  page: 1,
                })
              }
              className="h-7 rounded border border-border-subtle bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
            >
              <option value="publishedAt">Published Date</option>
              <option value="views">Views</option>
              <option value="likes">Likes</option>
              <option value="comments">Comments</option>
              <option value="duration">Duration</option>
              <option value="title">Title</option>
            </select>

            {/* Sort Order Toggle */}
            <button
              onClick={() =>
                onChange({
                  sortOrder: filterState.sortOrder === "desc" ? "asc" : "desc",
                  page: 1,
                })
              }
              title={`Sorting ${filterState.sortOrder === "desc" ? "Descending" : "Ascending"}`}
              className="flex h-7 w-7 items-center justify-center rounded border border-border-subtle bg-background text-foreground hover:bg-hover transition-colors"
            >
              <ArrowUpDown className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Reset Filters */}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Filters</span>
          </Button>
        )}
      </div>
    </div>
  );
}
