export interface CreateCommentInput {
  text: string;
}

export interface ReplyCommentInput {
  text: string;
}

export interface EditCommentInput {
  text: string;
}

export type ModerationAction = "PUBLISH" | "HOLD" | "REJECT";

export interface CommentValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCommentText(text?: string): CommentValidationResult {
  if (!text || text.trim() === "") {
    return { valid: false, error: "Comment text cannot be empty." };
  }
  if (text.length > 10000) {
    return { valid: false, error: "Comment text cannot exceed 10,000 characters." };
  }
  return { valid: true };
}

export interface CommentAuthorDTO {
  displayName: string;
  profileImageUrl?: string;
  channelUrl?: string;
  channelId?: string;
}

export interface CommentDTO {
  id: string;
  author: CommentAuthorDTO;
  textDisplay: string;
  textOriginal: string;
  publishedAt: string;
  updatedAt?: string;
  likeCount: number;
  moderationStatus?: string;
  parentId?: string;
}

export interface CommentThreadDTO {
  id: string;
  videoId: string;
  channelId?: string;
  topLevelComment: CommentDTO;
  totalReplyCount: number;
  canReply: boolean;
  isPublic: boolean;
  replies?: CommentDTO[];
}
