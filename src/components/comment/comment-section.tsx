"use client";

import * as React from "react";
import { MessageSquare, Send, Reply, Trash2, Edit2, ShieldAlert, Check, ChevronDown, ChevronUp, Loader2, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommentThreadDTO, CommentDTO, ModerationAction } from "@/modules/comment/comment.types";

export interface CommentSectionProps {
  videoId: string;
  socialAccountId: string;
  workspaceId: string;
  userRole?: string;
}

export function CommentSection({
  videoId,
  socialAccountId,
  workspaceId,
  userRole = "VIEWER",
}: CommentSectionProps) {
  const [threads, setThreads] = React.useState<CommentThreadDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = React.useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // New top-level comment state
  const [newCommentText, setNewCommentText] = React.useState("");
  const [postingComment, setPostingComment] = React.useState(false);

  // Replying state
  const [replyingToId, setReplyingToId] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [postingReply, setPostingReply] = React.useState(false);

  // Editing state
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const [savingEdit, setSavingEdit] = React.useState(false);

  // Expanded replies state: commentId -> boolean
  const [expandedReplies, setExpandedReplies] = React.useState<Record<string, boolean>>({});
  const [loadedReplies, setLoadedReplies] = React.useState<Record<string, CommentDTO[]>>({});
  const [loadingReplies, setLoadingReplies] = React.useState<Record<string, boolean>>({});

  const canEdit = userRole === "OWNER" || userRole === "ADMIN" || userRole === "EDITOR";
  const canModerate = userRole === "OWNER" || userRole === "ADMIN";

  const fetchThreads = React.useCallback(async (pageToken?: string) => {
    try {
      if (!pageToken) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      const url = new URL("/api/social/youtube/comments", window.location.origin);
      url.searchParams.set("workspaceId", workspaceId);
      url.searchParams.set("socialAccountId", socialAccountId);
      url.searchParams.set("videoId", videoId);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString());
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load comments.");
      }

      const data = await res.json();
      if (pageToken) {
        setThreads((prev) => [...prev, ...(data.items || [])]);
      } else {
        setThreads(data.items || []);
      }
      setNextPageToken(data.nextPageToken);
    } catch (err: any) {
      setError(err.message || "Failed to load comments.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [workspaceId, socialAccountId, videoId]);

  React.useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handlePostComment = async () => {
    if (!newCommentText.trim() || postingComment) return;
    setPostingComment(true);
    setError(null);

    try {
      const res = await fetch("/api/social/youtube/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          socialAccountId,
          videoId,
          text: newCommentText.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to post comment.");
      }

      const data = await res.json();
      setThreads((prev) => [data.comment, ...prev]);
      setNewCommentText("");
    } catch (err: any) {
      setError(err.message || "Failed to post comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const handleLoadReplies = async (parentCommentId: string) => {
    if (loadedReplies[parentCommentId]) {
      setExpandedReplies((prev) => ({ ...prev, [parentCommentId]: !prev[parentCommentId] }));
      return;
    }

    setLoadingReplies((prev) => ({ ...prev, [parentCommentId]: true }));
    try {
      const url = new URL(`/api/social/youtube/comments/${parentCommentId}/replies`, window.location.origin);
      url.searchParams.set("workspaceId", workspaceId);
      url.searchParams.set("socialAccountId", socialAccountId);

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error("Failed to load replies.");
      }

      const data = await res.json();
      setLoadedReplies((prev) => ({ ...prev, [parentCommentId]: data.items || [] }));
      setExpandedReplies((prev) => ({ ...prev, [parentCommentId]: true }));
    } catch (err: any) {
      setError(err.message || "Failed to load replies.");
    } finally {
      setLoadingReplies((prev) => ({ ...prev, [parentCommentId]: false }));
    }
  };

  const handlePostReply = async (parentCommentId: string) => {
    if (!replyText.trim() || postingReply) return;
    setPostingReply(true);
    setError(null);

    try {
      const res = await fetch(`/api/social/youtube/comments/${parentCommentId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          socialAccountId,
          text: replyText.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to reply to comment.");
      }

      const data = await res.json();
      setLoadedReplies((prev) => ({
        ...prev,
        [parentCommentId]: [...(prev[parentCommentId] || []), data.reply],
      }));
      setExpandedReplies((prev) => ({ ...prev, [parentCommentId]: true }));
      setReplyText("");
      setReplyingToId(null);
    } catch (err: any) {
      setError(err.message || "Failed to post reply.");
    } finally {
      setPostingReply(false);
    }
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editText.trim() || savingEdit) return;
    setSavingEdit(true);
    setError(null);

    try {
      const res = await fetch(`/api/social/youtube/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          socialAccountId,
          text: editText.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update comment.");
      }

      const data = await res.json();
      // Update in threads or loaded replies
      setThreads((prev) =>
        prev.map((t) =>
          t.topLevelComment.id === commentId
            ? { ...t, topLevelComment: { ...t.topLevelComment, textDisplay: data.comment.textDisplay, textOriginal: data.comment.textOriginal } }
            : t
        )
      );
      setLoadedReplies((prev) => {
        const next = { ...prev };
        for (const [parentId, list] of Object.entries(next)) {
          next[parentId] = list.map((c) =>
            c.id === commentId ? { ...c, textDisplay: data.comment.textDisplay, textOriginal: data.comment.textOriginal } : c
          );
        }
        return next;
      });

      setEditingCommentId(null);
      setEditText("");
    } catch (err: any) {
      setError(err.message || "Failed to update comment.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteComment = async (commentId: string, parentCommentId?: string) => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    setError(null);

    try {
      const url = new URL(`/api/social/youtube/comments/${commentId}`, window.location.origin);
      url.searchParams.set("workspaceId", workspaceId);
      url.searchParams.set("socialAccountId", socialAccountId);

      const res = await fetch(url.toString(), { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete comment.");
      }

      if (parentCommentId) {
        setLoadedReplies((prev) => ({
          ...prev,
          [parentCommentId]: (prev[parentCommentId] || []).filter((c) => c.id !== commentId),
        }));
      } else {
        setThreads((prev) => prev.filter((t) => t.id !== commentId && t.topLevelComment.id !== commentId));
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete comment.");
    }
  };

  const handleModerate = async (commentId: string, action: ModerationAction) => {
    setError(null);
    try {
      const res = await fetch(`/api/social/youtube/comments/${commentId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          socialAccountId,
          action,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to moderate comment.");
      }

      // Re-fetch threads to reflect new state
      fetchThreads();
    } catch (err: any) {
      setError(err.message || "Failed to moderate comment.");
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="space-y-4">
      {/* Error alert */}
      {error && (
        <div
          className={`rounded-md border p-3.5 text-xs ${
            error.toLowerCase().includes("scope") ||
            error.toLowerCase().includes("permission") ||
            error.toLowerCase().includes("reconnect")
              ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
              : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-400"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 space-y-1.5">
              <p className="font-semibold text-foreground">
                {error.toLowerCase().includes("scope") ||
                error.toLowerCase().includes("permission") ||
                error.toLowerCase().includes("reconnect")
                  ? "YouTube Comment Permissions Required"
                  : "Failed to load comments"}
              </p>
              <p className="text-muted-foreground leading-relaxed">{error}</p>
              {(error.toLowerCase().includes("scope") ||
                error.toLowerCase().includes("permission") ||
                error.toLowerCase().includes("reconnect")) && (
                <div className="pt-2">
                  <a
                    href={`/api/social/youtube/connect?workspaceId=${encodeURIComponent(workspaceId)}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Reconnect YouTube Channel</span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comment composer for top-level comments */}
      {canEdit && (
        <div className="rounded-md border border-border-subtle bg-surface p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              <span>Post a Comment</span>
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              {newCommentText.length} / 10,000
            </span>
          </div>

          <textarea
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Write a public comment..."
            maxLength={10000}
            rows={3}
            className="w-full resize-none rounded-md border border-border-subtle bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handlePostComment}
              disabled={!newCommentText.trim() || postingComment}
              className="h-7 text-xs px-3 gap-1.5"
            >
              {postingComment ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              <span>Post</span>
            </Button>
          </div>
        </div>
      )}

      {/* Comments List */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-xs gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Loading comments...</span>
        </div>
      ) : threads.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-muted/10 py-8 text-center text-xs text-muted-foreground">
          No comments yet on this video.
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => {
            const comment = thread.topLevelComment;
            const isEditing = editingCommentId === comment.id;
            const isReplying = replyingToId === comment.id;
            const replies = loadedReplies[comment.id] || thread.replies || [];
            const isExpanded = expandedReplies[comment.id];
            const isLoadingReplies = loadingReplies[comment.id];

            return (
              <div
                key={thread.id}
                className="rounded-md border border-border-subtle bg-surface p-3 space-y-2.5 text-xs"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {comment.author.profileImageUrl ? (
                      <img
                        src={comment.author.profileImageUrl}
                        alt={comment.author.displayName}
                        className="h-6 w-6 rounded-full object-cover border border-border-subtle"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center font-bold text-[10px] text-muted-foreground">
                        {comment.author.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-foreground">
                        {comment.author.displayName}
                      </span>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {formatDate(comment.publishedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions (Edit, Delete, Moderate) */}
                  <div className="flex items-center gap-1">
                    {canModerate && (
                      <div className="flex items-center gap-1 mr-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Publish"
                          onClick={() => handleModerate(comment.id, "PUBLISH")}
                          className="h-6 w-6 p-0 text-emerald-600 hover:bg-emerald-50"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Hold for Review"
                          onClick={() => handleModerate(comment.id, "HOLD")}
                          className="h-6 w-6 p-0 text-amber-600 hover:bg-amber-50"
                        >
                          <ShieldAlert className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Reject"
                          onClick={() => handleModerate(comment.id, "REJECT")}
                          className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    {canEdit && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (isEditing) {
                              setEditingCommentId(null);
                            } else {
                              setEditingCommentId(comment.id);
                              setEditText(comment.textOriginal || comment.textDisplay);
                            }
                          }}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteComment(comment.id)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Comment Body / Edit form */}
                {isEditing ? (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      maxLength={10000}
                      rows={2}
                      className="w-full resize-none rounded-md border border-border-subtle bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingCommentId(null)}
                        className="h-6 text-xs px-2"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(comment.id)}
                        disabled={!editText.trim() || savingEdit}
                        className="h-6 text-xs px-2.5"
                      >
                        {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-foreground whitespace-pre-wrap leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: comment.textDisplay || comment.textOriginal }}
                  />
                )}

                {/* Bottom Bar: Likes, Reply trigger, View replies */}
                <div className="flex items-center gap-4 pt-1 text-[11px] text-muted-foreground border-t border-border-subtle/50">
                  <span>{comment.likeCount} likes</span>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setReplyingToId(isReplying ? null : comment.id)}
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <Reply className="h-3 w-3" />
                      <span>Reply</span>
                    </button>
                  )}

                  {thread.totalReplyCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleLoadReplies(comment.id)}
                      className="flex items-center gap-1 font-medium text-foreground hover:underline ml-auto"
                    >
                      {isLoadingReplies ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      <span>
                        {thread.totalReplyCount} {thread.totalReplyCount === 1 ? "reply" : "replies"}
                      </span>
                    </button>
                  )}
                </div>

                {/* Inline Reply Composer */}
                {isReplying && (
                  <div className="mt-2 pl-4 border-l-2 border-primary/40 space-y-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Reply to ${comment.author.displayName}...`}
                      maxLength={10000}
                      rows={2}
                      className="w-full resize-none rounded-md border border-border-subtle bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReplyingToId(null);
                          setReplyText("");
                        }}
                        className="h-6 text-xs px-2"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handlePostReply(comment.id)}
                        disabled={!replyText.trim() || postingReply}
                        className="h-6 text-xs px-2.5"
                      >
                        {postingReply ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Expanded Replies List */}
                {isExpanded && replies.length > 0 && (
                  <div className="mt-2 pl-4 border-l-2 border-border-subtle space-y-2 pt-1">
                    {replies.map((reply) => {
                      const isEditingReply = editingCommentId === reply.id;
                      return (
                        <div key={reply.id} className="space-y-1.5 bg-muted/10 p-2.5 rounded border border-border-subtle/60">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {reply.author.profileImageUrl ? (
                                <img
                                  src={reply.author.profileImageUrl}
                                  alt={reply.author.displayName}
                                  className="h-5 w-5 rounded-full object-cover border border-border-subtle"
                                />
                              ) : (
                                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center font-bold text-[9px] text-muted-foreground">
                                  {reply.author.displayName.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <span className="font-medium text-foreground text-[11px]">
                                {reply.author.displayName}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDate(reply.publishedAt)}
                              </span>
                            </div>

                            {canEdit && (
                              <div className="flex items-center gap-0.5">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (isEditingReply) {
                                      setEditingCommentId(null);
                                    } else {
                                      setEditingCommentId(reply.id);
                                      setEditText(reply.textOriginal || reply.textDisplay);
                                    }
                                  }}
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                >
                                  <Edit2 className="h-2.5 w-2.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteComment(reply.id, comment.id)}
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-red-600"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            )}
                          </div>

                          {isEditingReply ? (
                            <div className="space-y-1.5 pt-1">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                maxLength={10000}
                                rows={2}
                                className="w-full resize-none rounded border border-border-subtle bg-background p-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingCommentId(null)}
                                  className="h-5 text-[11px] px-2"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveEdit(reply.id)}
                                  disabled={!editText.trim() || savingEdit}
                                  className="h-5 text-[11px] px-2"
                                >
                                  Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="text-foreground text-[11px] whitespace-pre-wrap leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: reply.textDisplay || reply.textOriginal }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Load more button */}
          {nextPageToken && (
            <div className="flex justify-center pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchThreads(nextPageToken)}
                disabled={loadingMore}
                className="h-7 text-xs px-3 gap-1.5"
              >
                {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>Load More Comments</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
