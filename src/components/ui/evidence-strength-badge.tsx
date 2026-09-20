import * as React from "react";
import { cn } from "@/lib/utils";

export type EvidenceStrengthLevel = "Strong" | "Moderate" | "Limited" | "Insufficient";

export interface EvidenceStrengthBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  level: EvidenceStrengthLevel;
  showTooltip?: boolean;
}

/**
 * EvidenceStrengthBadge
 * 
 * Reusable UI primitive representing evidence strength for historical observations
 * in Publishing Intelligence.
 * 
 * IMPORTANT: Evidence strength reflects observation count and historical data availability.
 * It is NOT a statistical confidence score or guarantee of future video performance.
 */
export function EvidenceStrengthBadge({
  level,
  showTooltip = true,
  className,
  ...props
}: EvidenceStrengthBadgeProps) {
  const styles: Record<EvidenceStrengthLevel, string> = {
    Strong:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60",
    Moderate:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/60",
    Limited:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60",
    Insufficient:
      "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700",
  };

  const dotStyles: Record<EvidenceStrengthLevel, string> = {
    Strong: "bg-emerald-500",
    Moderate: "bg-blue-500",
    Limited: "bg-amber-500",
    Insufficient: "bg-zinc-400",
  };

  const title = showTooltip
    ? `Evidence Strength: ${level} (Historical observation support; not a statistical confidence score)`
    : undefined;

  return (
    <span
      role="status"
      aria-label={`Evidence strength: ${level}`}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium border font-mono tracking-tight transition-colors select-none",
        styles[level],
        className
      )}
      {...props}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", dotStyles[level])}
        aria-hidden="true"
      />
      <span>{level}</span>
    </span>
  );
}
