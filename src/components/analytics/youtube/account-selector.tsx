import * as React from "react";
import { Youtube } from "lucide-react";
import { Select } from "@/components/ui/select";
import { SanitizedSocialAccount } from "@/modules/social/types";

export interface AccountSelectorProps {
  accounts: SanitizedSocialAccount[];
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  disabled?: boolean;
}

export function AccountSelector({
  accounts,
  selectedAccountId,
  onSelectAccount,
  disabled = false,
}: AccountSelectorProps) {
  if (accounts.length === 0) {
    return null;
  }

  // Exactly 1 account -> Render compact badge with channel name
  if (accounts.length === 1) {
    const single = accounts[0];
    return (
      <div
        className="flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1 text-xs text-foreground"
        title={`Active YouTube Channel: ${single.displayName || single.username}`}
      >
        <div className="flex h-4 w-4 items-center justify-center rounded bg-red-500/15 text-youtube">
          <Youtube className="h-3 w-3" aria-hidden="true" />
        </div>
        <span className="max-w-[160px] truncate font-medium text-foreground">
          {single.displayName || single.username}
        </span>
      </div>
    );
  }

  // Multiple accounts -> Accessible select dropdown
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor="youtube-account-select" className="sr-only">
        Select YouTube Channel
      </label>
      <div className="relative min-w-[180px]">
        <Select
          id="youtube-account-select"
          value={selectedAccountId || ""}
          onChange={(e) => onSelectAccount(e.target.value)}
          disabled={disabled}
          className="h-8 text-xs bg-surface border-border-strong text-foreground font-medium focus:ring-focus"
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id} className="bg-surface text-foreground">
              {acc.displayName ? `${acc.displayName} (@${acc.username})` : `@${acc.username}`}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
