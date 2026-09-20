import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { youTubeAnalyticsSyncService } from "@/modules/social/sync/analytics-sync.service";
import { SocialError } from "@/modules/social/errors";
import { verifyCronSecret } from "@/lib/auth/cron-auth";

interface ProcessedAccountSummary {
  accountId: string;
  externalAccountId: string;
  status: "COMPLETED" | "FAILED" | "SKIPPED_LOCKED";
  observationCount?: number;
  requestCount?: number;
  durationMs: number;
  error?: string;
}

/**
 * Core execution engine for scheduled YouTube analytics sync cron.
 */
async function handleCronExecution(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // 1. Authenticate request
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing Bearer token." },
      { status: 401 }
    );
  }

  try {
    // 2. Background cleanup: Recover any stale PROCESSING jobs older than 15 minutes
    const staleJobsRecovered = await youTubeAnalyticsSyncService
      .recoverStaleProcessingJobs(15)
      .catch((err) => {
        console.error("Failed to recover stale sync jobs:", err);
        return 0;
      });

    // 3. Batch Discovery: Find YouTube accounts requiring sync (not synced in last 24h or never synced)
    const BATCH_LIMIT = 5;
    const syncCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const eligibleAccounts = await prisma.socialAccount.findMany({
      where: {
        platform: {
          code: "YOUTUBE",
        },
        status: {
          in: ["CONNECTED", "HEALTHY", "WARNING"],
        },
        OR: [
          { lastSyncedAt: null },
          { lastSyncedAt: { lt: syncCutoff } },
        ],
      },
      orderBy: [
        { lastSyncedAt: "asc" },
      ],
      take: BATCH_LIMIT,
      select: {
        id: true,
        workspaceId: true,
        externalAccountId: true,
        displayName: true,
        lastSyncedAt: true,
      },
    });

    const processed: ProcessedAccountSummary[] = [];

    // 4. Sequential Bounded Execution with per-account isolation
    for (const account of eligibleAccounts) {
      const itemStart = Date.now();
      try {
        const syncResult = await youTubeAnalyticsSyncService.sync({
          workspaceId: account.workspaceId,
          socialAccountId: account.id,
          mode: "DAILY",
          triggerMode: "SCHEDULED",
        });

        processed.push({
          accountId: account.id,
          externalAccountId: account.externalAccountId,
          status: "COMPLETED",
          observationCount: syncResult.observationCount,
          requestCount: syncResult.requestCount,
          durationMs: Date.now() - itemStart,
        });
      } catch (err: any) {
        const itemDuration = Date.now() - itemStart;

        if (err instanceof SocialError && err.code === "SOCIAL_REFRESH_LOCKED") {
          // Another process currently owns lock; skip safely
          processed.push({
            accountId: account.id,
            externalAccountId: account.externalAccountId,
            status: "SKIPPED_LOCKED",
            durationMs: itemDuration,
          });
        } else {
          processed.push({
            accountId: account.id,
            externalAccountId: account.externalAccountId,
            status: "FAILED",
            durationMs: itemDuration,
            error: err?.message || "Sync execution failed.",
          });
        }
      }
    }

    const totalDurationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      staleJobsRecovered,
      totalDiscovered: eligibleAccounts.length,
      batchLimit: BATCH_LIMIT,
      processedCount: processed.length,
      completedCount: processed.filter((p) => p.status === "COMPLETED").length,
      failedCount: processed.filter((p) => p.status === "FAILED").length,
      skippedCount: processed.filter((p) => p.status === "SKIPPED_LOCKED").length,
      processed,
      durationMs: totalDurationMs,
    });
  } catch (fatalError: any) {
    console.error("Fatal error during scheduled YouTube analytics cron:", fatalError);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error during cron execution.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCronExecution(req);
}

export async function POST(req: NextRequest) {
  return handleCronExecution(req);
}
