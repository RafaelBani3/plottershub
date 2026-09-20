import {
  ContentListItemDTO,
  ContentFilterType,
  ContentFilterStatus,
  ContentFilterPrivacy,
  ContentSummaryDTO,
} from "@/modules/content/content.types";

export type {
  ContentListItemDTO,
  ContentFilterType,
  ContentFilterStatus,
  ContentFilterPrivacy,
  ContentSummaryDTO,
};

export interface ContentFilterState {
  search: string;
  contentType: ContentFilterType;
  status: ContentFilterStatus;
  privacy: ContentFilterPrivacy;
  sortBy: "publishedAt" | "views" | "likes" | "comments" | "duration" | "title";
  sortOrder: "asc" | "desc";
  socialAccountId?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

export const DEFAULT_FILTER_STATE: ContentFilterState = {
  search: "",
  contentType: "ALL",
  status: "ALL",
  privacy: "ALL",
  sortBy: "publishedAt",
  sortOrder: "desc",
  page: 1,
  pageSize: 20,
};
