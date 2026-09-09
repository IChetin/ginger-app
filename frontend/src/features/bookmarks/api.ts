import {
  createBookmark,
  deleteBookmark,
  fetchBookmarks,
  fetchBookmarksOverview,
  fetchNotificationHistory,
  migrateBookmarks,
  resolveBookmarkTargets,
  updateBookmark,
} from "@/api/client";
import type {
  BookmarkCreatePayload,
  BookmarkMigratePayload,
  BookmarkUpdatePayload,
} from "@/api/types/bookmarks";

export {
  createBookmark,
  deleteBookmark,
  fetchBookmarks,
  fetchBookmarksOverview,
  fetchNotificationHistory,
  migrateBookmarks,
  resolveBookmarkTargets,
  updateBookmark,
};

export type { BookmarkCreatePayload, BookmarkMigratePayload, BookmarkUpdatePayload };
