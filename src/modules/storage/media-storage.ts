import { Readable } from "stream";

export interface StagedMediaDescriptor {
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256?: string;
  expiresAt: Date;
}

export interface MediaStorage {
  /**
   * Generates a pre-signed URL allowing direct client upload to staging.
   */
  generatePresignedUploadUrl(params: {
    workspaceId: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
    ttlSeconds?: number;
  }): Promise<{ uploadUrl: string; storageKey: string }>;

  /**
   * Retrieves a readable stream for a specific byte range of the staged media.
   * startByte and endByte are inclusive byte offsets (0-indexed).
   */
  getByteRangeStream(
    storageKey: string,
    startByte: number,
    endByte: number
  ): Promise<Readable>;

  /**
   * Retrieves metadata and content length for a staged object.
   */
  getObjectMetadata(storageKey: string): Promise<StagedMediaDescriptor>;

  /**
   * Deletes temporary media from staging.
   */
  deleteStagedMedia(storageKey: string): Promise<void>;

  /**
   * Helper for tests & local dev staging: stores buffer directly in storage.
   */
  saveStagedMedia(
    storageKey: string,
    data: Buffer | Uint8Array,
    descriptor: Omit<StagedMediaDescriptor, "storageKey" | "fileSizeBytes">
  ): Promise<void>;
}

/**
 * In-memory / Local staging implementation of MediaStorage for development,
 * testing, and staging before Phase 4 production R2 integration.
 */
export class InMemoryMediaStorage implements MediaStorage {
  private files = new Map<string, { data: Buffer; descriptor: StagedMediaDescriptor }>();

  async generatePresignedUploadUrl(params: {
    workspaceId: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
    ttlSeconds?: number;
  }): Promise<{ uploadUrl: string; storageKey: string }> {
    const fileId = Math.random().toString(36).substring(2, 12);
    const sanitizedFilename = params.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `staging/${params.workspaceId}/${Date.now()}_${fileId}_${sanitizedFilename}`;

    const expiresAt = new Date(Date.now() + (params.ttlSeconds ?? 3600) * 1000);

    // Reserve descriptor
    this.files.set(storageKey, {
      data: Buffer.alloc(0),
      descriptor: {
        storageKey,
        mimeType: params.mimeType,
        fileSizeBytes: params.fileSizeBytes,
        expiresAt,
      },
    });

    return {
      uploadUrl: `mock://staging-upload/${storageKey}`,
      storageKey,
    };
  }

  async saveStagedMedia(
    storageKey: string,
    data: Buffer | Uint8Array,
    descriptor: Omit<StagedMediaDescriptor, "storageKey" | "fileSizeBytes">
  ): Promise<void> {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.files.set(storageKey, {
      data: buffer,
      descriptor: {
        storageKey,
        mimeType: descriptor.mimeType,
        fileSizeBytes: buffer.length,
        checksumSha256: descriptor.checksumSha256,
        expiresAt: descriptor.expiresAt,
      },
    });
  }

  async getByteRangeStream(
    storageKey: string,
    startByte: number,
    endByte: number
  ): Promise<Readable> {
    const entry = this.files.get(storageKey);
    if (!entry) {
      throw new Error(`Staged media not found for key: ${storageKey}`);
    }

    if (startByte < 0 || endByte < startByte || startByte >= entry.data.length) {
      throw new Error(
        `Invalid byte range ${startByte}-${endByte} for file of size ${entry.data.length}`
      );
    }

    const clampedEnd = Math.min(endByte, entry.data.length - 1);
    const slice = entry.data.subarray(startByte, clampedEnd + 1);

    const stream = new Readable({
      read() {
        this.push(slice);
        this.push(null);
      },
    });

    return stream;
  }

  async getObjectMetadata(storageKey: string): Promise<StagedMediaDescriptor> {
    const entry = this.files.get(storageKey);
    if (!entry) {
      throw new Error(`Staged media not found for key: ${storageKey}`);
    }

    return entry.descriptor;
  }

  async deleteStagedMedia(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  clear(): void {
    this.files.clear();
  }
}

let defaultMediaStorage: MediaStorage = new InMemoryMediaStorage();

export function getMediaStorage(): MediaStorage {
  return defaultMediaStorage;
}

export function setMediaStorage(storage: MediaStorage): void {
  defaultMediaStorage = storage;
}
