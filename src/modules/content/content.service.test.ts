import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentService } from "./content.service";

describe("ContentService (Phase 3.4C)", () => {
  let mockRepo: any;
  let mockDb: any;
  let service: ContentService;

  beforeEach(() => {
    mockRepo = {
      listContent: vi.fn(),
      getContentById: vi.fn(),
      getSummaryMetrics: vi.fn(),
    };
    mockDb = {
      workspaceMember: {
        findUnique: vi.fn(),
      },
      socialAccount: {
        findFirst: vi.fn(),
      },
    };
    service = new ContentService(mockRepo, mockDb);
  });

  describe("validateAccess (RBAC & Workspace Isolation)", () => {
    it("throws SOCIAL_AUTH_REQUIRED if actor is not a member of workspace", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValue(null);

      await expect(
        service.listContent(
          { actorUserId: "user_attacker", workspaceId: "ws_target" },
          {}
        )
      ).rejects.toThrow("Access denied. User is not a member of this workspace.");
    });

    it("allows member with content:view permission (e.g. VIEWER, MEMBER, ADMIN, OWNER)", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValue({
        id: "wm_1",
        role: "VIEWER",
      });
      mockRepo.listContent.mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      const res = await service.listContent(
        { actorUserId: "user_viewer", workspaceId: "ws_target" },
        {}
      );

      expect(res.total).toBe(0);
      expect(mockRepo.listContent).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws_target" })
      );
    });

    it("throws 404 when target socialAccountId does not belong to the workspace", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValue({
        id: "wm_1",
        role: "EDITOR",
      });
      mockDb.socialAccount.findFirst.mockResolvedValue(null); // Not found in this workspace

      await expect(
        service.listContent(
          { actorUserId: "user_1", workspaceId: "ws_target" },
          { socialAccountId: "sa_cross_tenant" }
        )
      ).rejects.toThrow("Social account not found in this workspace.");
    });
  });

  describe("getContentById", () => {
    it("validates contentId presence and returns item when authorized", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValue({
        id: "wm_1",
        role: "EDITOR",
      });
      mockRepo.getContentById.mockResolvedValue({
        id: "c_1",
        title: "Test Video",
      });

      const item = await service.getContentById(
        { actorUserId: "user_1", workspaceId: "ws_target" },
        "c_1"
      );

      expect(item.id).toBe("c_1");
    });

    it("throws 400 if contentId is empty or whitespace", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValue({
        id: "wm_1",
        role: "EDITOR",
      });

      await expect(
        service.getContentById(
          { actorUserId: "user_1", workspaceId: "ws_target" },
          "   "
        )
      ).rejects.toThrow("Content ID is required.");
    });

    it("throws 404 if content item does not exist in workspace", async () => {
      mockDb.workspaceMember.findUnique.mockResolvedValue({
        id: "wm_1",
        role: "EDITOR",
      });
      mockRepo.getContentById.mockResolvedValue(null);

      await expect(
        service.getContentById(
          { actorUserId: "user_1", workspaceId: "ws_target" },
          "c_nonexistent"
        )
      ).rejects.toThrow("Content item not found in this workspace.");
    });
  });
});
