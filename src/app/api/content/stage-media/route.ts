import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireWorkspacePermission, handleApiError } from "@/lib/auth/guard";
import { getMediaStorage } from "@/modules/storage/media-storage";

/**
 * POST /api/content/stage-media
 *
 * Media Staging Endpoint.
 * Supports:
 * 1. multipart/form-data upload: parses file buffer and persists to staging storage.
 * 2. application/json pre-signed reservation: returns upload URL and storageKey.
 *
 * Enforces workspace RBAC (content:publish).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const storage = getMediaStorage();

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const workspaceId = formData.get("workspaceId") as string | null;

      if (!workspaceId) {
        return NextResponse.json(
          { error: "Missing required field: 'workspaceId'" },
          { status: 400 }
        );
      }

      await requireWorkspacePermission(workspaceId, "content:publish");

      if (!file) {
        return NextResponse.json(
          { error: "Missing file in multipart body" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileId = Math.random().toString(36).substring(2, 10);
      const sanitizedFilename = (file.name || "media").replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageKey = `staging/${workspaceId}/${Date.now()}_${fileId}_${sanitizedFilename}`;

      await storage.saveStagedMedia(storageKey, buffer, {
        mimeType: file.type || "application/octet-stream",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      });

      return NextResponse.json(
        {
          storageKey,
          fileSizeBytes: buffer.length,
          mimeType: file.type || "application/octet-stream",
        },
        { status: 201 }
      );
    }

    // JSON upload reservation request
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON or Content-Type" },
        { status: 400 }
      );
    }

    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
    const filename = typeof body.filename === "string" ? body.filename : null;
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;
    const fileSizeBytes = typeof body.fileSizeBytes === "number" ? body.fileSizeBytes : null;

    if (!workspaceId || !filename || !mimeType || !fileSizeBytes) {
      return NextResponse.json(
        { error: "Missing required fields: workspaceId, filename, mimeType, fileSizeBytes" },
        { status: 400 }
      );
    }

    await requireWorkspacePermission(workspaceId, "content:publish");

    const result = await storage.generatePresignedUploadUrl({
      workspaceId,
      filename,
      mimeType,
      fileSizeBytes,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
