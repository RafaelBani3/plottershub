import { describe, it, expect } from "vitest";
import { prepareYouTubeUpdatePayload } from "./content.merge";
import { YouTubeVideoResource } from "../social/providers/youtube/youtube.types";

describe("Content Write Merge & Field Preservation (Phase 3.4D)", () => {
  const mockLiveVideo: YouTubeVideoResource = {
    kind: "youtube#video",
    id: "vid-abc-123",
    snippet: {
      publishedAt: "2026-01-01T00:00:00Z",
      channelId: "UC_channel_1",
      title: "Current Live Title",
      description: "Current Live Description",
      thumbnails: {
        default: { url: "https://example.com/thumb.jpg" },
      },
      tags: ["tag1", "tag2"],
      categoryId: "28",
      defaultLanguage: "en",
      defaultAudioLanguage: "en",
    },
    status: {
      uploadStatus: "processed",
      privacyStatus: "unlisted",
      license: "youtube",
      embeddable: true,
      publicStatsViewable: true,
      madeForKids: false,
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: false,
      publishAt: undefined,
    },
  };

  it("A. title-only update preserves latest description, tags, and categoryId (part=snippet)", () => {
    const result = prepareYouTubeUpdatePayload(mockLiveVideo, {
      title: "Brand New Title",
    });

    expect(result.parts).toEqual(["snippet"]);
    expect(result.body.id).toBe("vid-abc-123");
    expect(result.body.snippet).toBeDefined();
    expect(result.body.status).toBeUndefined(); // status part untouched

    expect(result.body.snippet?.title).toBe("Brand New Title");
    expect(result.body.snippet?.description).toBe("Current Live Description"); // PRESERVED
    expect(result.body.snippet?.tags).toEqual(["tag1", "tag2"]); // PRESERVED
    expect(result.body.snippet?.categoryId).toBe("28"); // PRESERVED
    expect(result.body.snippet?.defaultLanguage).toBe("en"); // PRESERVED
    expect(result.changedFields).toEqual(["title"]);
  });

  it("B. description-only update preserves latest title, tags, and categoryId (part=snippet)", () => {
    const result = prepareYouTubeUpdatePayload(mockLiveVideo, {
      description: "Brand New Description",
    });

    expect(result.parts).toEqual(["snippet"]);
    expect(result.body.snippet?.title).toBe("Current Live Title"); // PRESERVED
    expect(result.body.snippet?.description).toBe("Brand New Description");
    expect(result.body.snippet?.tags).toEqual(["tag1", "tag2"]); // PRESERVED
    expect(result.body.snippet?.categoryId).toBe("28"); // PRESERVED
    expect(result.changedFields).toEqual(["description"]);
  });

  it("C. tags-only update preserves latest title, description, and categoryId (part=snippet)", () => {
    const result = prepareYouTubeUpdatePayload(mockLiveVideo, {
      tags: ["newTagA", "newTagB", "newTagC"],
    });

    expect(result.parts).toEqual(["snippet"]);
    expect(result.body.snippet?.title).toBe("Current Live Title"); // PRESERVED
    expect(result.body.snippet?.description).toBe("Current Live Description"); // PRESERVED
    expect(result.body.snippet?.tags).toEqual(["newTagA", "newTagB", "newTagC"]);
    expect(result.body.snippet?.categoryId).toBe("28"); // PRESERVED
    expect(result.changedFields).toEqual(["tags"]);
  });

  it("D. privacy-only update preserves required mutable status fields (part=status)", () => {
    const result = prepareYouTubeUpdatePayload(mockLiveVideo, {
      privacyStatus: "public",
    });

    expect(result.parts).toEqual(["status"]);
    expect(result.body.snippet).toBeUndefined(); // snippet part untouched
    expect(result.body.status).toBeDefined();

    expect(result.body.status?.privacyStatus).toBe("public");
    expect(result.body.status?.selfDeclaredMadeForKids).toBe(false); // PRESERVED
    expect(result.body.status?.containsSyntheticMedia).toBe(false); // PRESERVED
    expect(result.body.status?.embeddable).toBe(true); // PRESERVED
    expect(result.body.status?.license).toBe("youtube"); // PRESERVED
    expect(result.body.status?.publicStatsViewable).toBe(true); // PRESERVED
    expect(result.changedFields).toEqual(["privacyStatus"]);
  });

  it("E. provider read-only fields are NEVER forwarded in snippet or status", () => {
    const result = prepareYouTubeUpdatePayload(mockLiveVideo, {
      title: "New Title",
      privacyStatus: "private",
    });

    expect(result.parts).toEqual(["snippet", "status"]);

    // Read-only snippet properties must NOT be in payload
    expect((result.body.snippet as any).publishedAt).toBeUndefined();
    expect((result.body.snippet as any).channelId).toBeUndefined();
    expect((result.body.snippet as any).thumbnails).toBeUndefined();
    expect((result.body.snippet as any).channelTitle).toBeUndefined();

    // Read-only status properties must NOT be in payload
    expect((result.body.status as any).uploadStatus).toBeUndefined();
    expect((result.body.status as any).madeForKids).toBeUndefined();
  });

  it("F. scheduling reject on already-published video", () => {
    // mockLiveVideo is unlisted and processed -> already published
    expect(() =>
      prepareYouTubeUpdatePayload(mockLiveVideo, {
        publishAt: "2026-12-31T00:00:00Z",
      })
    ).toThrow(/Cannot schedule publication/i);
  });

  it("G. scheduling succeeds on unpublished private video and forces privacyStatus to private", () => {
    const unpublishedPrivateVideo: YouTubeVideoResource = {
      ...mockLiveVideo,
      status: {
        ...mockLiveVideo.status,
        privacyStatus: "private",
        uploadStatus: "uploaded", // Not yet published
      },
    };

    const scheduledDate = "2026-12-31T15:00:00.000Z";
    const result = prepareYouTubeUpdatePayload(unpublishedPrivateVideo, {
      publishAt: scheduledDate,
    });

    expect(result.parts).toEqual(["status"]);
    expect(result.body.status?.publishAt).toBe(scheduledDate);
    expect(result.body.status?.privacyStatus).toBe("private");
  });

  it("H. containsSyntheticMedia toggle updates status correctly", () => {
    const result = prepareYouTubeUpdatePayload(mockLiveVideo, {
      containsSyntheticMedia: true,
    });

    expect(result.parts).toEqual(["status"]);
    expect(result.body.status?.containsSyntheticMedia).toBe(true);
    expect(result.changedFields).toEqual(["containsSyntheticMedia"]);
  });

  it("I. selfDeclaredMadeForKids toggle updates status correctly", () => {
    const result = prepareYouTubeUpdatePayload(mockLiveVideo, {
      selfDeclaredMadeForKids: true,
    });

    expect(result.parts).toEqual(["status"]);
    expect(result.body.status?.selfDeclaredMadeForKids).toBe(true);
    expect(result.changedFields).toEqual(["selfDeclaredMadeForKids"]);
  });
});
