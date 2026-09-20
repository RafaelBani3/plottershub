import { prisma } from "@/lib/db/prisma";
import { SocialAccountStatus } from "@prisma/client";
import { PlatformCode, SanitizedSocialAccount, TokenBundle } from "./types";
import { SocialProviderRegistry } from "./registry";
import { socialTokenManager } from "./token-manager";
import { logAuditEvent } from "@/modules/audit/audit-service";
import { SocialError } from "./errors";

export interface ConnectAccountParams {
  workspaceId: string;
  platformCode: PlatformCode;
  externalAccountId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  tokenBundle: TokenBundle;
  actorUserId?: string | null;
}

export interface DisconnectAccountParams {
  accountId: string;
  workspaceId: string;
  actorUserId?: string | null;
  purgeToken?: boolean;
}

export class SocialAccountService {
  /**
   * Transforms a database SocialAccount entity into a sanitized client-safe representation.
   * Strips all encrypted or decrypted token data and injects provider capabilities.
   */
  static sanitizeAccount(account: {
    id: string;
    workspaceId: string;
    platform: { code: string; name: string };
    externalAccountId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: SocialAccountStatus;
    token?: { scopes: string | null } | null;
    lastSyncedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): SanitizedSocialAccount {
    const platformCode = account.platform.code as PlatformCode;
    let capabilities;
    try {
      capabilities = SocialProviderRegistry.getProvider(platformCode).getCapabilities();
    } catch {
      capabilities = {
        canReadProfile: false,
        canReadContent: false,
        canReadContentMetrics: false,
        canReadAccountMetrics: false,
        canReadAudienceMetrics: false,
        canReadComments: false,
        canPublishVideo: false,
        canPublishPhoto: false,
        canPublishCarousel: false,
        canSchedulePublish: false,
        canManageComments: false,
        canManageMessages: false,
      };
    }

    const scopes = account.token?.scopes ? account.token.scopes.split(" ") : null;

    return {
      id: account.id,
      workspaceId: account.workspaceId,
      platformCode,
      platformName: account.platform.name,
      externalAccountId: account.externalAccountId,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      status: account.status,
      scopes,
      lastSyncedAt: account.lastSyncedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      capabilities,
    };
  }

  /**
   * Retrieves all social accounts for a workspace in sanitized format.
   */
  async getWorkspaceAccounts(workspaceId: string): Promise<SanitizedSocialAccount[]> {
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId },
      include: {
        platform: true,
        token: {
          select: { scopes: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return accounts.map((acc) => SocialAccountService.sanitizeAccount(acc));
  }

  /**
   * Retrieves a single sanitized social account by ID and workspace.
   */
  async getAccountById(accountId: string, workspaceId: string): Promise<SanitizedSocialAccount> {
    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, workspaceId },
      include: {
        platform: true,
        token: {
          select: { scopes: true },
        },
      },
    });

    if (!account) {
      throw new SocialError("Social account not found.", "SOCIAL_INVALID_REQUEST");
    }

    return SocialAccountService.sanitizeAccount(account);
  }

  /**
   * Connects or updates a social account for a workspace, persists encrypted credentials,
   * and records an immutable audit log entry.
   */
  async connectAccount(params: {
    workspaceId: string;
    platformCode: PlatformCode;
    externalAccountId: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    tokenBundle: TokenBundle;
    actorUserId?: string | null;
  }): Promise<SanitizedSocialAccount> {
    // 1. Ensure platform master record exists
    let platform = await prisma.socialPlatform.findUnique({
      where: { code: params.platformCode },
    });

    if (!platform) {
      const provider = SocialProviderRegistry.getProvider(params.platformCode);
      platform = await prisma.socialPlatform.create({
        data: {
          code: params.platformCode,
          name: provider.platformName,
          active: true,
        },
      });
    }

    // 2. Upsert SocialAccount
    const account = await prisma.socialAccount.upsert({
      where: {
        workspaceId_platformId_externalAccountId: {
          workspaceId: params.workspaceId,
          platformId: platform.id,
          externalAccountId: params.externalAccountId,
        },
      },
      create: {
        workspaceId: params.workspaceId,
        platformId: platform.id,
        externalAccountId: params.externalAccountId,
        username: params.username,
        displayName: params.displayName || null,
        avatarUrl: params.avatarUrl || null,
        status: "CONNECTED",
      },
      update: {
        username: params.username,
        displayName: params.displayName || null,
        avatarUrl: params.avatarUrl || null,
        status: "CONNECTED",
        updatedAt: new Date(),
      },
      include: {
        platform: true,
      },
    });

    // 3. Encrypt & persist token bundle via SocialTokenManager
    await socialTokenManager.saveTokenBundle(account.id, params.tokenBundle);

    // 4. Log Audit Event
    await logAuditEvent({
      workspaceId: params.workspaceId,
      userId: params.actorUserId,
      action: "ACCOUNT_CONNECTED",
      resource: "social_account",
      resourceId: account.id,
      details: {
        platform: params.platformCode,
        username: params.username,
        externalAccountId: params.externalAccountId,
      },
    });

    return SocialAccountService.sanitizeAccount({
      ...account,
      token: {
        scopes: Array.isArray(params.tokenBundle.scopes)
          ? params.tokenBundle.scopes.join(" ")
          : params.tokenBundle.scopes || null,
      },
    });
  }

  /**
   * Soft-disconnects a social account, purges its encrypted SocialToken from storage,
   * while preserving historical ContentPlatform and MetricSnapshot records.
   */
  async disconnectAccount(params: DisconnectAccountParams): Promise<void> {
    const account = await prisma.socialAccount.findFirst({
      where: { id: params.accountId, workspaceId: params.workspaceId },
      include: { platform: true },
    });

    if (!account) {
      throw new SocialError("Social account not found.", "SOCIAL_INVALID_REQUEST");
    }

    // 1. Soft-disconnect: Update status to DISCONNECTED
    await prisma.socialAccount.update({
      where: { id: params.accountId },
      data: {
        status: "DISCONNECTED",
      },
    });

    // 2. Purge SocialToken (credentials deleted on disconnect)
    if (params.purgeToken !== false) {
      await prisma.socialToken.deleteMany({
        where: { socialAccountId: params.accountId },
      });
    }

    // 3. Audit log
    await logAuditEvent({
      workspaceId: params.workspaceId,
      userId: params.actorUserId,
      action: "ACCOUNT_DISCONNECTED",
      resource: "social_account",
      resourceId: account.id,
      details: {
        platform: account.platform.code,
        username: account.username,
        purgedTokens: params.purgeToken !== false,
      },
    });
  }
}

export const socialAccountService = new SocialAccountService();
