import * as React from "react";
import { Youtube, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountSelector } from "./account-selector";
import { DateRangePicker } from "./date-range-picker";
import { SanitizedSocialAccount } from "@/modules/social/types";

export interface YouTubeDashboardHeaderProps {
  accounts: SanitizedSocialAccount[];
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  startDate: string;
  endDate: string;
  onChangeDateRange: (startDate: string, endDate: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function YouTubeDashboardHeader({
  accounts,
  selectedAccountId,
  onSelectAccount,
  startDate,
  endDate,
  onChangeDateRange,
  onRefresh,
  isRefreshing = false,
}: YouTubeDashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded border border-red-500/25 bg-red-500/10 text-youtube">
          <Youtube className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            YouTube Analytics
          </h1>
          <p className="text-xs text-muted-foreground">
            Audience demographics, reach curves, and performance progression
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AccountSelector
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={onSelectAccount}
          disabled={isRefreshing}
        />

        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChangeRange={onChangeDateRange}
          disabled={isRefreshing}
        />

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing || !selectedAccountId}
          className="h-8 w-8 p-0 shrink-0 border-border-strong text-foreground"
          title="Refresh analytics data"
          aria-label="Refresh analytics data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </header>
  );
}
