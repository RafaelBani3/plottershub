import { StagedMediaDescriptor } from "@/modules/storage/media-storage";

export interface GenericPublishingPayload {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus: "PUBLIC" | "PRIVATE" | "UNLISTED";
  scheduledAtUtc?: Date | null;
  mediaKey: string;
  thumbnailKey?: string;
  categoryId?: string;
  madeForKids?: boolean;
}

export interface PublishingSession {
  provider: "YOUTUBE" | "TIKTOK" | "INSTAGRAM";
  sessionUrl: string;
  bytesUploaded: number;
  totalBytes: number;
}

export interface ChunkUploadResult {
  completed: boolean;
  bytesUploaded: number;
  externalContentId?: string;
}

export interface SessionStatusResult {
  status: "IN_PROGRESS" | "COMPLETED" | "EXPIRED";
  bytesReceived: number;
  externalContentId?: string;
}

export interface ReconciliationResult {
  matched: boolean;
  externalContentId?: string;
  confidence: "HIGH" | "LOW" | "NONE";
}

export interface SocialPublisher {
  readonly platformCode: string;

  initPublishingSession(
    socialAccountId: string,
    payload: GenericPublishingPayload,
    mediaInfo: StagedMediaDescriptor,
    accessToken: string
  ): Promise<PublishingSession>;

  uploadNextChunk(
    session: PublishingSession,
    chunkBuffer: Buffer,
    range: { start: number; end: number; total: number },
    accessToken: string
  ): Promise<ChunkUploadResult>;

  checkSessionStatus(
    session: PublishingSession,
    totalBytes: number,
    accessToken: string
  ): Promise<SessionStatusResult>;

  uploadThumbnail?(
    externalContentId: string,
    thumbnailBuffer: Buffer,
    mimeType: string,
    accessToken: string
  ): Promise<void>;

  reconcileRecentUpload?(
    socialAccountId: string,
    payload: GenericPublishingPayload,
    windowMinutes: number,
    accessToken: string
  ): Promise<ReconciliationResult>;
}
