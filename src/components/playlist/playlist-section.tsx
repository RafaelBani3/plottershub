"use client";

import * as React from "react";
import { ListPlus, Plus, Trash2, Edit2, Check, Loader2, FolderPlus, Lock, Globe, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlaylistDTO, PlaylistItemDTO } from "@/modules/playlist/playlist.types";

export interface PlaylistSectionProps {
  videoId: string;
  socialAccountId: string;
  workspaceId: string;
  userRole?: string;
}

export function PlaylistSection({
  videoId,
  socialAccountId,
  workspaceId,
  userRole = "VIEWER",
}: PlaylistSectionProps) {
  const [playlists, setPlaylists] = React.useState<PlaylistDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Per-playlist item status: playlistId -> playlistItemId if video is in it
  const [playlistItemMap, setPlaylistItemMap] = React.useState<Record<string, string | null>>({});
  const [checkingItems, setCheckingItems] = React.useState(false);
  const [modifyingPlaylistId, setModifyingPlaylistId] = React.useState<string | null>(null);

  // Create playlist form
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [newPrivacy, setNewPrivacy] = React.useState<"public" | "unlisted" | "private">("public");
  const [creatingPlaylist, setCreatingPlaylist] = React.useState(false);

  // Edit playlist form
  const [editingPlaylistId, setEditingPlaylistId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editPrivacy, setEditPrivacy] = React.useState<"public" | "unlisted" | "private">("public");
  const [savingEdit, setSavingEdit] = React.useState(false);

  const canEdit = userRole === "OWNER" || userRole === "ADMIN" || userRole === "EDITOR";

  const fetchPlaylists = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const url = new URL("/api/social/youtube/playlists", window.location.origin);
      url.searchParams.set("workspaceId", workspaceId);
      url.searchParams.set("socialAccountId", socialAccountId);

      const res = await fetch(url.toString());
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load playlists.");
      }

      const data = await res.json();
      const list: PlaylistDTO[] = data.items || [];
      setPlaylists(list);

      // Check which playlists contain this video
      setCheckingItems(true);
      const itemMap: Record<string, string | null> = {};

      await Promise.all(
        list.map(async (pl) => {
          try {
            const itemsUrl = new URL(`/api/social/youtube/playlists/${pl.id}/items`, window.location.origin);
            itemsUrl.searchParams.set("workspaceId", workspaceId);
            itemsUrl.searchParams.set("socialAccountId", socialAccountId);

            const itemRes = await fetch(itemsUrl.toString());
            if (itemRes.ok) {
              const itemData = await itemRes.json();
              const found = (itemData.items as PlaylistItemDTO[] || []).find((i) => i.videoId === videoId);
              itemMap[pl.id] = found ? found.id : null;
            }
          } catch {
            itemMap[pl.id] = null;
          }
        })
      );

      setPlaylistItemMap(itemMap);
    } catch (err: any) {
      setError(err.message || "Failed to load playlists.");
    } finally {
      setLoading(false);
      setCheckingItems(false);
    }
  }, [workspaceId, socialAccountId, videoId]);

  React.useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const handleCreatePlaylist = async () => {
    if (!newTitle.trim() || creatingPlaylist) return;
    setCreatingPlaylist(true);
    setError(null);

    try {
      const res = await fetch("/api/social/youtube/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          socialAccountId,
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          privacyStatus: newPrivacy,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create playlist.");
      }

      const data = await res.json();
      setPlaylists((prev) => [data.playlist, ...prev]);
      setShowCreateModal(false);
      setNewTitle("");
      setNewDescription("");
      setNewPrivacy("public");
    } catch (err: any) {
      setError(err.message || "Failed to create playlist.");
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handleToggleVideoInPlaylist = async (playlistId: string) => {
    const existingItemId = playlistItemMap[playlistId];
    setModifyingPlaylistId(playlistId);
    setError(null);

    try {
      if (existingItemId) {
        // Remove from playlist using playlistItemId
        const url = new URL(`/api/social/youtube/playlists/items/${existingItemId}`, window.location.origin);
        url.searchParams.set("workspaceId", workspaceId);
        url.searchParams.set("socialAccountId", socialAccountId);

        const res = await fetch(url.toString(), { method: "DELETE" });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to remove video from playlist.");
        }

        setPlaylistItemMap((prev) => ({ ...prev, [playlistId]: null }));
        setPlaylists((prev) =>
          prev.map((pl) => (pl.id === playlistId ? { ...pl, itemCount: Math.max(0, pl.itemCount - 1) } : pl))
        );
      } else {
        // Add to playlist
        const res = await fetch(`/api/social/youtube/playlists/${playlistId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            socialAccountId,
            videoId,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to add video to playlist.");
        }

        const data = await res.json();
        setPlaylistItemMap((prev) => ({ ...prev, [playlistId]: data.item.id }));
        setPlaylists((prev) =>
          prev.map((pl) => (pl.id === playlistId ? { ...pl, itemCount: pl.itemCount + 1 } : pl))
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to update playlist video.");
    } finally {
      setModifyingPlaylistId(null);
    }
  };

  const handleSaveEditPlaylist = async (playlistId: string) => {
    if (!editTitle.trim() || savingEdit) return;
    setSavingEdit(true);
    setError(null);

    try {
      const res = await fetch(`/api/social/youtube/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          socialAccountId,
          title: editTitle.trim(),
          description: editDescription.trim(),
          privacyStatus: editPrivacy,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update playlist.");
      }

      const data = await res.json();
      setPlaylists((prev) => prev.map((pl) => (pl.id === playlistId ? data.playlist : pl)));
      setEditingPlaylistId(null);
    } catch (err: any) {
      setError(err.message || "Failed to update playlist.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    if (!confirm("Are you sure you want to delete this playlist? This action cannot be undone on YouTube.")) return;
    setError(null);

    try {
      const url = new URL(`/api/social/youtube/playlists/${playlistId}`, window.location.origin);
      url.searchParams.set("workspaceId", workspaceId);
      url.searchParams.set("socialAccountId", socialAccountId);

      const res = await fetch(url.toString(), { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete playlist.");
      }

      setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
    } catch (err: any) {
      setError(err.message || "Failed to delete playlist.");
    }
  };

  const renderPrivacyIcon = (privacy: string) => {
    switch (privacy) {
      case "private":
        return <Lock className="h-3 w-3 text-red-500" />;
      case "unlisted":
        return <EyeOff className="h-3 w-3 text-amber-500" />;
      case "public":
      default:
        return <Globe className="h-3 w-3 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top action header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <ListPlus className="h-3.5 w-3.5 text-primary" />
          <span>Channel Playlists</span>
        </span>

        {canEdit && (
          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="h-7 text-xs px-2.5 gap-1"
          >
            <Plus className="h-3 w-3" />
            <span>New Playlist</span>
          </Button>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Create Modal / Form */}
      {showCreateModal && (
        <div className="rounded-md border border-border-subtle bg-muted/20 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FolderPlus className="h-3.5 w-3.5 text-primary" />
              <span>Create Playlist</span>
            </span>
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">
                Playlist Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={150}
                placeholder="e.g. Tutorials & Walkthroughs"
                className="w-full rounded border border-border-subtle bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">Description</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={5000}
                rows={2}
                placeholder="Playlist description..."
                className="w-full rounded border border-border-subtle bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">Privacy</label>
              <select
                value={newPrivacy}
                onChange={(e) => setNewPrivacy(e.target.value as any)}
                className="rounded border border-border-subtle bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCreateModal(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreatePlaylist}
              disabled={!newTitle.trim() || creatingPlaylist}
              className="h-7 text-xs px-3"
            >
              {creatingPlaylist ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              <span>Create</span>
            </Button>
          </div>
        </div>
      )}

      {/* Playlist List */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-xs gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Loading playlists...</span>
        </div>
      ) : playlists.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-muted/10 py-8 text-center text-xs text-muted-foreground">
          No playlists found on this YouTube channel.
        </div>
      ) : (
        <div className="space-y-2">
          {playlists.map((pl) => {
            const isEditing = editingPlaylistId === pl.id;
            const isInPlaylist = Boolean(playlistItemMap[pl.id]);
            const isModifying = modifyingPlaylistId === pl.id;

            return (
              <div
                key={pl.id}
                className="rounded-md border border-border-subtle bg-surface p-3 text-xs space-y-2"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={150}
                      className="w-full rounded border border-border-subtle bg-background px-2 py-1 text-xs text-foreground"
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      maxLength={5000}
                      rows={2}
                      className="w-full rounded border border-border-subtle bg-background px-2 py-1 text-xs text-foreground"
                    />
                    <div className="flex items-center justify-between">
                      <select
                        value={editPrivacy}
                        onChange={(e) => setEditPrivacy(e.target.value as any)}
                        className="rounded border border-border-subtle bg-background px-2 py-1 text-xs text-foreground"
                      >
                        <option value="public">Public</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="private">Private</option>
                      </select>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingPlaylistId(null)}
                          className="h-6 text-xs px-2"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEditPlaylist(pl.id)}
                          disabled={!editTitle.trim() || savingEdit}
                          className="h-6 text-xs px-2.5"
                        >
                          {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground truncate">{pl.title}</span>
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground capitalize">
                          {renderPrivacyIcon(pl.privacyStatus)}
                          <span>{pl.privacyStatus}</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {pl.itemCount} {pl.itemCount === 1 ? "video" : "videos"}
                        {pl.description ? ` • ${pl.description}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Add/Remove this video toggle button */}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant={isInPlaylist ? "secondary" : "outline"}
                          onClick={() => handleToggleVideoInPlaylist(pl.id)}
                          disabled={isModifying || checkingItems}
                          className={`h-7 text-xs px-2.5 gap-1.5 ${
                            isInPlaylist ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : ""
                          }`}
                        >
                          {isModifying ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isInPlaylist ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span>Added</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" />
                              <span>Add to Playlist</span>
                            </>
                          )}
                        </Button>
                      )}

                      {/* Edit playlist info */}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingPlaylistId(pl.id);
                            setEditTitle(pl.title);
                            setEditDescription(pl.description || "");
                            setEditPrivacy(pl.privacyStatus);
                          }}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      )}

                      {/* Delete playlist */}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeletePlaylist(pl.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
