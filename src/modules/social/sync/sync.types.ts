export interface SyncOptions {
  accountId: string;
  actorUserId?: string | null;
  maxVideosLimit?: number; // Internal guardrail: defaults to 500, max 1000
  stopOnKnownContent?: boolean; // When true, halts pagination upon reaching already-known content boundary
  historicalCutoffDate?: Date; // Halts pagination if videos are older than this date
}

export interface SyncBatchProgress {
  batchIndex: number;
  videoCount: number;
  createdCount: number;
  updatedCount: number;
}

export interface SyncResult {
  success: boolean;
  accountId: string;
  platform: "YOUTUBE";
  channelId: string;
  channelTitle: string;
  videosDiscovered: number;
  videosProcessed: number;
  videosCreated: number;
  videosUpdated: number;
  snapshotsCreated: number;
  durationMs: number;
  errors?: Array<{ batchIndex?: number; message: string }>;
}
