import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Failed to load analytics data",
  message = "An error occurred while fetching analytics metrics for this channel. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="rounded-md border border-negative/25 bg-negative/5 p-6 text-center text-foreground">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-negative/15 text-negative">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="border-negative/30 text-negative hover:bg-negative/10"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry Request
          </Button>
        </div>
      )}
    </div>
  );
}
