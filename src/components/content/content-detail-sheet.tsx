"use client";

import * as React from "react";
import Link from "next/link";
import {
  ExternalLink,
  Eye,
  ThumbsUp,
  MessageSquare,
  BarChart2,
  Tag,
  Edit3,
  ListPlus,
  Image as ImageIcon,
  RotateCw,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContentListItemDTO } from "./content-types";
import { CommentSection } from "@/components/comment/comment-section";
import { PlaylistSection } from "@/components/playlist/playlist-section";

export interface ContentDetailSheetProps {
  item: ContentListItemDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditClick?: (item: ContentListItemDTO) => void;
  workspaceId?: string;
  userRole?: string;
}

export function ContentDetailSheet({
  item,
  open,
  onOpenChange,
  onEditClick,
  workspaceId,
  userRole = "VIEWER",
}: ContentDetailSheetProps) {
  const [activeTab, setActiveTab] = React.useState<"overview" | "comments" | "playlists">("overview");
  const [isUploadingThumbnail, setIsUploadingThumbnail] = React.useState(false);
  const [thumbnailMessage, setThumbnailMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  React.useEffect(() => {
    if (open) {
      setActiveTab("overview");
      setThumbnailMessage(null);
      setIsUploadingThumbnail(false);
    }
  }, [open, item?.id]);

  const canEdit = ["OWNER", "ADMIN", "EDITOR"].includes(userRole);

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !item || !workspaceId) return;

    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      setThumbnailMessage({ type: "error", text: "Thumbnails must be JPEG or PNG format." });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setThumbnailMessage({ type: "error", text: "Thumbnail size must not exceed 2MB." });
      return;
    }

    setIsUploadingThumbnail(true);
    setThumbnailMessage(null);

    try {
      // Step 1: Stage media
      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspaceId", workspaceId);

      const stageRes = await fetch("/api/content/stage-media", {
        method: "POST",
        body: formData,
      });

      if (!stageRes.ok) {
        const data = await stageRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to stage thumbnail file.");
      }

      const stageData = await stageRes.json();

      // Step 2: Upload custom thumbnail to YouTube
      const thumbRes = await fetch(`/api/content/${item.id}/thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          socialAccountId: item.socialAccountId,
          thumbnailStorageKey: stageData.storageKey,
        }),
      });

      if (!thumbRes.ok) {
        const data = await thumbRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to upload thumbnail to YouTube.");
      }

      setThumbnailMessage({ type: "success", text: "Custom thumbnail updated successfully on YouTube!" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error updating thumbnail";
      setThumbnailMessage({ type: "error", text: msg });
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  if (!item) return null;

  const thumbnail =
    item.thumbnails?.maxres?.url ||
    item.thumbnails?.standard?.url ||
    item.thumbnails?.high?.url ||
    item.thumbnails?.medium?.url;

  const youtubeWatchUrl = item.externalContentId
    ? `https://www.youtube.com/watch?v=${item.externalContentId}`
    : item.externalUrl || null;

  const formatNumber = (val?: number | string | null) => {
    if (val === null || val === undefined) return "—";
    const num = typeof val === "string" ? Number(val) : val;
    if (isNaN(num)) return "—";
    return new Intl.NumberFormat("en-US").format(num);
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "—";
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "medium",
    }).format(date);
  };

  const renderConfidenceBadge = () => {
    const confidence = item.classificationConfidence;
    const source = item.classificationSource;

    let color = "bg-muted text-muted-foreground border-border-subtle";
    if (confidence === "HIGH") {
      color = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400";
    } else if (confidence === "MODERATE") {
      color = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400";
    }

    return (
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${color}`}>
        {confidence} ({source})
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 overflow-hidden bg-surface border border-border-subtle shadow-xl"
        onClose={() => onOpenChange(false)}
      >
        {/* Header Bar */}
        <div className="border-b border-border-subtle px-5 pt-3.5 pb-0 bg-muted/20">
          <div className="flex items-center justify-between pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Video Details
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="font-mono text-xs text-muted-foreground">
                {item.externalContentId || item.id}
              </span>
            </div>
          </div>

          {/* Navigation Tabs (Overview, Comments, Playlists) */}
          <div className="flex items-center gap-1 border-t border-border-subtle/50 pt-1 -mb-[1px]">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "overview"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("comments")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "comments"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-3 w-3" />
              <span>Comments</span>
              {item.metrics?.comments && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                  {formatNumber(item.metrics.comments)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("playlists")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "playlists"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListPlus className="h-3 w-3" />
              <span>Playlists</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4 space-y-5">
          {activeTab === "comments" ? (
            <CommentSection
              videoId={item.externalContentId || item.id}
              socialAccountId={item.socialAccountId}
              workspaceId={workspaceId || ""}
              userRole={userRole}
            />
          ) : activeTab === "playlists" ? (
            <PlaylistSection
              videoId={item.externalContentId || item.id}
              socialAccountId={item.socialAccountId}
              workspaceId={workspaceId || ""}
              userRole={userRole}
            />
          ) : (
            <>
              {/* Top Section: Media & Primary Title */}
          <div className="space-y-3">
            {thumbnail && (
              <div className="relative aspect-video w-full rounded-md overflow-hidden bg-black border border-border-subtle">
                <img
                  src={thumbnail}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
                {item.formattedDuration && (
                  <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-mono font-medium text-white">
                    {item.formattedDuration}
                  </div>
                )}
                {youtubeWatchUrl && (
                  <a
                    href={youtubeWatchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-2 right-2 flex items-center gap-1.5 rounded-md bg-black/75 px-2.5 py-1 text-xs font-medium text-white hover:bg-black transition-colors"
                  >
                    <span>Watch on YouTube</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {/* Custom Thumbnail Upload Option */}
            {canEdit && item.externalContentId && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Custom Thumbnail:</span>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-hover transition-colors">
                    {isUploadingThumbnail ? (
                      <RotateCw className="h-3 w-3 animate-spin text-primary" />
                    ) : (
                      <ImageIcon className="h-3 w-3 text-primary" />
                    )}
                    <span>{isUploadingThumbnail ? "Updating..." : "Change Thumbnail"}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={handleThumbnailUpload}
                      disabled={isUploadingThumbnail}
                    />
                  </label>
                </div>
                {thumbnailMessage && (
                  <p
                    className={`text-[11px] font-medium ${
                      thumbnailMessage.type === "success"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {thumbnailMessage.text}
                  </p>
                )}
              </div>
            )}

            <div>
              <h2 className="text-base font-semibold text-foreground leading-snug">
                {item.title}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Channel: <span className="font-medium text-foreground">{item.socialAccountName || "YouTube Channel"}</span>
              </p>
            </div>
          </div>

          {/* Classification & Confidence Card */}
          <div className="rounded-md border border-border-subtle bg-muted/20 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Format Classification:</span>
                <span className="text-xs font-bold text-foreground">{item.contentType}</span>
              </div>
              {renderConfidenceBadge()}
            </div>
            {item.classificationRationale && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Rationale:</span> {item.classificationRationale}
              </p>
            )}
          </div>

          {/* Public Metrics Overview */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Public Performance Metrics
            </h3>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-md border border-border-subtle bg-surface p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Eye className="h-3.5 w-3.5 text-blue-500" />
                  <span>Views</span>
                </div>
                <div className="mt-1 text-lg font-bold text-foreground">
                  {formatNumber(item.metrics?.views)}
                </div>
              </div>

              <div className="rounded-md border border-border-subtle bg-surface p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Likes</span>
                </div>
                <div className="mt-1 text-lg font-bold text-foreground">
                  {formatNumber(item.metrics?.likes)}
                </div>
              </div>

              <div className="rounded-md border border-border-subtle bg-surface p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5 text-purple-500" />
                  <span>Comments</span>
                </div>
                <div className="mt-1 text-lg font-bold text-foreground">
                  {formatNumber(item.metrics?.comments)}
                </div>
              </div>

              <div className="rounded-md border border-border-subtle bg-surface p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BarChart2 className="h-3.5 w-3.5 text-amber-500" />
                  <span>Engagement</span>
                </div>
                <div className="mt-1 text-lg font-bold text-foreground">
                  {item.metrics?.engagementRate !== undefined && item.metrics?.engagementRate !== null
                    ? `${(item.metrics.engagementRate * 100).toFixed(2)}%`
                    : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Operational Metadata Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Operational Metadata
            </h3>
            <div className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface text-xs">
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Published Timestamp</span>
                <span className="font-medium text-foreground text-right">{formatDate(item.publishedAt)}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Privacy Status</span>
                <span className="font-medium text-foreground capitalize">{item.privacyStatus?.toLowerCase() || "—"}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono font-medium text-foreground">{item.formattedDuration || "—"}</span>
              </div>
              {item.metadata?.categoryId && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Category ID</span>
                  <span className="font-medium text-foreground">{item.metadata.categoryId}</span>
                </div>
              )}
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Made for Kids</span>
                <span className="font-medium text-foreground">
                  {item.metadata?.madeForKids ? "Yes" : "No / Not specified"}
                </span>
              </div>
              {item.metadata?.license && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">License</span>
                  <span className="font-medium text-foreground">{item.metadata.license}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {item.metadata?.tags && item.metadata.tags.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tags ({item.metadata.tags.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {item.metadata.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-[11px] text-foreground border border-border-subtle"
                  >
                    <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                    <span>{tag}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {item.description && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </h3>
              <div className="rounded-md border border-border-subtle bg-muted/10 p-3 text-xs text-foreground whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                {item.description}
              </div>
            </div>
          )}

          {/* Quick Edit Action Banner */}
          <div className="flex items-center justify-between rounded-md border border-border-subtle bg-muted/20 p-3 text-xs">
            <div className="flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Modify title, description, tags, privacy, or COPPA settings.</span>
            </div>
            {onEditClick && (
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEditClick(item);
                }}
                className="h-7 text-xs px-3 gap-1"
              >
                <span>Edit</span>
              </Button>
            )}
          </div>
            </>
          )}
        </div>


        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3 bg-muted/20">
          <div className="flex items-center gap-2">
            {item.externalContentId && (
              <Link href={`/analytics?videoId=${item.externalContentId}`}>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8">
                  <BarChart2 className="h-3.5 w-3.5 text-primary" />
                  <span>Deep Analytics</span>
                </Button>
              </Link>
            )}
            {onEditClick && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onEditClick(item);
                }}
                className="gap-1.5 text-xs h-8"
              >
                <Edit3 className="h-3.5 w-3.5 text-primary" />
                <span>Edit Video</span>
              </Button>
            )}
          </div>

          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 px-4 text-xs"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
