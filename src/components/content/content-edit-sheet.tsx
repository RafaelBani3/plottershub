"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContentListItemDTO } from "./content-types";
import {
  Loader2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

export interface ContentEditSheetProps {
  item: ContentListItemDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onSuccess?: (updatedItem: ContentListItemDTO) => void;
}

const YOUTUBE_CATEGORIES = [
  { id: "1", label: "Film & Animation" },
  { id: "2", label: "Autos & Vehicles" },
  { id: "10", label: "Music" },
  { id: "15", label: "Pets & Animals" },
  { id: "17", label: "Sports" },
  { id: "19", label: "Travel & Events" },
  { id: "20", label: "Gaming" },
  { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" },
  { id: "24", label: "Entertainment" },
  { id: "25", label: "News & Politics" },
  { id: "26", label: "Howto & Style" },
  { id: "27", label: "Education" },
  { id: "28", label: "Science & Technology" },
];

export function ContentEditSheet({
  item,
  open,
  onOpenChange,
  workspaceId,
  onSuccess,
}: ContentEditSheetProps) {
  const initialTags = item?.metadata?.tags || [];
  const initialPrivacyRaw =
    item?.metadata?.privacyStatus?.toLowerCase() ||
    item?.privacyStatus?.toLowerCase() ||
    "public";
  const initialPrivacy =
    initialPrivacyRaw === "private" || initialPrivacyRaw === "unlisted"
      ? (initialPrivacyRaw as "public" | "unlisted" | "private")
      : "public";

  const [title, setTitle] = useState(item?.title || "");
  const [description, setDescription] = useState(item?.description || "");
  const [tagsInput, setTagsInput] = useState(initialTags.join(", "));
  const [categoryId, setCategoryId] = useState(item?.metadata?.categoryId || "28");
  const [privacyStatus, setPrivacyStatus] = useState<"public" | "unlisted" | "private">(initialPrivacy);
  const [isScheduled, setIsScheduled] = useState(Boolean(item?.metadata?.publishAt));
  const [publishAt, setPublishAt] = useState(() => {
    if (!item?.metadata?.publishAt) return "";
    try {
      return new Date(item.metadata.publishAt).toISOString().slice(0, 16);
    } catch {
      return "";
    }
  });
  const [selfDeclaredMadeForKids, setSelfDeclaredMadeForKids] = useState(Boolean(item?.metadata?.madeForKids));
  const [containsSyntheticMedia, setContainsSyntheticMedia] = useState(
    Boolean((item?.metadata as any)?.containsSyntheticMedia)
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Initialize form when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title || "");
      setDescription(item.description || "");
      const tags = item.metadata?.tags || [];
      setTagsInput(tags.join(", "));
      setCategoryId(item.metadata?.categoryId || "28");

      const rawPrivacy = item.metadata?.privacyStatus?.toLowerCase() || item.privacyStatus?.toLowerCase() || "public";
      const validPrivacy = rawPrivacy === "private" || rawPrivacy === "unlisted" ? rawPrivacy : "public";
      setPrivacyStatus(validPrivacy);

      if (item.metadata?.publishAt) {
        setIsScheduled(true);
        // Format ISO date to datetime-local (YYYY-MM-DDTHH:mm)
        try {
          const dateObj = new Date(item.metadata.publishAt);
          setPublishAt(dateObj.toISOString().slice(0, 16));
        } catch {
          setPublishAt("");
        }
      } else {
        setIsScheduled(false);
        setPublishAt("");
      }

      setSelfDeclaredMadeForKids(Boolean(item.metadata?.madeForKids));
      setContainsSyntheticMedia(Boolean((item.metadata as any)?.containsSyntheticMedia));

      setError(null);
      setIsDirty(false);
      setShowConfirmClose(false);
    }
  }, [item, open]);

  if (!item) return null;

  // Character counts and limits
  const titleCharCount = title.length;
  const descCharCount = description.length;
  const parsedTags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const tagsCumulativeLength = parsedTags.reduce((acc, t) => acc + t.length, 0);

  const hasTitleTagWarning = title.includes("<") || title.includes(">");
  const hasDescTagWarning = description.includes("<") || description.includes(">");

  const handleCloseAttempt = () => {
    if (isDirty && !saving) {
      setShowConfirmClose(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;

    setError(null);

    // Client validation
    if (titleCharCount < 1 || titleCharCount > 100) {
      setError("Title must be between 1 and 100 characters.");
      return;
    }
    if (hasTitleTagWarning || hasDescTagWarning) {
      setError("Title and description cannot contain '<' or '>' characters.");
      return;
    }
    if (descCharCount > 5000) {
      setError("Description cannot exceed 5,000 characters.");
      return;
    }
    if (tagsCumulativeLength > 500) {
      setError(`Tags cumulative character length (${tagsCumulativeLength}) exceeds maximum of 500.`);
      return;
    }
    if (isScheduled && !publishAt) {
      setError("Please select a date and time for scheduled release.");
      return;
    }

    setSaving(true);

    try {
      const payload: Record<string, any> = {
        workspaceId,
        title: title.trim(),
        description,
        tags: parsedTags,
        categoryId,
        privacyStatus: isScheduled ? "private" : privacyStatus,
        selfDeclaredMadeForKids,
        containsSyntheticMedia,
      };

      if (isScheduled && publishAt) {
        payload.publishAt = new Date(publishAt).toISOString();
      } else if (!isScheduled && item.metadata?.publishAt) {
        payload.publishAt = null; // Clear schedule
      }

      const res = await fetch(`/api/content/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError("A synchronization or update is currently in progress for this video. Please wait a moment and retry.");
        } else if (res.status === 403 && data.error?.includes("permissions")) {
          setError("Account lacks write permissions. Please re-authorize with YouTube editing permissions.");
        } else {
          setError(data.error || "Failed to update video on YouTube.");
        }
        setSaving(false);
        return;
      }

      setIsDirty(false);
      setSaving(false);
      onOpenChange(false);

      if (onSuccess && data.item) {
        onSuccess(data.item);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error while saving changes.");
      setSaving(false);
    }
  };

  const isAlreadyPublished = item.publishedAt && item.privacyStatus !== "PRIVATE";

  return (
    <Dialog open={open} onOpenChange={handleCloseAttempt}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-border-subtle bg-surface text-foreground shadow-lg">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-border-subtle sticky top-0 bg-surface/95 backdrop-blur z-10">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Edit YouTube Video
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Channel: <span className="font-medium text-foreground">{item.socialAccountName}</span> • Changes are synced directly to YouTube
              </DialogDescription>
            </div>
            {item.externalUrl && (
              <a
                href={item.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <span>View on YouTube</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </DialogHeader>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="edit-title" className="text-xs font-semibold text-foreground">
                Video Title <span className="text-red-500">*</span>
              </label>
              <span
                className={`text-2xs font-mono ${
                  titleCharCount > 100 ? "text-red-600 font-bold" : "text-muted-foreground"
                }`}
              >
                {titleCharCount}/100
              </span>
            </div>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Enter video title"
              maxLength={110}
              className="text-xs h-9"
              disabled={saving}
            />
            {hasTitleTagWarning && (
              <p className="text-2xs text-red-600">{"Title cannot contain '<' or '>'"}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="edit-desc" className="text-xs font-semibold text-foreground">
                Description
              </label>
              <span
                className={`text-2xs font-mono ${
                  descCharCount > 5000 ? "text-red-600 font-bold" : "text-muted-foreground"
                }`}
              >
                {descCharCount}/5,000
              </span>
            </div>
            <textarea
              id="edit-desc"
              rows={4}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Enter video description"
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50"
              disabled={saving}
            />
            {hasDescTagWarning && (
              <p className="text-2xs text-red-600">{"Description cannot contain '<' or '>'"}</p>
            )}
          </div>

          {/* Tags & Category Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tags */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="edit-tags" className="text-xs font-semibold text-foreground">
                  Tags (comma-separated)
                </label>
                <span
                  className={`text-2xs font-mono ${
                    tagsCumulativeLength > 500 ? "text-red-600 font-bold" : "text-muted-foreground"
                  }`}
                >
                  {tagsCumulativeLength}/500 chars
                </span>
              </div>
              <Input
                id="edit-tags"
                value={tagsInput}
                onChange={(e) => {
                  setTagsInput(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="tech, code, tutorial"
                className="text-xs h-9"
                disabled={saving}
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label htmlFor="edit-category" className="text-xs font-semibold text-foreground">
                Category
              </label>
              <select
                id="edit-category"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 h-9"
                disabled={saving}
              >
                {YOUTUBE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Visibility / Privacy Status */}
          <div className="space-y-2 pt-2 border-t border-border-subtle">
            <label className="text-xs font-semibold text-foreground">Visibility & Privacy</label>
            <div className="grid grid-cols-3 gap-2">
              {(["public", "unlisted", "private"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPrivacyStatus(p);
                    if (p !== "private") {
                      setIsScheduled(false);
                    }
                    setIsDirty(true);
                  }}
                  disabled={saving || (isScheduled && p !== "private")}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-md border text-xs capitalize transition-colors ${
                    privacyStatus === p
                      ? "border-primary bg-primary/5 font-semibold text-primary"
                      : "border-border-subtle bg-surface hover:bg-muted/30 text-muted-foreground"
                  } ${isScheduled && p !== "private" ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <span>{p}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Release (Unpublished Videos Only) */}
          <div className="space-y-2 p-3 rounded-md border border-border-subtle bg-muted/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Schedule Publication</span>
              </div>
              <input
                type="checkbox"
                id="toggle-schedule"
                checked={isScheduled}
                disabled={saving || Boolean(isAlreadyPublished)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsScheduled(checked);
                  if (checked) {
                    setPrivacyStatus("private"); // Must be private to schedule
                  }
                  setIsDirty(true);
                }}
                className="rounded border-border-subtle text-primary focus:ring-primary h-4 w-4"
              />
            </div>

            {isAlreadyPublished ? (
              <p className="text-2xs text-muted-foreground">
                Note: Videos that have previously been published cannot be scheduled.
              </p>
            ) : isScheduled ? (
              <div className="pt-2 space-y-1.5">
                <label htmlFor="publish-at" className="text-2xs font-medium text-muted-foreground">
                  Publish Date & Time (Local Timezone)
                </label>
                <Input
                  id="publish-at"
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => {
                    setPublishAt(e.target.value);
                    setIsDirty(true);
                  }}
                  className="text-xs h-8"
                  disabled={saving}
                />
              </div>
            ) : null}
          </div>

          {/* COPPA & Compliance Settings */}
          <div className="space-y-3 pt-2 border-t border-border-subtle">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-foreground">
                  Audience (Made for Kids - COPPA)
                </span>
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="madeForKids"
                      checked={selfDeclaredMadeForKids === true}
                      onChange={() => {
                        setSelfDeclaredMadeForKids(true);
                        setIsDirty(true);
                      }}
                      disabled={saving}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Yes, made for kids</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="madeForKids"
                      checked={selfDeclaredMadeForKids === false}
                      onChange={() => {
                        setSelfDeclaredMadeForKids(false);
                        setIsDirty(true);
                      }}
                      disabled={saving}
                      className="text-primary focus:ring-primary"
                    />
                    <span>No, not made for kids</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Altered / Synthetic Media Disclosure */}
            <div className="flex items-start gap-2.5 pt-2">
              <Sparkles className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <label
                  htmlFor="synthetic-media-check"
                  className="text-xs font-semibold text-foreground cursor-pointer flex items-center gap-2"
                >
                  <input
                    type="checkbox"
                    id="synthetic-media-check"
                    checked={containsSyntheticMedia}
                    onChange={(e) => {
                      setContainsSyntheticMedia(e.target.checked);
                      setIsDirty(true);
                    }}
                    disabled={saving}
                    className="rounded border-border-subtle text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>Altered or synthetic content disclosure</span>
                </label>
                <p className="text-2xs text-muted-foreground pl-6">
                  Check if sound or visuals were significantly edited or digitally generated (e.g., using AI).
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
            <div className="text-2xs text-muted-foreground">
              Estimated Quota: <span className="font-mono font-medium text-foreground">~51 units</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCloseAttempt}
                disabled={saving}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving || !isDirty}
                className="h-8 text-xs gap-1.5 px-4"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving to YouTube...</span>
                  </>
                ) : (
                  <span>Save to YouTube</span>
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* Unsaved Changes Confirmation Modal */}
        {showConfirmClose && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-5 shadow-lg max-w-sm w-full space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Discard unsaved changes?</h4>
              <p className="text-xs text-muted-foreground">
                You have unsaved edits. If you leave now, your changes will not be saved to YouTube.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowConfirmClose(false)}
                  className="h-7 text-xs"
                >
                  Keep Editing
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setShowConfirmClose(false);
                    onOpenChange(false);
                  }}
                  className="h-7 text-xs"
                >
                  Discard Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
