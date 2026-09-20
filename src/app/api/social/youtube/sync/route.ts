import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/auth/guard";
import { socialSyncService } from "@/modules/social/sync/sync.service";
import { youTubeAnalyticsSyncService } from "@/modules/social/sync/analytics-sync.service";
import { prisma } from "@/lib/db/prisma";

/**
 * Trigger manual YouTube channel data synchronization (POST /api/social/youtube/sync).
 * Body: { accountId: string }
 *
 * Enforces server-side tenant isolation: workspace is derived strictly from the
 * authenticated session user and target SocialAccount's workspace.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();

    const { accountId } = body as { accountId?: string };

    if (!accountId) {
      return NextResponse.json(
        { error: "Missing required field: 'accountId'" },
        { status: 400 }
      );
    }

    const result = await socialSyncService.syncYouTubeAccount({
      accountId,
      actorUserId: user.id,
    });

    // Also populate analytics observations (90-day backfill for dashboard)
    let analyticsObservationsCount = 0;
    try {
      const account = await prisma.socialAccount.findUnique({
        where: { id: accountId },
        select: { workspaceId: true },
      });

      if (account) {
        // 1. Run DAILY mode: captures demographics, geography, traffic sources, devices & top videos for rolling window
        const dailyResult = await youTubeAnalyticsSyncService.sync({
          workspaceId: account.workspaceId,
          socialAccountId: accountId,
          actorUserId: user.id,
          mode: "DAILY",
          triggerMode: "MANUAL",
        });

        // 2. Run BACKFILL mode: backfills 90-day daily overview and slices
        const backfillResult = await youTubeAnalyticsSyncService.sync({
          workspaceId: account.workspaceId,
          socialAccountId: accountId,
          actorUserId: user.id,
          mode: "BACKFILL",
          triggerMode: "MANUAL",
        });

        analyticsObservationsCount = dailyResult.observationCount + backfillResult.observationCount;
      }
    } catch (analyticsErr) {
      console.warn("YouTube Analytics reports sync warning:", analyticsErr);
    }

    return NextResponse.json({
      success: true,
      accountId: result.accountId,
      platform: result.platform,
      channelId: result.channelId,
      channelTitle: result.channelTitle,
      videosDiscovered: result.videosDiscovered,
      videosProcessed: result.videosProcessed,
      videosCreated: result.videosCreated,
      videosUpdated: result.videosUpdated,
      snapshotsCreated: result.snapshotsCreated,
      analyticsObservations: analyticsObservationsCount,
      durationMs: result.durationMs,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
