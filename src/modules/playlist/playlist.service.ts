import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { DistributedLock, defaultLock } from "@/lib/lock/distributed-lock";
import { SocialTokenManager, socialTokenManager } from "@/modules/social/token-manager";
import { YouTubeDataApiClient } from "@/modules/social/providers/youtube/youtube.data-api";
import { SocialProviderRegistry } from "@/modules/social/registry";
import { hasYouTubeWriteScope } from "@/modules/social/providers/youtube/youtube.oauth";
import { SocialError } from "@/modules/social/errors";
import { hasPermission, Permission } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/modules/audit/audit-service";
import {
  AddPlaylistItemInput,
  CreatePlaylistInput,
  PlaylistDTO,
  PlaylistItemDTO,
  ReorderPlaylistItemInput,
  UpdatePlaylistInput,
  validateAddPlaylistItemInput,
  validateCreatePlaylistInput,
  validateReorderPlaylistItemInput,
  validateUpdatePlaylistInput,
} from "./playlist.types";

export interface PlaylistServiceOptions {
  actorUserId?: string;
  workspaceId: string;
}

export class PlaylistService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly lock: DistributedLock = defaultLock,
    private readonly tokenManager: SocialTokenManager = socialTokenManager,
    private readonly dataApiClient: YouTubeDataApiClient = new YouTubeDataApiClient()
  ) {}

  /**
   * Validates actor membership and permission in target workspace.
   */
  private async validateAccess(
    actorUserId: string | undefined,
    workspaceId: string,
    permission: Permission
  ): Promise<void> {
    if (!actorUserId) {
      return; // Automated / cron execution
    }

    const membership = await this.db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: actorUserId,
        },
      },
    });

    if (!membership) {
      throw new SocialError("User is not a member of this workspace.", "SOCIAL_AUTH_REQUIRED", {
        statusCode: 403,
      });
    }

    if (!hasPermission(membership.role, permission)) {
      throw new SocialError(
        `User lacks required permission '${permission}'.`,
        "SOCIAL_AUTH_REQUIRED",
        { statusCode: 403 }
      );
    }
  }

  /**
   * Resolves and verifies the SocialAccount belonging to the workspace.
   */
  private async resolveSocialAccount(socialAccountId: string, workspaceId: string) {
    const account = await this.db.socialAccount.findFirst({
      where: {
        id: socialAccountId,
        workspaceId,
      },
      include: {
        platform: true,
        token: true,
      },
    });

    if (!account) {
      throw new SocialError("Social account not found in this workspace.", "SOCIAL_INVALID_REQUEST", {
        statusCode: 404,
      });
    }

    if (account.platform.code !== "YOUTUBE") {
      throw new SocialError(
        `Unsupported platform for YouTube playlists: ${account.platform.code}`,
        "SOCIAL_UNSUPPORTED_OPERATION",
        { provider: account.platform.code, statusCode: 400 }
      );
    }

    if (account.status === "REAUTH_REQUIRED" || account.status === "DISCONNECTED") {
      throw new SocialError(
        `Social account requires re-authorization: status is ${account.status}`,
        "SOCIAL_TOKEN_REVOKED",
        { provider: "YOUTUBE", statusCode: 401, userActionRequired: true }
      );
    }

    return account;
  }

  /**
   * Lists playlists for an account.
   */
  async listPlaylists(
    options: PlaylistServiceOptions,
    socialAccountId: string,
    pageToken?: string
  ): Promise<{ items: PlaylistDTO[]; nextPageToken?: string }> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:view");
    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canViewPlaylists) {
      throw new SocialError("Provider does not support viewing playlists.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    const accessToken = await this.tokenManager.getValidAccessToken(account.id);
    const response = await this.dataApiClient.listPlaylists(
      accessToken,
      account.externalAccountId,
      pageToken
    );

    const items: PlaylistDTO[] = (response.items || []).map((p) => ({
      id: p.id,
      title: p.snippet.title,
      description: p.snippet.description || "",
      privacyStatus: p.status?.privacyStatus || "public",
      itemCount: p.contentDetails?.itemCount || 0,
      publishedAt: p.snippet.publishedAt,
      thumbnails: {
        default: p.snippet.thumbnails?.default ? { url: p.snippet.thumbnails.default.url } : undefined,
        medium: p.snippet.thumbnails?.medium ? { url: p.snippet.thumbnails.medium.url } : undefined,
        high: p.snippet.thumbnails?.high ? { url: p.snippet.thumbnails.high.url } : undefined,
      },
    }));

    return {
      items,
      nextPageToken: response.nextPageToken,
    };
  }

  /**
   * Lists playlist items for a playlist.
   */
  async getPlaylistItems(
    options: PlaylistServiceOptions,
    socialAccountId: string,
    playlistId: string,
    pageToken?: string
  ): Promise<{ items: PlaylistItemDTO[]; nextPageToken?: string }> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:view");
    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canViewPlaylists) {
      throw new SocialError("Provider does not support viewing playlists.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    const accessToken = await this.tokenManager.getValidAccessToken(account.id);
    const response = await this.dataApiClient.listPlaylistItems(accessToken, playlistId, pageToken);

    const items: PlaylistItemDTO[] = (response.items || []).map((item) => ({
      id: item.id,
      playlistId: item.snippet.playlistId,
      videoId: item.snippet.resourceId?.videoId || "",
      title: item.snippet.title,
      description: item.snippet.description,
      position: item.snippet.position ?? 0,
      publishedAt: item.snippet.publishedAt,
      thumbnails: {
        default: item.snippet.thumbnails?.default ? { url: item.snippet.thumbnails.default.url } : undefined,
        medium: item.snippet.thumbnails?.medium ? { url: item.snippet.thumbnails.medium.url } : undefined,
        high: item.snippet.thumbnails?.high ? { url: item.snippet.thumbnails.high.url } : undefined,
      },
    }));

    return {
      items,
      nextPageToken: response.nextPageToken,
    };
  }

  /**
   * Creates a new playlist.
   */
  async createPlaylist(
    options: PlaylistServiceOptions,
    socialAccountId: string,
    input: CreatePlaylistInput
  ): Promise<PlaylistDTO> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    const validation = validateCreatePlaylistInput(input);
    if (!validation.valid) {
      throw new SocialError(validation.error || "Invalid playlist input.", "PLAYLIST_VALIDATION_ERROR", {
        statusCode: 400,
      });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canCreatePlaylist) {
      throw new SocialError("Provider does not support creating playlists.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    const lockKey = `playlist-mutation:${account.id}:create`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A playlist mutation is already in progress. Please wait.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      const created = await this.dataApiClient.insertPlaylist(accessToken, {
        snippet: {
          title: input.title,
          description: input.description,
        },
        status: {
          privacyStatus: input.privacyStatus || "public",
        },
      });

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "PLAYLIST_CREATED",
        resource: "playlist",
        resourceId: created.id,
        details: {
          socialAccountId: account.id,
          title: created.snippet.title,
          privacyStatus: created.status?.privacyStatus,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return {
        id: created.id,
        title: created.snippet.title,
        description: created.snippet.description || "",
        privacyStatus: created.status?.privacyStatus || "public",
        itemCount: 0,
        publishedAt: created.snippet.publishedAt,
        thumbnails: {
          default: created.snippet.thumbnails?.default ? { url: created.snippet.thumbnails.default.url } : undefined,
          medium: created.snippet.thumbnails?.medium ? { url: created.snippet.thumbnails.medium.url } : undefined,
          high: created.snippet.thumbnails?.high ? { url: created.snippet.thumbnails.high.url } : undefined,
        },
      };
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Updates an existing playlist.
   */
  async updatePlaylist(
    options: PlaylistServiceOptions,
    socialAccountId: string,
    playlistId: string,
    input: UpdatePlaylistInput
  ): Promise<PlaylistDTO> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    if (!playlistId || playlistId.trim() === "") {
      throw new SocialError("Playlist ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const validation = validateUpdatePlaylistInput(input);
    if (!validation.valid) {
      throw new SocialError(validation.error || "Invalid playlist input.", "PLAYLIST_VALIDATION_ERROR", {
        statusCode: 400,
      });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canUpdatePlaylist) {
      throw new SocialError("Provider does not support updating playlists.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    const lockKey = `playlist-mutation:${account.id}:${playlistId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A playlist mutation is already in progress for this playlist.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      const updated = await this.dataApiClient.updatePlaylist(accessToken, {
        id: playlistId,
        snippet: {
          title: input.title ?? "Untitled Playlist",
          description: input.description,
        },
        status: input.privacyStatus ? { privacyStatus: input.privacyStatus } : undefined,
      });

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "PLAYLIST_UPDATED",
        resource: "playlist",
        resourceId: playlistId,
        details: {
          socialAccountId: account.id,
          title: updated.snippet.title,
          privacyStatus: updated.status?.privacyStatus,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return {
        id: updated.id,
        title: updated.snippet.title,
        description: updated.snippet.description || "",
        privacyStatus: updated.status?.privacyStatus || "public",
        itemCount: updated.contentDetails?.itemCount || 0,
        publishedAt: updated.snippet.publishedAt,
        thumbnails: {
          default: updated.snippet.thumbnails?.default ? { url: updated.snippet.thumbnails.default.url } : undefined,
          medium: updated.snippet.thumbnails?.medium ? { url: updated.snippet.thumbnails.medium.url } : undefined,
          high: updated.snippet.thumbnails?.high ? { url: updated.snippet.thumbnails.high.url } : undefined,
        },
      };
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Deletes a playlist.
   */
  async deletePlaylist(
    options: PlaylistServiceOptions,
    socialAccountId: string,
    playlistId: string
  ): Promise<{ success: boolean }> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    if (!playlistId || playlistId.trim() === "") {
      throw new SocialError("Playlist ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canDeletePlaylist) {
      throw new SocialError("Provider does not support deleting playlists.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    const lockKey = `playlist-mutation:${account.id}:${playlistId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A playlist mutation is already in progress for this playlist.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      await this.dataApiClient.deletePlaylist(accessToken, playlistId);

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "PLAYLIST_DELETED",
        resource: "playlist",
        resourceId: playlistId,
        details: {
          socialAccountId: account.id,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return { success: true };
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Adds a video to a playlist.
   */
  async addVideoToPlaylist(
    options: PlaylistServiceOptions,
    socialAccountId: string,
    playlistId: string,
    input: AddPlaylistItemInput
  ): Promise<PlaylistItemDTO> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    if (!playlistId || playlistId.trim() === "") {
      throw new SocialError("Playlist ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const validation = validateAddPlaylistItemInput(input);
    if (!validation.valid) {
      throw new SocialError(validation.error || "Invalid playlist item input.", "PLAYLIST_VALIDATION_ERROR", {
        statusCode: 400,
      });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canManagePlaylistItems) {
      throw new SocialError("Provider does not support managing playlist items.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    const lockKey = `playlist-mutation:${account.id}:${playlistId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A playlist mutation is already in progress for this playlist.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      const item = await this.dataApiClient.insertPlaylistItem(accessToken, {
        snippet: {
          playlistId,
          position: input.position,
          resourceId: {
            kind: "youtube#video",
            videoId: input.videoId,
          },
        },
      });

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "PLAYLIST_ITEM_ADDED",
        resource: "playlist_item",
        resourceId: item.id,
        details: {
          socialAccountId: account.id,
          playlistId,
          videoId: input.videoId,
          position: item.snippet.position,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return {
        id: item.id,
        playlistId: item.snippet.playlistId,
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        position: item.snippet.position ?? 0,
        publishedAt: item.snippet.publishedAt,
        thumbnails: {
          default: item.snippet.thumbnails?.default ? { url: item.snippet.thumbnails.default.url } : undefined,
          medium: item.snippet.thumbnails?.medium ? { url: item.snippet.thumbnails.medium.url } : undefined,
          high: item.snippet.thumbnails?.high ? { url: item.snippet.thumbnails.high.url } : undefined,
        },
      };
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Removes a video from a playlist.
   * NOTE: MUST use playlistItemId, never videoId!
   */
  async removeVideoFromPlaylist(
    options: PlaylistServiceOptions,
    socialAccountId: string,
    playlistItemId: string
  ): Promise<{ success: boolean }> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    if (!playlistItemId || playlistItemId.trim() === "") {
      throw new SocialError("Playlist item ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canManagePlaylistItems) {
      throw new SocialError("Provider does not support managing playlist items.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    const lockKey = `playlist-item-mutation:${account.id}:${playlistItemId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A mutation is already in progress for this playlist item.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      await this.dataApiClient.deletePlaylistItem(accessToken, playlistItemId);

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "PLAYLIST_ITEM_REMOVED",
        resource: "playlist_item",
        resourceId: playlistItemId,
        details: {
          socialAccountId: account.id,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return { success: true };
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }

  /**
   * Reorders a playlist item.
   */
  async reorderPlaylistItem(
    options: PlaylistServiceOptions,
    socialAccountId: string,
    playlistItemId: string,
    playlistId: string,
    videoId: string,
    input: ReorderPlaylistItemInput
  ): Promise<PlaylistItemDTO> {
    await this.validateAccess(options.actorUserId, options.workspaceId, "content:edit");

    if (!playlistItemId || playlistItemId.trim() === "") {
      throw new SocialError("Playlist item ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }
    if (!playlistId || playlistId.trim() === "") {
      throw new SocialError("Playlist ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }
    if (!videoId || videoId.trim() === "") {
      throw new SocialError("Video ID is required.", "SOCIAL_INVALID_REQUEST", { statusCode: 400 });
    }

    const validation = validateReorderPlaylistItemInput(input);
    if (!validation.valid) {
      throw new SocialError(validation.error || "Invalid position input.", "PLAYLIST_VALIDATION_ERROR", {
        statusCode: 400,
      });
    }

    const account = await this.resolveSocialAccount(socialAccountId, options.workspaceId);

    const provider = SocialProviderRegistry.getProvider("YOUTUBE");
    const capabilities = provider.getCapabilities();
    if (!capabilities.canManagePlaylistItems) {
      throw new SocialError("Provider does not support managing playlist items.", "SOCIAL_UNSUPPORTED_OPERATION", {
        provider: "YOUTUBE",
        statusCode: 400,
      });
    }

    if (!hasYouTubeWriteScope(account.token?.scopes)) {
      throw new SocialError(
        "Account lacks write permissions. Please re-authorize with editing permissions.",
        "SOCIAL_INSUFFICIENT_SCOPE",
        { provider: "YOUTUBE", statusCode: 403, userActionRequired: true }
      );
    }

    const lockKey = `playlist-item-mutation:${account.id}:${playlistItemId}`;
    const lockToken = await this.lock.acquire(lockKey, { ttlMs: 15000, timeoutMs: 0 });
    if (!lockToken) {
      throw new SocialError("A mutation is already in progress for this playlist item.", "SOCIAL_REFRESH_LOCKED", {
        statusCode: 409,
      });
    }

    try {
      const accessToken = await this.tokenManager.getValidAccessToken(account.id);
      const item = await this.dataApiClient.updatePlaylistItem(accessToken, {
        id: playlistItemId,
        snippet: {
          playlistId,
          position: input.position,
          resourceId: {
            kind: "youtube#video",
            videoId,
          },
        },
      });

      await logAuditEvent({
        workspaceId: options.workspaceId,
        userId: options.actorUserId,
        action: "PLAYLIST_ITEM_REORDERED",
        resource: "playlist_item",
        resourceId: playlistItemId,
        details: {
          socialAccountId: account.id,
          playlistId,
          newPosition: input.position,
          quotaUnitsEstimated: 50,
        },
      }).catch(() => {});

      return {
        id: item.id,
        playlistId: item.snippet.playlistId,
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        position: item.snippet.position ?? 0,
        publishedAt: item.snippet.publishedAt,
        thumbnails: {
          default: item.snippet.thumbnails?.default ? { url: item.snippet.thumbnails.default.url } : undefined,
          medium: item.snippet.thumbnails?.medium ? { url: item.snippet.thumbnails.medium.url } : undefined,
          high: item.snippet.thumbnails?.high ? { url: item.snippet.thumbnails.high.url } : undefined,
        },
      };
    } finally {
      await this.lock.release(lockKey, lockToken).catch(() => {});
    }
  }
}

export const playlistService = new PlaylistService();
