import { describe, it, expect } from "vitest";
import { classifyYouTubeVideo, YouTubeMapper } from "./youtube.mapper";
import { YouTubeVideoResource } from "./youtube.types";

describe("classifyYouTubeVideo - Multi-Signal Classification Engine (Phase 3.4C)", () => {
  it("authoritatively classifies live broadcasts as LIVE_STREAM", () => {
    const video: Partial<YouTubeVideoResource> = {
      snippet: {
        publishedAt: "2026-01-01T00:00:00Z",
        title: "Live Stream Broadcast",
        description: "",
        channelId: "UC123",
        liveBroadcastContent: "live",
      },
      contentDetails: {
        duration: "PT0S",
      },
    };

    const result = classifyYouTubeVideo(video);
    expect(result.contentType).toBe("LIVE_STREAM");
    expect(result.classificationSource).toBe("AUTHORITATIVE");
    expect(result.confidence).toBe("HIGH");
  });

  it("classifies upcoming/premiere broadcasts as LIVE_STREAM without creating an unsupported new enum", () => {
    const video: Partial<YouTubeVideoResource> = {
      snippet: {
        publishedAt: "2026-01-01T00:00:00Z",
        title: "Upcoming Video Premiere",
        description: "",
        channelId: "UC123",
        liveBroadcastContent: "upcoming",
      },
      contentDetails: {
        duration: "PT10M",
      },
    };

    const result = classifyYouTubeVideo(video);
    expect(result.contentType).toBe("LIVE_STREAM");
    expect(result.classificationSource).toBe("AUTHORITATIVE");
    expect(result.confidence).toBe("HIGH");
  });

  it("authoritatively classifies videos > 180 seconds as LONG_FORM under any policy", () => {
    const video: Partial<YouTubeVideoResource> = {
      snippet: {
        publishedAt: "2026-01-01T00:00:00Z",
        title: "Long Video Tutorial #shorts", // even with #shorts tag
        description: "",
        channelId: "UC123",
      },
      contentDetails: {
        duration: "PT3M1S", // 181 seconds
      },
    };

    const result = classifyYouTubeVideo(video);
    expect(result.contentType).toBe("LONG_FORM");
    expect(result.classificationSource).toBe("AUTHORITATIVE");
    expect(result.confidence).toBe("HIGH");
  });

  it("authoritatively classifies videos > 60 seconds uploaded BEFORE October 15, 2024 as LONG_FORM", () => {
    const video: Partial<YouTubeVideoResource> = {
      snippet: {
        publishedAt: "2024-09-01T12:00:00Z", // Pre-Oct 15, 2024
        title: "Old Video #shorts", // Even if creator put #shorts
        description: "",
        channelId: "UC123",
      },
      contentDetails: {
        duration: "PT65S", // 65 seconds
      },
    };

    const result = classifyYouTubeVideo(video);
    expect(result.contentType).toBe("LONG_FORM");
    expect(result.classificationSource).toBe("AUTHORITATIVE");
    expect(result.confidence).toBe("HIGH");
  });

  it("classifies videos <= 180 seconds with explicit #shorts in title as SHORTS", () => {
    const video: Partial<YouTubeVideoResource> = {
      snippet: {
        publishedAt: "2025-05-01T12:00:00Z",
        title: "Amazing Quick Tip #Shorts",
        description: "Watch this",
        channelId: "UC123",
      },
      contentDetails: {
        duration: "PT55S", // 55 seconds
      },
    };

    const result = classifyYouTubeVideo(video);
    expect(result.contentType).toBe("SHORTS");
    expect(result.classificationSource).toBe("HEURISTIC");
    expect(result.confidence).toBe("MODERATE");
  });

  it("classifies videos <= 180 seconds with explicit shorts in tags as SHORTS", () => {
    const video: Partial<YouTubeVideoResource> = {
      snippet: {
        publishedAt: "2025-05-01T12:00:00Z",
        title: "Quick Workout",
        description: "Fast exercise",
        tags: ["fitness", "#shorts", "workout"],
        channelId: "UC123",
      },
      contentDetails: {
        duration: "PT1M20S", // 80 seconds, post-Oct 15, 2024
      },
    };

    const result = classifyYouTubeVideo(video);
    expect(result.contentType).toBe("SHORTS");
    expect(result.classificationSource).toBe("HEURISTIC");
    expect(result.confidence).toBe("MODERATE");
  });

  it("classifies videos within Shorts duration WITHOUT orientation or explicit #shorts tag as UNKNOWN", () => {
    const video: Partial<YouTubeVideoResource> = {
      snippet: {
        publishedAt: "2025-05-01T12:00:00Z",
        title: "Just a short 30-second clip",
        description: "No hashtag",
        tags: ["clip"],
        channelId: "UC123",
      },
      contentDetails: {
        duration: "PT30S",
      },
    };

    const result = classifyYouTubeVideo(video);
    // Never silently classify uncertain videos as SHORTS or LONG_FORM!
    expect(result.contentType).toBe("UNKNOWN");
    expect(result.classificationSource).toBe("UNRESOLVED");
    expect(result.confidence).toBe("LOW");
  });

  it("returns UNKNOWN when duration or publication date is missing or invalid", () => {
    const videoNoDuration: Partial<YouTubeVideoResource> = {
      snippet: {
        publishedAt: "2025-05-01T12:00:00Z",
        title: "Video with no duration",
        description: "",
        channelId: "UC123",
      },
    };

    const result = classifyYouTubeVideo(videoNoDuration);
    expect(result.contentType).toBe("UNKNOWN");
    expect(result.confidence).toBe("LOW");

    const videoNoDate: Partial<YouTubeVideoResource> = {
      contentDetails: {
        duration: "PT45S",
      },
    };
    expect(classifyYouTubeVideo(videoNoDate).contentType).toBe("UNKNOWN");
  });

  it("supports configurable classification thresholds", () => {
    const video: Partial<YouTubeVideoResource> = {
      snippet: {
        publishedAt: "2026-01-01T00:00:00Z",
        title: "Custom threshold video",
        description: "",
        channelId: "UC123",
      },
      contentDetails: {
        duration: "PT100S", // 100 seconds
      },
    };

    // With custom maxShortsDurationSeconds = 90
    const result = classifyYouTubeVideo(video, { maxShortsDurationSeconds: 90 });
    expect(result.contentType).toBe("LONG_FORM");
  });
});

