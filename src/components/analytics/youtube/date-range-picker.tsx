import * as React from "react";
import { Calendar, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getPresetDateRange,
  validateDateRange,
} from "./youtube-formatters";

export interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChangeRange: (startDate: string, endDate: string) => void;
  disabled?: boolean;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChangeRange,
  disabled = false,
}: DateRangePickerProps) {
  const [activePreset, setActivePreset] = React.useState<"7d" | "28d" | "90d" | "custom">("28d");
  const [isCustomOpen, setIsCustomOpen] = React.useState(false);
  const [customStart, setCustomStart] = React.useState(startDate);
  const [customEnd, setCustomEnd] = React.useState(endDate);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [validationWarning, setValidationWarning] = React.useState<string | null>(null);

  // Sync state if external dates change
  React.useEffect(() => {
    setCustomStart(startDate);
    setCustomEnd(endDate);
    const p7 = getPresetDateRange("7d");
    const p28 = getPresetDateRange("28d");
    const p90 = getPresetDateRange("90d");

    if (startDate === p7.startDate && endDate === p7.endDate) {
      setActivePreset("7d");
    } else if (startDate === p28.startDate && endDate === p28.endDate) {
      setActivePreset("28d");
    } else if (startDate === p90.startDate && endDate === p90.endDate) {
      setActivePreset("90d");
    } else {
      setActivePreset("custom");
    }
  }, [startDate, endDate]);

  const handleSelectPreset = (preset: "7d" | "28d" | "90d") => {
    const range = getPresetDateRange(preset);
    setActivePreset(preset);
    setIsCustomOpen(false);
    setValidationError(null);
    setValidationWarning(null);
    onChangeRange(range.startDate, range.endDate);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateDateRange(customStart, customEnd);
    if (!validation.isValid) {
      setValidationError(validation.error || "Invalid date range");
      return;
    }
    setValidationError(null);
    setValidationWarning(validation.warning || null);
    setActivePreset("custom");
    setIsCustomOpen(false);
    onChangeRange(customStart, customEnd);
  };

  return (
    <div className="relative flex flex-col gap-1.5 w-full sm:w-auto">
      <div className="flex items-center justify-between sm:justify-start rounded border border-border-subtle bg-surface p-0.5 text-xs">
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSelectPreset("7d")}
          className={`flex-1 sm:flex-initial rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            activePreset === "7d"
              ? "bg-elevated text-foreground font-semibold border border-border-strong"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          7D
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSelectPreset("28d")}
          className={`flex-1 sm:flex-initial rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            activePreset === "28d"
              ? "bg-elevated text-foreground font-semibold border border-border-strong"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          28D
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSelectPreset("90d")}
          className={`flex-1 sm:flex-initial rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            activePreset === "90d"
              ? "bg-elevated text-foreground font-semibold border border-border-strong"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          90D
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsCustomOpen(!isCustomOpen)}
          className={`flex-1 sm:flex-initial rounded px-2.5 py-1 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
            activePreset === "custom" || isCustomOpen
              ? "bg-elevated text-foreground font-semibold border border-border-strong"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="h-3 w-3" />
          <span>Custom</span>
        </button>
      </div>

      {isCustomOpen && (
        <form
          onSubmit={handleApplyCustom}
          className="absolute top-full mt-1 right-0 sm:right-auto z-30 rounded-md border border-border-strong bg-elevated p-3 shadow-lg space-y-2.5 min-w-[260px]"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <label htmlFor="custom-start-date" className="block text-muted-foreground mb-1 text-[11px] font-medium">
                Start Date
              </label>
              <Input
                id="custom-start-date"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-7 text-xs bg-surface border-border-strong text-foreground"
              />
            </div>
            <div>
              <label htmlFor="custom-end-date" className="block text-muted-foreground mb-1 text-[11px] font-medium">
                End Date
              </label>
              <Input
                id="custom-end-date"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-7 text-xs bg-surface border-border-strong text-foreground"
              />
            </div>
          </div>

          {validationError && (
            <div className="text-[11px] text-negative flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="flex justify-end gap-1.5 pt-1 border-t border-border-subtle">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCustomOpen(false)}
              className="h-6 text-[11px] px-2"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-6 text-[11px] px-2.5"
            >
              Apply
            </Button>
          </div>
        </form>
      )}

      {validationWarning && (
        <div className="text-[10px] text-amber-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{validationWarning}</span>
        </div>
      )}
    </div>
  );
}
