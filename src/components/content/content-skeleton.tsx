"use client";

import * as React from "react";

export function ContentSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-3.5 w-72 rounded bg-muted/60" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="h-8 w-36 rounded bg-muted" />
        </div>
      </div>

      {/* Filter Bar Skeleton */}
      <div className="rounded-md border border-border-subtle bg-surface p-3 space-y-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-8 w-64 rounded bg-muted" />
          <div className="h-8 w-72 rounded bg-muted" />
        </div>
        <div className="flex gap-3 pt-1 border-t border-border-subtle">
          <div className="h-6 w-24 rounded bg-muted" />
          <div className="h-6 w-24 rounded bg-muted" />
          <div className="h-6 w-28 rounded bg-muted" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-md border border-border-subtle bg-surface shadow-sm overflow-hidden">
        <div className="h-9 bg-muted/40 border-b border-border-subtle" />
        <div className="divide-y divide-border-subtle">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-16 rounded bg-muted shrink-0" />
                <div className="space-y-1">
                  <div className="h-3.5 w-48 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted/60" />
                </div>
              </div>
              <div className="h-5 w-16 rounded bg-muted" />
              <div className="h-5 w-12 rounded bg-muted" />
              <div className="h-4 w-14 rounded bg-muted" />
              <div className="h-4 w-12 rounded bg-muted" />
              <div className="h-4 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