describe("YouTubeMapper.mapVideoToPlatformMetadata", () => {
  it("populates complete YouTubeVideoMetadata payload without data loss", () => {
    const video: YouTubeVideoResource = {
      kind: "youtube#video",
      id: "vid_12345",
      snippet: {
        publishedAt: "2026-03-15T10:00:00Z",
        channelId: "UC_sample_channel",
        title: "Sample Video Title #shorts",
        description: "Sample Description",
        thumbnails: {
          default: { url: "https://example.com/def.jpg" },
          high: { url: "https://example.com/high.jpg" },
          maxres: { url: "https://example.com/max.jpg" },
        },
        channelTitle: "Sample Channel Title",
        tags: ["tech", "guide"],
        categoryId: "28",
      },
      contentDetails: {
        duration: "PT45S",
        dimension: "2d",
        definition: "hd",
        caption: "true",
        licensedContent: true,
      },
      status: {
        uploadStatus: "uploaded",
        privacyStatus: "public",
        license: "youtube",
        embeddable: true,
        madeForKids: false,
      },
      statistics: {
        viewCount: "5000",
        likeCount: "250",
        commentCount: "10",
      },
    };

    const metadata = YouTubeMapper.mapVideoToPlatformMetadata(video);

    expect(metadata.channelId).toBe("UC_sample_channel");
    expect(metadata.channelTitle).toBe("Sample Channel Title");
    expect(metadata.tags).toEqual(["tech", "guide"]);
    expect(metadata.categoryId).toBe("28");
    expect(metadata.durationSeconds).toBe(45);
    expect(metadata.durationISO).toBe("PT45S");
    expect(metadata.contentType).toBe("SHORTS");
    expect(metadata.classificationConfidence).toBe("MODERATE");
    expect(metadata.caption).toBe(true);
    expect(metadata.licensedContent).toBe(true);
    expect(metadata.privacyStatus).toBe("public");
    expect(metadata.thumbnails.maxres).toBe("https://example.com/max.jpg");
  });
});
