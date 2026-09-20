import {
  YouTubeVideoResource,
  YouTubeVideoUpdateResource,
  YouTubeVideoUpdateSnippet,
  YouTubeVideoUpdateStatus,
} from "../social/providers/youtube/youtube.types";
import { UpdateContentInput } from "./content.types";
import { SocialError } from "../social/errors";

export interface PreparedUpdateResult {
  parts: string[];
  body: YouTubeVideoUpdateResource;
  changedFields: string[];
}

/**
 * Prepares the strictly-typed YouTube video update payload using a Read-Modify-Write merge.
 *
 * Guarantees:
 * 1. Zero `any` in the write pipeline.
 * 2. Strict field preservation: Unmodified fields are taken directly from the live YouTube state.
 * 3. Read-only fields (uploadStatus, madeForKids, publishedAt, channelId) are NEVER forwarded.
 * 4. Only mutated parts ("snippet" and/or "status") are included in the update request.
 * 5. Scheduling rules: publishAt requires privacyStatus to be "private" and video must be unpublished.
 */
export function prepareYouTubeUpdatePayload(
  current: YouTubeVideoResource,
  input: UpdateContentInput
): PreparedUpdateResult {
  if (!current || !current.id) {
    throw new SocialError("Authoritative current YouTube video resource is missing or invalid.", "SOCIAL_INVALID_REQUEST", {
      provider: "YOUTUBE",
    });
  }

  const parts: string[] = [];
  const changedFields: string[] = [];

  // Check if any snippet field is being mutated
  const isSnippetMutated =
    input.title !== undefined ||
    input.description !== undefined ||
    input.tags !== undefined ||
    input.categoryId !== undefined;

  let snippetPayload: YouTubeVideoUpdateSnippet | undefined;

  if (isSnippetMutated) {
    parts.push("snippet");

    const newTitle = input.title !== undefined ? input.title.trim() : current.snippet.title;
    const newDescription = input.description !== undefined ? input.description : (current.snippet.description ?? "");
    const newTags = input.tags !== undefined ? input.tags : (current.snippet.tags ?? []);
    const newCategoryId = input.categoryId !== undefined ? input.categoryId : current.snippet.categoryId;

    if (input.title !== undefined && input.title.trim() !== current.snippet.title) {
      changedFields.push("title");
    }
    if (input.description !== undefined && input.description !== (current.snippet.description ?? "")) {
      changedFields.push("description");
    }
    if (input.tags !== undefined && JSON.stringify(input.tags) !== JSON.stringify(current.snippet.tags ?? [])) {
      changedFields.push("tags");
    }
    if (input.categoryId !== undefined && input.categoryId !== current.snippet.categoryId) {
      changedFields.push("categoryId");
    }

    // Both title and categoryId are mandatory when part=snippet is sent
    snippetPayload = {
      title: newTitle,
      categoryId: newCategoryId || "22", // Fallback to People & Blogs (22) if missing on provider
      description: newDescription,
      tags: newTags,
      defaultLanguage: current.snippet.defaultLanguage,
      defaultAudioLanguage: current.snippet.defaultAudioLanguage,
    };
  }

  // Check if any status field is being mutated
  const isStatusMutated =
    input.privacyStatus !== undefined ||
    input.publishAt !== undefined ||
    input.selfDeclaredMadeForKids !== undefined ||
    input.containsSyntheticMedia !== undefined;

  let statusPayload: YouTubeVideoUpdateStatus | undefined;

  if (isStatusMutated) {
    parts.push("status");

    let effectivePrivacy = input.privacyStatus !== undefined ? input.privacyStatus : (current.status?.privacyStatus ?? "public");
    let effectivePublishAt: string | undefined = current.status?.publishAt;

    if (input.publishAt !== undefined) {
      if (input.publishAt === null) {
        // Clearing schedule
        effectivePublishAt = undefined;
        changedFields.push("publishAt");
      } else {
        // Enforce YouTube Scheduling Rules:
        // 1. Must be set to private
        // 2. Video must not have been previously published (public or unlisted)
        const isAlreadyPublished =
          current.status?.privacyStatus === "public" ||
          (current.status?.privacyStatus === "unlisted" && !current.status?.publishAt);

        if (isAlreadyPublished) {
          throw new SocialError(
            "Cannot schedule publication. Videos can only be scheduled before they are initially published, and must be set to Private.",
            "CONTENT_INVALID_SCHEDULE",
            { provider: "YOUTUBE", statusCode: 400 }
          );
        }

        effectivePublishAt = new Date(input.publishAt).toISOString();
        effectivePrivacy = "private"; // Mandatory constraint
        changedFields.push("publishAt");
      }
    }

    if (input.privacyStatus !== undefined && input.privacyStatus !== current.status?.privacyStatus) {
      changedFields.push("privacyStatus");
    }
    if (
      input.selfDeclaredMadeForKids !== undefined &&
      input.selfDeclaredMadeForKids !== current.status?.selfDeclaredMadeForKids
    ) {
      changedFields.push("selfDeclaredMadeForKids");
    }
    if (
      input.containsSyntheticMedia !== undefined &&
      input.containsSyntheticMedia !== current.status?.containsSyntheticMedia
    ) {
      changedFields.push("containsSyntheticMedia");
    }

    statusPayload = {
      privacyStatus: effectivePrivacy,
      publishAt: effectivePublishAt,
      selfDeclaredMadeForKids:
        input.selfDeclaredMadeForKids !== undefined
          ? input.selfDeclaredMadeForKids
          : current.status?.selfDeclaredMadeForKids,
      containsSyntheticMedia:
        input.containsSyntheticMedia !== undefined
          ? input.containsSyntheticMedia
          : current.status?.containsSyntheticMedia,
      embeddable: current.status?.embeddable,
      license: current.status?.license,
      publicStatsViewable: current.status?.publicStatsViewable,
    };
  }

  return {
    parts,
    body: {
      id: current.id,
      snippet: snippetPayload,
      status: statusPayload,
    },
    changedFields,
  };
}
