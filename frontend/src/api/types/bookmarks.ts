import type { DateTimeWithTimezone, SeriesStatus } from "@/api/types/schedule";

export type BookmarkTargetType = "series" | "flight";

export interface Bookmark {
  id: string;
  target_type: BookmarkTargetType;
  target_id: string;
  reminder_offsets: number[];
  created_at: string;
}

export interface BookmarkDisplayFields {
  series_id: string | null;
  event_id: string | null;
  series_name: string;
  series_status: SeriesStatus;
  series_starts_on: string;
  series_ends_on: string;
  organizer_name: string;
  organizer_slug: string;
  venue_name: string;
  venue_city: string;
  event_number: number | null;
  event_name: string | null;
  flight_label: string | null;
  nearest_start_at: DateTimeWithTimezone | null;
  url: string;
}

export interface BookmarkOverviewItem extends BookmarkDisplayFields {
  id: string;
  target_type: BookmarkTargetType;
  target_id: string;
  reminder_offsets: number[];
  created_at: string;
  title: string;
  subtitle: string | null;
}

export interface BookmarkTargetResolveRef {
  target_type: BookmarkTargetType;
  target_id: string;
}

export interface BookmarkTargetResolveItem {
  target_type: BookmarkTargetType;
  target_id: string;
  found: boolean;
  display: BookmarkDisplayFields | null;
}

export interface BookmarkTargetResolvePayload {
  items: BookmarkTargetResolveRef[];
}

export interface BookmarkTargetResolveResponse {
  items: BookmarkTargetResolveItem[];
}

export interface BookmarkCreatePayload {
  target_type: BookmarkTargetType;
  target_id: string;
  reminder_offsets?: number[];
}

export interface BookmarkUpdatePayload {
  reminder_offsets: number[];
}

export interface GuestBookmarkItem {
  target_type: BookmarkTargetType;
  target_id: string;
  reminder_offsets?: number[];
}

export interface BookmarkMigratePayload {
  items: GuestBookmarkItem[];
}

export interface BookmarkMigrateResponse {
  created: number;
  skipped: number;
  items: Bookmark[];
}

/** Normalized row for bookmarks UI (server overview or guest hydrate). */
export interface BookmarkListItem extends BookmarkDisplayFields {
  key: string;
  source: "server" | "guest" | "demo";
  bookmarkId: string | null;
  target_type: BookmarkTargetType;
  target_id: string;
  reminder_offsets: number[];
  created_at: string;
}
