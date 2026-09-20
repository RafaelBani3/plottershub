import * as React from "react";
import { Users } from "lucide-react";
import { DashboardAudienceData } from "@/modules/social/analytics/dashboard.types";

export interface AudiencePanelProps {
  data?: DashboardAudienceData | null;
  isLoading?: boolean;
}

export function AudiencePanel({ data, isLoading }: AudiencePanelProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border border-border-subtle bg-surface p-4 animate-pulse space-y-2.5">
        <div className="h-4 w-28 bg-elevated rounded" />
        <div className="h-24 bg-elevated/50 rounded" />
      </div>
    );
  }

  const demographics = data?.demographics || [];
  const genderTotals = data?.genderTotals;
  const ageTotals = data?.ageTotals || {};

  const hasData = demographics.length > 0;

  return (
    <div className="rounded-md border border-border-subtle bg-surface p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-foreground">Audience Demographics</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">Age & Gender</span>
      </div>

      {!hasData ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Demographic data is unavailable for this channel or period.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Gender distribution */}
          {genderTotals && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1 font-medium text-[11px]">
                <span>Gender Ratio</span>
                <span className="font-mono text-foreground">
                  {genderTotals.male.toFixed(1)}% M • {genderTotals.female.toFixed(1)}% F
                </span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  className="bg-blue-500"
                  style={{ width: `${genderTotals.male}%` }}
                  title={`Male: ${genderTotals.male.toFixed(1)}%`}
                />
                <div
                  className="bg-pink-500"
                  style={{ width: `${genderTotals.female}%` }}
                  title={`Female: ${genderTotals.female.toFixed(1)}%`}
                />
                <div
                  className="bg-slate-600"
                  style={{ width: `${genderTotals.userSpecified}%` }}
                  title={`Other: ${genderTotals.userSpecified.toFixed(1)}%`}
                />
              </div>
            </div>
          )}

          {/* Age Group Distribution */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-medium text-muted-foreground">Age Distribution</div>
            {Object.entries(ageTotals).length === 0 ? (
              <div className="text-xs text-muted-foreground">No age breakdown recorded</div>
            ) : (
              Object.entries(ageTotals).map(([ageGroup, pct]) => (
                <div key={ageGroup} className="space-y-0.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-foreground font-medium">{ageGroup.replace("age", "")}</span>
                    <span className="font-mono text-muted-foreground">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full bg-blue-500/80 transition-all duration-300"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
