import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded bg-elevated/70", className)}
      {...props}
    />
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading analytics dashboard">
      {/* Top Controls Skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border-subtle pb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>

      {/* Freshness banner skeleton */}
      <Skeleton className="h-7 w-full rounded" />

      {/* 8 KPI cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-md border border-border-subtle bg-surface p-3 space-y-2"
          >
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Performance chart skeleton */}
      <div className="rounded-md border border-border-subtle bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-52 w-full rounded" />
      </div>

      {/* 2x2 breakdowns skeleton */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-md border border-border-subtle bg-surface p-4 space-y-2.5"
          >
            <Skeleton className="h-4 w-32" />
            <div className="space-y-1.5 pt-1">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-4/6" />
            </div>
          </div>
        ))}
      </div>

      {/* Top videos skeleton */}
      <div className="rounded-md border border-border-subtle bg-surface p-4 space-y-3">
        <Skeleton className="h-5 w-36" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
