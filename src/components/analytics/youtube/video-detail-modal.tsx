import * as React from "react";
import { VideoDetailData } from "@/modules/social/analytics/dashboard.types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatMetricValue, formatWatchTime } from "./youtube-formatters";
import { Calendar, PlaySquare, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface VideoDetailModalProps {
  videoId: string | null;
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  socialAccountId: string;
  startDate: string;
  endDate: string;
}

export function VideoDetailModal({
  videoId,
  isOpen,
  onClose,
  workspaceId,
  socialAccountId,
  startDate,
  endDate,
}: VideoDetailModalProps) {
  const [data, setData] = React.useState<VideoDetailData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchDetail = React.useCallback(async () => {
    if (!videoId || !workspaceId || !socialAccountId) return;

    try {
      setIsLoading(true);
      setError(null);
      const url = `/api/social/youtube/analytics/videos/${encodeURIComponent(videoId)}?workspaceId=${encodeURIComponent(
        workspaceId
      )}&socialAccountId=${encodeURIComponent(socialAccountId)}&startDate=${encodeURIComponent(
        startDate
      )}&endDate=${encodeURIComponent(endDate)}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load video details (${res.status})`);
      }
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message || "Failed to load video performance details");
    } finally {
      setIsLoading(false);
    }
  }, [videoId, workspaceId, socialAccountId, startDate, endDate]);

  React.useEffect(() => {
    if (isOpen && videoId) {
      fetchDetail();
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, videoId, fetchDetail]);

  const video = data?.video;
  const totals = data?.periodTotals;
  const dailySeries = data?.dailySeries || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onClose={onClose}
        className="max-w-2xl bg-elevated border-border-strong text-foreground max-h-[85vh] overflow-y-auto p-4 sm:p-5"
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <PlaySquare className="h-4 w-4 text-youtube shrink-0" />
            <span className="truncate">{video?.title || "Video Analytics Detail"}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Performance metrics for video {videoId} over the selected window
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground animate-pulse space-y-3">
            <div className="h-4 w-48 bg-surface mx-auto rounded" />
            <div className="h-20 w-full bg-surface/50 rounded" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-negative space-y-3">
            <AlertCircle className="h-6 w-6 mx-auto text-negative" />
            <p className="text-xs">{error}</p>
            <Button size="sm" variant="outline" onClick={fetchDetail} className="border-negative/30 text-negative">
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Retry
            </Button>
          </div>
        ) : !data ? null : (
          <div className="space-y-4">
            {/* Metadata bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-border-subtle pb-2.5">
              <div className="flex items-center gap-3 text-muted-foreground">
                {video?.publishedAt && (
                  <span className="flex items-center gap-1 text-[11px]">
                    <Calendar className="h-3 w-3" />
                    Published: {new Date(video.publishedAt).toLocaleDateString()}
                  </span>
                )}
                {video?.externalUrl && (
                  <a
                    href={video.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-foreground hover:underline text-[11px]"
                  >
                    Watch on YouTube
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Period totals grid */}
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-1.5">Period Totals</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded bg-surface p-2 border border-border-subtle">
                  <div className="text-[10px] text-muted-foreground">Views</div>
                  <div className="text-xs font-semibold text-foreground font-mono">
                    {formatMetricValue(totals?.views, "integer")}
                  </div>
                </div>
                <div className="rounded bg-surface p-2 border border-border-subtle">
                  <div className="text-[10px] text-muted-foreground">Watch Time</div>
                  <div className="text-xs font-semibold text-foreground font-mono">
                    {formatWatchTime(totals?.estimatedMinutesWatched)}
                  </div>
                </div>
                <div className="rounded bg-surface p-2 border border-border-subtle">
                  <div className="text-[10px] text-muted-foreground">Avg Duration</div>
                  <div className="text-xs font-semibold text-foreground font-mono">
                    {formatMetricValue(totals?.averageViewDuration, "duration")}
                  </div>
                </div>
                <div className="rounded bg-surface p-2 border border-border-subtle">
                  <div className="text-[10px] text-muted-foreground">Engagement</div>
                  <div className="text-xs font-semibold text-foreground font-mono">
                    {formatMetricValue(totals?.engagementRate, "percent")}
                  </div>
                </div>
              </div>
            </div>

            {/* Daily time series listing */}
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-1.5">Daily Progression</h4>
              {dailySeries.length === 0 ? (
                <div className="rounded border border-border-subtle bg-surface p-4 text-center text-xs text-muted-foreground">
                  Daily historical performance is not available for this video.
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded border border-border-subtle bg-surface">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-elevated text-muted-foreground border-b border-border-subtle text-[11px]">
                      <tr>
                        <th className="py-1.5 px-2.5 font-medium">Date</th>
                        <th className="py-1.5 px-2.5 font-medium text-right">Views</th>
                        <th className="py-1.5 px-2.5 font-medium text-right">Watch Time</th>
                        <th className="py-1.5 px-2.5 font-medium text-right">Likes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle text-foreground text-[11px]">
                      {dailySeries.map((d) => (
                        <tr key={d.date} className="hover:bg-hover/40">
                          <td className="py-1 px-2.5 text-muted-foreground">{d.date}</td>
                          <td className="py-1 px-2.5 text-right font-medium text-foreground">
                            {formatMetricValue(d.views, "integer")}
                          </td>
                          <td className="py-1 px-2.5 text-right text-muted-foreground">
                            {formatWatchTime(d.estimatedMinutesWatched)}
                          </td>
                          <td className="py-1 px-2.5 text-right text-muted-foreground">
                            {formatMetricValue(d.likes, "integer")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
