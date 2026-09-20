import { YouTubePlaylistPrivacyStatus } from "@/modules/social/providers/youtube/youtube.playlist.types";

export interface CreatePlaylistInput {
  title: string;
  description?: string;
  privacyStatus?: YouTubePlaylistPrivacyStatus;
}

export interface UpdatePlaylistInput {
  title?: string;
  description?: string;
  privacyStatus?: YouTubePlaylistPrivacyStatus;
}

export interface AddPlaylistItemInput {
  videoId: string;
  position?: number;
}

export interface ReorderPlaylistItemInput {
  position: number;
}

export interface PlaylistValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCreatePlaylistInput(input: CreatePlaylistInput): PlaylistValidationResult {
  if (!input || !input.title || input.title.trim() === "") {
    return { valid: false, error: "Playlist title is required." };
  }
  if (input.title.length > 150) {
    return { valid: false, error: "Playlist title cannot exceed 150 characters." };
  }
  if (input.description && input.description.length > 5000) {
    return { valid: false, error: "Playlist description cannot exceed 5000 characters." };
  }
  if (input.privacyStatus && !["public", "unlisted", "private"].includes(input.privacyStatus)) {
    return { valid: false, error: "Invalid privacyStatus. Must be 'public', 'unlisted', or 'private'." };
  }
  return { valid: true };
}

export function validateUpdatePlaylistInput(input: UpdatePlaylistInput): PlaylistValidationResult {
  if (!input) {
    return { valid: false, error: "Input payload is required." };
  }
  if (input.title !== undefined) {
    if (input.title.trim() === "") {
      return { valid: false, error: "Playlist title cannot be empty." };
    }
    if (input.title.length > 150) {
      return { valid: false, error: "Playlist title cannot exceed 150 characters." };
    }
  }
  if (input.description !== undefined && input.description.length > 5000) {
    return { valid: false, error: "Playlist description cannot exceed 5000 characters." };
  }
  if (input.privacyStatus !== undefined && !["public", "unlisted", "private"].includes(input.privacyStatus)) {
    return { valid: false, error: "Invalid privacyStatus. Must be 'public', 'unlisted', or 'private'." };
  }
  return { valid: true };
}

export function validateAddPlaylistItemInput(input: AddPlaylistItemInput): PlaylistValidationResult {
  if (!input || !input.videoId || input.videoId.trim() === "") {
    return { valid: false, error: "Video ID is required to add to playlist." };
  }
  if (input.position !== undefined && (input.position < 0 || !Number.isInteger(input.position))) {
    return { valid: false, error: "Position must be a non-negative integer." };
  }
  return { valid: true };
}

export function validateReorderPlaylistItemInput(input: ReorderPlaylistItemInput): PlaylistValidationResult {
  if (!input || input.position === undefined || input.position < 0 || !Number.isInteger(input.position)) {
    return { valid: false, error: "Position must be a non-negative integer." };
  }
  return { valid: true };
}

export interface PlaylistDTO {
  id: string;
  title: string;
  description: string;
  privacyStatus: YouTubePlaylistPrivacyStatus;
  itemCount: number;
  publishedAt?: string;
  thumbnails?: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
  };
}

export interface PlaylistItemDTO {
  id: string;
  playlistId: string;
  videoId: string;
  title: string;
  description?: string;
  position: number;
  publishedAt?: string;
  thumbnails?: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
  };
}
