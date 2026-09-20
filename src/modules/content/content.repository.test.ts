import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentRepository, formatDuration } from "./content.repository";

describe("ContentRepository (Phase 3.4C)", () => {
  let mockPrisma: any;
  let repository: ContentRepository;

  beforeEach(() => {
    mockPrisma = {
      contentPlatform: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue({ lastSyncedAt: new Date("2026-03-01T00:00:00Z") }),
        findUnique: vi.fn().mockResolvedValue({ lastSyncedAt: new Date("2026-03-01T00:00:00Z") }),
      },
    };
    repository = new ContentRepository(mockPrisma as any);
  });

  describe("formatDuration helper", () => {
    it("formats seconds into mm:ss or hh:mm:ss", () => {
      expect(formatDuration(null)).toBe("—");
      expect(formatDuration(0)).toBe("0:00");
      expect(formatDuration(45)).toBe("0:45");
      expect(formatDuration(65)).toBe("1:05");
      expect(formatDuration(3665)).toBe("1:01:05");
    });
  });

  describe("listContent", () => {
    it("enforces mandatory workspace isolation", async () => {
      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);
      mockPrisma.contentPlatform.count.mockResolvedValue(0);

      await repository.listContent({
        workspaceId: "ws_test_123",
        limit: 20,
        offset: 0,
      });

      expect(mockPrisma.contentPlatform.findMany).toHaveBeenCalled();
      const queryArg = mockPrisma.contentPlatform.findMany.mock.calls[0][0];

      // Must enforce content.workspaceId
      expect(queryArg.where.content.workspaceId).toBe("ws_test_123");
    });

    it("filters by socialAccountId when provided", async () => {
      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);
      mockPrisma.contentPlatform.count.mockResolvedValue(0);

      await repository.listContent({
        workspaceId: "ws_123",
        socialAccountId: "sa_youtube_1",
      });

      const queryArg = mockPrisma.contentPlatform.findMany.mock.calls[0][0];
      expect(queryArg.where.socialAccountId).toBe("sa_youtube_1");
    });

    it("filters by content type via JSON metadata path", async () => {
      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);
      mockPrisma.contentPlatform.count.mockResolvedValue(0);

      await repository.listContent({
        workspaceId: "ws_123",
        contentType: "SHORTS",
      });

      const queryArg = mockPrisma.contentPlatform.findMany.mock.calls[0][0];
      expect(queryArg.where.metadata).toEqual({
        path: ["contentType"],
        equals: "SHORTS",
      });
    });

    it("filters by privacy via JSON metadata path", async () => {
      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);
      mockPrisma.contentPlatform.count.mockResolvedValue(0);

      await repository.listContent({
        workspaceId: "ws_123",
        privacy: "UNLISTED",
      });

      const queryArg = mockPrisma.contentPlatform.findMany.mock.calls[0][0];
      expect(queryArg.where.metadata).toEqual({
        path: ["privacyStatus"],
        equals: "unlisted",
      });
    });

    it("filters by publication date range", async () => {
      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);
      mockPrisma.contentPlatform.count.mockResolvedValue(0);

      const start = new Date("2026-01-01T00:00:00Z");
      const end = new Date("2026-01-31T23:59:59Z");

      await repository.listContent({
        workspaceId: "ws_123",
        startDate: start,
        endDate: end,
      });

      const queryArg = mockPrisma.contentPlatform.findMany.mock.calls[0][0];
      expect(queryArg.where.publishedAt).toEqual({
        gte: start,
        lte: end,
      });
    });

    it("performs substring search across title and description", async () => {
      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);
      mockPrisma.contentPlatform.count.mockResolvedValue(0);

      await repository.listContent({
        workspaceId: "ws_123",
        search: "tutorial",
      });

      const queryArg = mockPrisma.contentPlatform.findMany.mock.calls[0][0];
      expect(queryArg.where.content.OR).toEqual([
        { title: { contains: "tutorial", mode: "insensitive" } },
        { description: { contains: "tutorial", mode: "insensitive" } },
      ]);
    });

    it("enforces bounded pagination limit between 1 and 100", async () => {
      mockPrisma.contentPlatform.findMany.mockResolvedValue([]);
      mockPrisma.contentPlatform.count.mockResolvedValue(0);

      // Attempt limit > 100
      const resHigh = await repository.listContent({
        workspaceId: "ws_123",
        limit: 500,
        offset: 0,
      });
      expect(resHigh.pagination.limit).toBe(100);

      // Attempt limit < 1
      const resLow = await repository.listContent({
        workspaceId: "ws_123",
        limit: -10,
        offset: 0,
      });
      expect(resLow.pagination.limit).toBe(1);
    });

    it("guarantees zero N+1 queries by including relations in a single relational join", async () => {
      const mockDbRow = {
        id: "cp_1",
        contentId: "c_1",
        socialAccountId: "sa_1",
        externalContentId: "yt_vid_123",
        externalUrl: "https://youtube.com/watch?v=yt_vid_123",
        status: "PUBLISHED",
        publishedAt: new Date("2026-03-01T12:00:00Z"),
        createdAt: new Date("2026-03-01T12:00:00Z"),
        metadata: {
          contentType: "SHORTS",
          classificationConfidence: "MODERATE",
          classificationSource: "HEURISTIC",
          classificationRationale: "Eligible duration with explicit #shorts tag",
          durationSeconds: 45,
          privacyStatus: "public",
          thumbnails: {
            medium: { url: "https://example.com/thumb.jpg" },
          },
        },
        content: {
          id: "c_1",
          workspaceId: "ws_123",
          title: "My Short Video #shorts",
          description: "Sample Description",
          status: "PUBLISHED",
          publishedAt: new Date("2026-03-01T12:00:00Z"),
        },
        socialAccount: {
          id: "sa_1",
          displayName: "Tech Channel",
          username: "techchannel",
          avatarUrl: "https://example.com/avatar.jpg",
          platform: { code: "YOUTUBE" },
        },
        snapshots: [
          {
            views: 12000n,
            likes: 450n,
            comments: 32n,
            engagementRate: 0.0401,
            capturedAt: new Date("2026-03-01T12:00:00Z"),
          },
        ],
      };

      mockPrisma.contentPlatform.findMany.mockResolvedValue([mockDbRow]);
      mockPrisma.contentPlatform.count.mockResolvedValue(1);

      const result = await repository.listContent({
        workspaceId: "ws_123",
      });

      // Assert findMany call with eager includes
      expect(mockPrisma.contentPlatform.findMany).toHaveBeenCalled();
      const queryArg = mockPrisma.contentPlatform.findMany.mock.calls[0][0];
      expect(queryArg.include.content).toBe(true);
      expect(queryArg.include.socialAccount).toBeDefined();
      expect(queryArg.include.snapshots).toBeDefined();

      // Assert mapped DTO structure
      expect(result.items.length).toBe(1);
      const item = result.items[0];
      expect(item.id).toBe("cp_1");
      expect(item.externalContentId).toBe("yt_vid_123");
      expect(item.metadata?.contentType).toBe("SHORTS");
      expect(item.metadata?.durationFormatted).toBe("0:45");
      expect(item.metrics?.views).toBe("12000");
      expect(item.metrics?.likes).toBe("450");
      expect(item.socialAccount.displayName).toBe("Tech Channel");
    });
  });

  describe("getContentById", () => {
    it("returns mapped DTO when item exists within workspace", async () => {
      const mockRow = {
        id: "cp_1",
        contentId: "c_1",
        socialAccountId: "sa_1",
        externalContentId: "yt_vid_123",
        externalUrl: "https://youtube.com/watch?v=yt_vid_123",
        status: "PUBLISHED",
        publishedAt: new Date("2026-03-01T12:00:00Z"),
        createdAt: new Date("2026-03-01T12:00:00Z"),
        metadata: {
          contentType: "LONG_FORM",
          durationSeconds: 600,
          privacyStatus: "public",
        },
        content: {
          id: "c_1",
          workspaceId: "ws_123",
          title: "Full Documentary",
          description: "Documentary film",
          status: "PUBLISHED",
          publishedAt: new Date("2026-03-01T12:00:00Z"),
        },
        socialAccount: {
          id: "sa_1",
          displayName: "Channel A",
          username: "channela",
          avatarUrl: null,
          platform: { code: "YOUTUBE" },
        },
        snapshots: [],
      };

      mockPrisma.contentPlatform.findFirst.mockResolvedValue(mockRow);

      const item = await repository.getContentById("ws_123", "c_1");
      expect(item).not.toBeNull();
      expect(item?.metadata?.contentType).toBe("LONG_FORM");
      expect(item?.metadata?.durationFormatted).toBe("10:00");
      expect(mockPrisma.contentPlatform.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ id: "c_1" }, { contentId: "c_1" }],
            content: { workspaceId: "ws_123" },
          }),
        })
      );
    });

    it("returns null if item belongs to another workspace", async () => {
      mockPrisma.contentPlatform.findFirst.mockResolvedValue(null);
      const item = await repository.getContentById("ws_other", "c_1");
      expect(item).toBeNull();
    });
  });
});
