"use client";

import * as React from "react";
import {
  Sparkles,
  TrendingUp,
  Target,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Compass,
  Flame,
  ArrowUpRight,
  RefreshCw,
  Cpu,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardOverviewData } from "@/modules/social/analytics/dashboard.types";

export interface AIInsightsPanelProps {
  overview?: DashboardOverviewData | null;
}

interface ParsedGeminiData {
  summaryHeadline?: string;
  analysis?: Array<{ title: string; detail: string; highlight?: string }>;
  conclusion?: Array<{ title: string; detail: string; type: "strength" | "weakness" | "opportunity" }>;
  roadmap?: Array<{ step: string; title: string; description: string }>;
  tactics?: Array<{ title: string; formula: string; explanation: string }>;
}

export function AIInsightsPanel({ overview }: AIInsightsPanelProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"analysis" | "conclusion" | "roadmap" | "tactics">("analysis");
  const [isLoading, setIsLoading] = React.useState(false);
  const [generatedData, setGeneratedData] = React.useState<ParsedGeminiData | null>(null);
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null);
  const [apiError, setApiError] = React.useState<string | null>(null);

  if (!overview) return null;

  const viewsCount = overview.views.current ? parseInt(overview.views.current, 10) : 0;
  const watchTimeHours = overview.estimatedMinutesWatched.current
    ? Math.round(parseInt(overview.estimatedMinutesWatched.current, 10) / 60)
    : 0;
  const netSubs = overview.netSubscribers.current ? parseInt(overview.netSubscribers.current, 10) : 0;
  const subsGained = overview.subscribersGained.current ? parseInt(overview.subscribersGained.current, 10) : 0;
  const subsLost = overview.subscribersLost.current ? parseInt(overview.subscribersLost.current, 10) : 0;
  const engRate = overview.engagementRate.current ?? 2.56;
  const avgDurationSec = overview.averageViewDurationSeconds.current ?? 30;
  const likesCount = overview.likes.current ? parseInt(overview.likes.current, 10) : 0;
  const commentsCount = overview.comments.current ? parseInt(overview.comments.current, 10) : 0;
  const sharesCount = overview.shares.current ? parseInt(overview.shares.current, 10) : 0;

  const handleGenerateAI = async () => {
    try {
      setIsLoading(true);
      setApiError(null);

      const res = await fetch("/api/ai/youtube-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelTitle: "Plottershub",
          views: viewsCount,
          viewsDelta: overview.views.percentageChange ? `+${overview.views.percentageChange}%` : null,
          watchTimeHours,
          avgDurationSec,
          netSubscribers: netSubs,
          subscribersGained: subsGained,
          subscribersLost: subsLost,
          likes: likesCount,
          comments: commentsCount,
          shares: sharesCount,
          engagementRate: engRate,
          totalSubscribersLifetime: overview.lifetimeStats?.totalSubscribers,
          lifetimeViews: overview.lifetimeStats?.totalViews,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gagal menghubungi Gemini AI API.");
      }

      setGeneratedData(json.data);
      setGeneratedAt(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
    } catch (err: any) {
      setApiError(err.message || "Terjadi kesalahan saat memproses analisis AI.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-border-subtle bg-surface">
      <CardHeader className="p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-border-strong bg-elevated text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  AI Growth Diagnostics
                </span>
                <Badge variant="secondary" className="text-[10px] font-mono py-0 px-1">
                  Gemini 2.5 Flash
                </Badge>
                {generatedAt && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    • {generatedAt} WIB
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Contextual diagnosis based on current observation window
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <Button
              onClick={handleGenerateAI}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="h-7 text-xs border-border-strong text-foreground gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
              <span>{isLoading ? "Analyzing..." : generatedData ? "Re-diagnose" : "Run AI Diagnosis"}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              aria-label={isCollapsed ? "Expand AI diagnosis" : "Collapse AI diagnosis"}
            >
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="pt-2 flex flex-wrap sm:flex-nowrap items-center gap-1">
            <div className="flex items-center rounded border border-border-subtle bg-elevated p-0.5 text-xs w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab("analysis")}
                className={`flex-1 sm:flex-initial px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "analysis"
                    ? "bg-surface text-foreground font-semibold border border-border-strong"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingUp className="h-3 w-3" />
                Analysis
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("conclusion")}
                className={`flex-1 sm:flex-initial px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "conclusion"
                    ? "bg-surface text-foreground font-semibold border border-border-strong"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Lightbulb className="h-3 w-3" />
                Conclusion
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("roadmap")}
                className={`flex-1 sm:flex-initial px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "roadmap"
                    ? "bg-surface text-foreground font-semibold border border-border-strong"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Compass className="h-3 w-3" />
                Roadmap
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tactics")}
                className={`flex-1 sm:flex-initial px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "tactics"
                    ? "bg-surface text-foreground font-semibold border border-border-strong"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Flame className="h-3 w-3" />
                Tactics
              </button>
            </div>
          </div>
        )}
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="p-3.5 sm:p-4 pt-0 text-xs text-foreground space-y-3 border-t border-border-subtle mt-2">
          {apiError && (
            <div className="p-2.5 rounded border border-negative/25 bg-negative/10 text-negative text-xs flex items-center justify-between">
              <span>{apiError}</span>
              <Button size="sm" variant="ghost" onClick={handleGenerateAI} className="h-6 text-xs text-negative">
                Retry
              </Button>
            </div>
          )}

          {/* Diagnostic Headline */}
          {generatedData?.summaryHeadline && (
            <div className="p-2.5 rounded border border-border-strong bg-elevated text-xs font-medium flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>{generatedData.summaryHeadline}</span>
            </div>
          )}

          {/* TAB 1: ANALYSIS */}
          {activeTab === "analysis" && (
            <div className="space-y-2.5">
              {generatedData?.analysis && generatedData.analysis.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {generatedData.analysis.map((item, idx) => (
                    <div key={idx} className="rounded border border-border-subtle bg-elevated p-3 flex flex-col justify-between space-y-1.5">
                      <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                        <span>{item.title}</span>
                        {item.highlight && (
                          <span className="text-positive font-mono font-medium text-[11px]">{item.highlight}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div className="rounded border border-border-subtle bg-elevated p-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Viral Trajectory</span>
                      <span className="text-positive font-mono font-semibold">+763.2%</span>
                    </div>
                    <div className="text-base font-semibold text-foreground font-mono">
                      {viewsCount > 0 ? viewsCount.toLocaleString() : "894,956"} Views
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Exponential reach increase indicating effective Shorts algorithmic distribution. Run live AI diagnosis for channel-specific breakdown.
                    </p>
                  </div>

                  <div className="rounded border border-border-subtle bg-elevated p-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Avg Watch Time</span>
                      <span className="text-foreground font-mono font-semibold">{avgDurationSec}s</span>
                    </div>
                    <div className="text-base font-semibold text-foreground font-mono">
                      {watchTimeHours > 0 ? `${watchTimeHours.toLocaleString()}h` : "7.4K h"}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Average watch time of 30 seconds demonstrates strong viewer interest in concise, direct-to-point formats.
                    </p>
                  </div>

                  <div className="rounded border border-border-subtle bg-elevated p-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Subscribers Net</span>
                      <span className="text-positive font-mono font-semibold">+{netSubs}</span>
                    </div>
                    <div className="text-base font-semibold text-foreground font-mono">
                      +{subsGained} / -{subsLost}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      ~0.7 new subscribers per 1,000 views. Opportunities exist for higher conversion with contextual end screens.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONCLUSION */}
          {activeTab === "conclusion" && (
            <div className="space-y-2.5">
              {generatedData?.conclusion && generatedData.conclusion.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {generatedData.conclusion.map((item, idx) => (
                    <div
                      key={idx}
                      className={`rounded border p-3 space-y-1 ${
                        item.type === "strength"
                          ? "border-positive/25 bg-positive/5 text-foreground"
                          : "border-amber-500/25 bg-amber-500/5 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-xs">
                        {item.type === "strength" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        )}
                        <span>{item.title}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="rounded border border-positive/25 bg-positive/5 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-positive font-semibold text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Channel Strengths
                    </div>
                    <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Strong initial viewer retention and algorithmic discovery.</li>
                      <li>High comment velocity indicating strong engagement interest.</li>
                      <li>Watch time progression indicates scaling channel potential.</li>
                    </ul>
                  </div>

                  <div className="rounded border border-amber-500/25 bg-amber-500/5 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Retention & Conversion Opportunities
                    </div>
                    <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Target <em>Viewed vs Swiped Away</em> &gt; 75% for continuous recommendation.</li>
                      <li>Incorporate content loops to encourage multi-video viewer sessions.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ROADMAP */}
          {activeTab === "roadmap" && (
            <div className="space-y-2.5">
              {generatedData?.roadmap && generatedData.roadmap.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {generatedData.roadmap.map((item, idx) => (
                    <div key={idx} className="rounded border border-border-subtle bg-elevated p-3 space-y-1">
                      <div className="text-[10px] font-mono font-semibold text-muted-foreground uppercase">{item.step}</div>
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {item.title}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="rounded border border-border-subtle bg-elevated p-3 space-y-1">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-muted-foreground" />
                      1. Double Down on Top Performer Topics
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Identify peak-performing video topics and create thematic sequels or multi-part breakdowns.
                    </p>
                  </div>

                  <div className="rounded border border-border-subtle bg-elevated p-3 space-y-1">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                      2. Related Video Cross-Linking
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Connect top-performing Shorts directly to long-form content using YouTube Studio related video cards.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TACTICS */}
          {activeTab === "tactics" && (
            <div className="rounded border border-border-subtle bg-elevated p-3 space-y-2">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                Tactical Growth Blueprint
              </div>

              {generatedData?.tactics && generatedData.tactics.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {generatedData.tactics.map((tac, idx) => (
                    <div key={idx} className="p-2 rounded bg-surface border border-border-subtle space-y-0.5">
                      <strong className="text-foreground block text-[11px]">{tac.title}</strong>
                      <span className="inline-block text-[10px] font-mono text-amber-400">
                        {tac.formula}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{tac.explanation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-surface border border-border-subtle space-y-0.5">
                    <strong className="text-foreground text-[11px] block">Average Percentage Viewed &gt; 90%</strong>
                    <p className="text-[11px] text-muted-foreground">
                      Maintain dynamic cuts every 2-3 seconds to maximize retention across complete playback duration.
                    </p>
                  </div>
                  <div className="p-2 rounded bg-surface border border-border-subtle space-y-0.5">
                    <strong className="text-foreground text-[11px] block">First 3-Second Hook Velocity</strong>
                    <p className="text-[11px] text-muted-foreground">
                      Eliminate slow introductions; start directly with the central question or payoff preview.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
