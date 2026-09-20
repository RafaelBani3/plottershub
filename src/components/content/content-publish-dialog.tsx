"use client";

import * as React from "react";
import {
  UploadCloud,
  FileVideo,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Search,
  X,
  Clock,
  Globe,
  Lock,
  EyeOff,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SanitizedSocialAccount } from "@/modules/social/types";
import {
  PublishingJobDTO,
  PublishingStatus,
  PublishingFailureMetadata,
} from "@/modules/publishing/publishing.types";

export interface ContentPublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  accounts: SanitizedSocialAccount[];
  initialContentId?: string;
  onSuccess?: (job: PublishingJobDTO) => void;
}

type Step = "media" | "details" | "thumbnail" | "visibility" | "progress";

export function ContentPublishDialog({
  open,
  onOpenChange,
  workspaceId,
  accounts,
  initialContentId,
  onSuccess,
}: ContentPublishDialogProps) {
  const [step, setStep] = React.useState<Step>("media");

  // Step 1: Media
  const [selectedVideoFile, setSelectedVideoFile] = React.useState<File | null>(null);
  const [stagedVideoKey, setStagedVideoKey] = React.useState<string | null>(null);
  const [isStagingVideo, setIsStagingVideo] = React.useState(false);

  // Step 2: Details
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [madeForKids, setMadeForKids] = React.useState(false);

  // Step 3: Thumbnail
  const [_thumbnailFile, setThumbnailFile] = React.useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = React.useState<string | null>(null);
  const [stagedThumbnailKey, setStagedThumbnailKey] = React.useState<string | null>(null);
  const [isStagingThumbnail, setIsStagingThumbnail] = React.useState(false);

  // Step 4: Visibility & Schedule
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>(
    accounts[0]?.id || ""
  );
  const [privacyStatus, setPrivacyStatus] = React.useState<"public" | "private" | "unlisted">("public");
  const [isScheduled, setIsScheduled] = React.useState(false);
  const [scheduleDate, setScheduleDate] = React.useState("");
  const [scheduleTime, setScheduleTime] = React.useState("12:00");
  const [timezone, setTimezone] = React.useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );

  // Step 5: Execution & Progress
  const [activeJob, setActiveJob] = React.useState<PublishingJobDTO | null>(null);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset state on open
  React.useEffect(() => {
    if (open) {
      setStep("media");
      setSelectedVideoFile(null);
      setStagedVideoKey(null);
      setIsStagingVideo(false);
      setTitle("");
      setDescription("");
      setTagsInput("");
      setMadeForKids(false);
      setThumbnailFile(null);
      setThumbnailPreviewUrl(null);
      setStagedThumbnailKey(null);
      setIsStagingThumbnail(false);
      setSelectedAccountId(accounts[0]?.id || "");
      setPrivacyStatus("public");
      setIsScheduled(false);
      setScheduleDate("");
      setScheduleTime("12:00");
      setActiveJob(null);
      setPublishError(null);
      setIsSubmitting(false);
    }
  }, [open, accounts]);

  // Stage Video
  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedVideoFile(file);
    if (!title) {
      // Set default title from file name without extension
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setTitle(baseName.substring(0, 100));
    }

    setIsStagingVideo(true);
    setPublishError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspaceId", workspaceId);

      const res = await fetch("/api/content/stage-media", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to stage video file.");
      }

      const data = await res.json();
      setStagedVideoKey(data.storageKey);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error staging video file";
      setPublishError(message);
    } finally {
      setIsStagingVideo(false);
    }
  };

  // Stage Thumbnail
  const handleThumbnailSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type: JPEG or PNG
    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      setPublishError("Thumbnails must be JPEG or PNG format (YouTube API restriction).");
      return;
    }

    // Validate size: 2MB max for YouTube custom thumbnails
    if (file.size > 2 * 1024 * 1024) {
      setPublishError("Thumbnail size must not exceed 2MB.");
      return;
    }

    setThumbnailFile(file);
    setThumbnailPreviewUrl(URL.createObjectURL(file));
    setIsStagingThumbnail(true);
    setPublishError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspaceId", workspaceId);

      const res = await fetch("/api/content/stage-media", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to stage thumbnail.");
      }

      const data = await res.json();
      setStagedThumbnailKey(data.storageKey);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error staging thumbnail";
      setPublishError(message);
    } finally {
      setIsStagingThumbnail(false);
    }
  };

  // Start Publishing
  const handlePublishSubmit = async () => {
    if (!stagedVideoKey) {
      setPublishError("Video must be staged before publishing.");
      return;
    }
    if (!selectedAccountId) {
      setPublishError("A YouTube account must be selected.");
      return;
    }

    setIsSubmitting(true);
    setPublishError(null);
    setStep("progress");

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      let publishAtIso: string | undefined = undefined;
      if (isScheduled && scheduleDate) {
        const combined = new Date(`${scheduleDate}T${scheduleTime || "00:00"}:00`);
        if (isNaN(combined.getTime())) {
          throw new Error("Invalid schedule date or time format.");
        }
        publishAtIso = combined.toISOString();
      }

      // If initialContentId is not provided, create a placeholder content or use a temporary ID
      const contentId = initialContentId || `temp_${Date.now()}`;

      const res = await fetch(`/api/content/${contentId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          socialAccountId: selectedAccountId,
          videoStorageKey: stagedVideoKey,
          title: title || selectedVideoFile?.name || "Untitled Video",
          description,
          tags,
          privacyStatus: isScheduled ? "private" : privacyStatus,
          publishAt: publishAtIso,
          publishingTimezone: timezone,
          madeForKids,
          thumbnailStorageKey: stagedThumbnailKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Publishing request failed.");
      }

      setActiveJob(data.job);
      if (onSuccess) {
        onSuccess(data.job);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate publishing";
      setPublishError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Polling active job progress if still running
  React.useEffect(() => {
    if (!activeJob || !open) return;

    const terminalStatuses: string[] = [
      PublishingStatus.PUBLISHED,
      PublishingStatus.SCHEDULED,
      PublishingStatus.FAILED,
      PublishingStatus.CANCELLED,
    ];
    const isTerminal = terminalStatuses.includes(activeJob.publishingStatus);

    if (isTerminal) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/publishing-jobs/${activeJob.id}?workspaceId=${encodeURIComponent(workspaceId)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.job) {
            setActiveJob(data.job);
            if (data.job.publishingStatus === PublishingStatus.PUBLISHED && onSuccess) {
              onSuccess(data.job);
            }
          }
        }
      } catch {
        // Silently retry on next interval
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJob, open, workspaceId, onSuccess]);

  // Actions on Job
  const handleResume = async () => {
    if (!activeJob) return;
    setIsSubmitting(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/publishing-jobs/${activeJob.id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resume job.");
      setActiveJob(data.job);
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : "Failed to resume");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReconcile = async () => {
    if (!activeJob) return;
    setIsSubmitting(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/publishing-jobs/${activeJob.id}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reconcile job.");
      setActiveJob(data.job);
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : "Failed to reconcile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeJob) return;
    setIsSubmitting(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/publishing-jobs/${activeJob.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel job.");
      setActiveJob(data.job);
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const calculateProgressPercent = () => {
    if (!activeJob?.totalBytes || activeJob.totalBytes === 0) {
      return activeJob?.publishingStatus === PublishingStatus.PUBLISHED ? 100 : 0;
    }
    return Math.min(
      100,
      Math.round((activeJob.bytesUploaded / activeJob.totalBytes) * 100)
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl bg-surface border border-border-subtle p-0 overflow-hidden shadow-xl"
        onClose={() => onOpenChange(false)}
      >
        {/* Modal Header with Stepper */}
        <div className="border-b border-border-subtle bg-muted/20 px-5 py-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Publish Video to YouTube
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Direct-to-YouTube resumable chunked upload with scheduling and recovery.
            </DialogDescription>
          </DialogHeader>

          {/* Stepper Tabs */}
          <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-xs">
            {[
              { id: "media", label: "1. Media" },
              { id: "details", label: "2. Details" },
              { id: "thumbnail", label: "3. Thumbnail" },
              { id: "visibility", label: "4. Visibility" },
              { id: "progress", label: "5. Status" },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (activeJob && s.id !== "progress") return; // Keep locked on progress once started
                  setStep(s.id as Step);
                }}
                disabled={Boolean(activeJob && s.id !== "progress")}
                className={`flex items-center gap-1 font-medium transition-colors ${
                  step === s.id
                    ? "text-primary border-b-2 border-primary pb-0.5"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4 text-xs text-foreground">
          {publishError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs">Upload Error</p>
                <p className="mt-0.5 text-xs">{publishError}</p>
              </div>
            </div>
          )}

          {/* STEP 1: MEDIA */}
          {step === "media" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-subtle p-8 text-center bg-muted/10 hover:bg-muted/20 transition-colors">
                <UploadCloud className="h-10 w-10 text-muted-foreground mb-3" />
                <h4 className="text-sm font-semibold">Select or Drop Video File</h4>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                  Supports MP4, MOV, WebM, and AVI. Staged chunked uploads are aligned to 256 KiB chunks.
                </p>

                <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  <span>Browse Video File</span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleVideoSelect}
                    disabled={isStagingVideo}
                  />
                </label>
              </div>

              {isStagingVideo && (
                <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface p-3">
                  <RotateCw className="h-4 w-4 animate-spin text-primary" />
                  <span>Staging video file to local storage...</span>
                </div>
              )}

              {selectedVideoFile && stagedVideoKey && (
                <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                  <div className="flex items-center gap-2.5">
                    <FileVideo className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="font-semibold text-xs">{selectedVideoFile.name}</p>
                      <p className="text-[11px] opacity-80">{formatBytes(selectedVideoFile.size)} • Ready for upload</p>
                    </div>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              )}
            </div>
          )}

          {/* STEP 2: DETAILS */}
          {step === "details" && (
            <div className="space-y-3">
              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Video Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a descriptive video title (max 100 characters)"
                  className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
                />
                <div className="flex justify-end mt-1 text-[10px] text-muted-foreground">
                  {title.length} / 100
                </div>
              </div>

              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Description
                </label>
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Video description, links, credits, and chapters..."
                  className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
                />
                <div className="flex justify-end mt-1 text-[10px] text-muted-foreground">
                  {description.length} / 5000
                </div>
              </div>

              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. plotters, creative-coding, generative art"
                  className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="madeForKids"
                  checked={madeForKids}
                  onChange={(e) => setMadeForKids(e.target.checked)}
                  className="rounded border-border-subtle text-primary focus:ring-focus"
                />
                <label htmlFor="madeForKids" className="cursor-pointer text-xs text-foreground">
                  This video is made for kids (COPPA compliance)
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: THUMBNAIL */}
          {step === "thumbnail" && (
            <div className="space-y-4">
              <div className="rounded-md border border-border-subtle bg-surface p-3">
                <h4 className="font-semibold text-xs">Custom Video Thumbnail (Optional)</h4>
                <p className="mt-0.5 text-muted-foreground text-[11px]">
                  YouTube requires JPEG or PNG images under 2MB. WebP must be converted before upload.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex h-36 w-60 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-muted/20 overflow-hidden relative">
                  {thumbnailPreviewUrl ? (
                    <img
                      src={thumbnailPreviewUrl}
                      alt="Thumbnail Preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mb-1 opacity-50" />
                      <span className="text-[11px]">No Thumbnail Selected</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-hover transition-colors">
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={handleThumbnailSelect}
                      disabled={isStagingThumbnail}
                    />
                  </label>
                  {isStagingThumbnail && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <RotateCw className="h-3 w-3 animate-spin text-primary" /> Staging thumbnail...
                    </p>
                  )}
                  {stagedThumbnailKey && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Thumbnail staged successfully.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: VISIBILITY & SCHEDULE */}
          {step === "visibility" && (
            <div className="space-y-4">
              {/* Account Selector */}
              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Target YouTube Channel
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.displayName || acc.username} ({acc.platformCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Visibility Selection */}
              <div>
                <label className="block font-medium text-muted-foreground mb-1.5">
                  Visibility
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { val: "public", label: "Public", icon: Globe, desc: "Everyone can see" },
                    { val: "unlisted", label: "Unlisted", icon: EyeOff, desc: "Anyone with link" },
                    { val: "private", label: "Private", icon: Lock, desc: "Only you" },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      disabled={isScheduled}
                      onClick={() => setPrivacyStatus(opt.val as "public" | "private" | "unlisted")}
                      className={`flex flex-col items-start p-3 rounded-md border text-left transition-all ${
                        privacyStatus === opt.val
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border-subtle bg-surface text-foreground hover:bg-muted/10"
                      } ${isScheduled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-xs">
                        <opt.icon className="h-3.5 w-3.5" />
                        <span>{opt.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</span>
                    </button>
                  ))}
                </div>
                {isScheduled && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    * YouTube native scheduling requires privacyStatus to be Private until publishAt.
                  </p>
                )}
              </div>

              {/* Scheduling Section */}
              <div className="rounded-md border border-border-subtle bg-surface p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-xs">Schedule for Later</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => {
                      setIsScheduled(e.target.checked);
                      if (e.target.checked) setPrivacyStatus("private");
                    }}
                    className="rounded border-border-subtle text-primary focus:ring-focus"
                  />
                </div>

                {isScheduled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-border-subtle">
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">Date</label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">Time</label>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">IANA Timezone</label>
                      <input
                        type="text"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-focus"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: PROGRESS & EXECUTION */}
          {step === "progress" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">Publishing Pipeline Status</span>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                    activeJob?.publishingStatus === PublishingStatus.PUBLISHED
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : activeJob?.publishingStatus === PublishingStatus.FAILED
                      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      : activeJob?.publishingStatus === PublishingStatus.RECONCILING
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                  }`}>
                    {activeJob?.publishingStatus || (isSubmitting ? "INITIATING..." : "READY")}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${calculateProgressPercent()}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>
                      {activeJob?.bytesUploaded ? formatBytes(activeJob.bytesUploaded) : "0 Bytes"}
                      {activeJob?.totalBytes ? ` / ${formatBytes(activeJob.totalBytes)}` : ""}
                    </span>
                    <span>{calculateProgressPercent()}%</span>
                  </div>
                </div>

                {/* Thumbnail Sub-Status */}
                {activeJob?.thumbnailStatus && (
                  <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px]">
                    <span className="text-muted-foreground">Thumbnail Status:</span>
                    <span className="font-medium text-foreground">{activeJob.thumbnailStatus}</span>
                  </div>
                )}

                {/* Diagnostic Details if Failed or Reconciling */}
                {activeJob?.errorMessage && (
                  <div className="rounded border border-red-200 bg-red-50 p-2.5 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300 space-y-1 text-xs">
                    <p className="font-semibold">Error [{activeJob.errorCode || "FAILURE"}]:</p>
                    <p className="text-[11px]">{activeJob.errorMessage}</p>
                    {(activeJob.metadata as PublishingFailureMetadata)?.requiresManualReview && (
                      <p className="mt-1 font-semibold text-amber-800 dark:text-amber-300 text-[10px]">
                        ⚠️ Manual Review Required: Video state ambiguous on YouTube.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons for Interrupted / Failed / Reconciling Jobs */}
              {activeJob && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {activeJob.publishingStatus === PublishingStatus.FAILED &&
                    (activeJob.metadata as PublishingFailureMetadata)?.retryable && (
                      <Button
                        size="sm"
                        onClick={handleResume}
                        disabled={isSubmitting}
                        className="gap-1.5 h-8 text-xs"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                        <span>Retry Upload</span>
                      </Button>
                    )}

                  {(activeJob.publishingStatus === PublishingStatus.RECONCILING ||
                    activeJob.publishingStatus === PublishingStatus.FAILED) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleReconcile}
                      disabled={isSubmitting}
                      className="gap-1.5 h-8 text-xs"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>Reconcile Session</span>
                    </Button>
                  )}

                  {(
                    [
                      PublishingStatus.QUEUED,
                      PublishingStatus.UPLOADING,
                      PublishingStatus.RECONCILING,
                    ] as string[]
                  ).includes(activeJob.publishingStatus) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      disabled={isSubmitting}
                      className="gap-1.5 h-8 text-xs text-red-600 hover:text-red-700"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Cancel Job</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-border-subtle bg-muted/10 px-5 py-3">
          {step !== "media" && step !== "progress" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (step === "details") setStep("media");
                else if (step === "thumbnail") setStep("details");
                else if (step === "visibility") setStep("thumbnail");
              }}
              className="gap-1 h-8 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {step === "media" && (
              <Button
                size="sm"
                disabled={!stagedVideoKey || isStagingVideo}
                onClick={() => setStep("details")}
                className="gap-1 h-8 text-xs"
              >
                <span>Next: Details</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}

            {step === "details" && (
              <Button
                size="sm"
                disabled={!title.trim()}
                onClick={() => setStep("thumbnail")}
                className="gap-1 h-8 text-xs"
              >
                <span>Next: Thumbnail</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}

            {step === "thumbnail" && (
              <Button
                size="sm"
                disabled={isStagingThumbnail}
                onClick={() => setStep("visibility")}
                className="gap-1 h-8 text-xs"
              >
                <span>Next: Visibility</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}

            {step === "visibility" && (
              <Button
                size="sm"
                disabled={isSubmitting || !selectedAccountId}
                onClick={handlePublishSubmit}
                className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>{isScheduled ? "Schedule Video" : "Publish Video"}</span>
              </Button>
            )}

            {step === "progress" && activeJob?.publishingStatus === PublishingStatus.PUBLISHED && (
              <Button
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 text-xs"
              >
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
