import { describe, it, expect } from "vitest";
import { SocialProviderRegistry, PLATFORM_BASE_CAPABILITIES, BaseSocialProvider } from "./registry";
import { PlatformCode } from "./types";

describe("Social Provider Registry & Platform Capabilities", () => {
  describe("M. Capability Matrix Inspection", () => {
    it("verifies YouTube capabilities match specifications", () => {
      const capabilities = PLATFORM_BASE_CAPABILITIES.YOUTUBE;

      expect(capabilities.canReadProfile).toBe(true);
      expect(capabilities.canReadContent).toBe(true);
      expect(capabilities.canReadContentMetrics).toBe(true);
      expect(capabilities.canReadAccountMetrics).toBe(true);
      expect(capabilities.canReadAudienceMetrics).toBe(true);
      expect(capabilities.canPublishVideo).toBe(true);
      expect(capabilities.canPublishPhoto).toBe(false); // YouTube does not support photo publishing
      expect(capabilities.canSchedulePublish).toBe(true); // Native schedule supported
      expect(capabilities.canManageComments).toBe(true);
      expect(capabilities.canManageMessages).toBe(false);
      expect(capabilities.maxVideoDurationSeconds).toBe(43200); // 12 hours
    });

    it("verifies TikTok capabilities match specifications", () => {
      const capabilities = PLATFORM_BASE_CAPABILITIES.TIKTOK;

      expect(capabilities.canReadProfile).toBe(true);
      expect(capabilities.canReadContent).toBe(true);
      expect(capabilities.canReadContentMetrics).toBe(true);
      expect(capabilities.canReadAudienceMetrics).toBe(false); // Audience analytics restricted
      expect(capabilities.canPublishVideo).toBe(true);
      expect(capabilities.canPublishPhoto).toBe(true);
      expect(capabilities.canPublishCarousel).toBe(true);
      expect(capabilities.canSchedulePublish).toBe(false); // Native scheduling not exposed in public API
      expect(capabilities.canManageComments).toBe(false);
      expect(capabilities.requiresMediaPublicUrl).toBe(true);
    });

    it("verifies Instagram capabilities match specifications", () => {
      const capabilities = PLATFORM_BASE_CAPABILITIES.INSTAGRAM;

      expect(capabilities.canReadProfile).toBe(true);
      expect(capabilities.canReadContent).toBe(true);
      expect(capabilities.canReadContentMetrics).toBe(true);
      expect(capabilities.canReadAccountMetrics).toBe(true);
      expect(capabilities.canReadAudienceMetrics).toBe(true);
      expect(capabilities.canPublishVideo).toBe(true);
      expect(capabilities.canPublishPhoto).toBe(true);
      expect(capabilities.canPublishCarousel).toBe(true);
      expect(capabilities.canSchedulePublish).toBe(false);
      expect(capabilities.canManageComments).toBe(true);
      expect(capabilities.canManageMessages).toBe(true);
      expect(capabilities.requiresMediaPublicUrl).toBe(true);
    });
  });

  describe("N. Provider Registry & Factory", () => {
    it("retrieves standard registered providers", () => {
      const youtube = SocialProviderRegistry.getProvider("YOUTUBE");
      expect(youtube).toBeDefined();
      expect(youtube.platformCode).toBe("YOUTUBE");
      expect(youtube.getCapabilities().canPublishVideo).toBe(true);

      const tiktok = SocialProviderRegistry.getProvider("TIKTOK");
      expect(tiktok).toBeDefined();
      expect(tiktok.platformCode).toBe("TIKTOK");

      const instagram = SocialProviderRegistry.getProvider("INSTAGRAM");
      expect(instagram).toBeDefined();
      expect(instagram.platformCode).toBe("INSTAGRAM");
    });

    it("handles case-insensitive lookup", () => {
      const youtube = SocialProviderRegistry.getProvider("youtube" as PlatformCode);
      expect(youtube.platformCode).toBe("YOUTUBE");
    });

    it("throws SOCIAL_UNSUPPORTED_OPERATION for unregistered provider", () => {
      expect(() => SocialProviderRegistry.getProvider("TWITTER" as PlatformCode)).toThrowError(
        expect.objectContaining({
          name: "SocialError",
          code: "SOCIAL_UNSUPPORTED_OPERATION",
        })
      );
    });

    it("supports custom mock provider registration", () => {
      const customMock = new BaseSocialProvider("YOUTUBE", "Custom Mock YouTube", {
        ...PLATFORM_BASE_CAPABILITIES.YOUTUBE,
        canManageMessages: true,
      });

      SocialProviderRegistry.registerProvider("YOUTUBE", customMock);
      const retrieved = SocialProviderRegistry.getProvider("YOUTUBE");
      expect(retrieved.getCapabilities().canManageMessages).toBe(true);

      // Restore default provider
      SocialProviderRegistry.registerProvider("YOUTUBE", new BaseSocialProvider("YOUTUBE", "YouTube"));
    });

    it("lists all supported platform codes", () => {
      const platforms = SocialProviderRegistry.getSupportedPlatforms();
      expect(platforms).toContain("YOUTUBE");
      expect(platforms).toContain("TIKTOK");
      expect(platforms).toContain("INSTAGRAM");
    });
  });
});
