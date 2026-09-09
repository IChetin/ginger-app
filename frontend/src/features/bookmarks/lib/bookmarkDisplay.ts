import type {
  BookmarkDisplayFields,
  BookmarkListItem,
  BookmarkOverviewItem,
  BookmarkTargetResolveItem,
  BookmarkTargetType,
} from "@/api/types/bookmarks";
import type { SeriesStatus } from "@/api/types/schedule";
import { formatSeriesStatus } from "@/features/schedule/lib/format";
import {
  formatDualTime,
  formatIsoDate,
  getUserTimezone,
  parseIsoDateParts,
  todayInTimezone,
  venueLocalDate,
} from "@/lib/time";

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;
const MONTHS_NOMINATIVE = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

const MS_HOUR = 3_600_000;

export type CountdownChip = {
  kind: "hours" | "date";
  primary: string;
  secondary?: string;
  soon: boolean;
};

export function organizerAbbrevFromSlug(slug: string, name: string): string {
  const normalized = slug.trim().toUpperCase();
  if (normalized) {
    return normalized.slice(0, 4);
  }
  return name.slice(0, 4).toUpperCase();
}

export function addIsoDays(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const cursor = new Date(Date.UTC(year, month - 1, day + days));
  return formatIsoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate());
}

export function formatCountdownChip(
  nearestStartUtc: string,
  venueTimezone: string,
  now: Date = new Date(),
): CountdownChip {
  const ms = new Date(nearestStartUtc).getTime() - now.getTime();
  if (ms < 24 * MS_HOUR) {
    const hours = Math.max(1, Math.ceil(ms / MS_HOUR));
    return {
      kind: "hours",
      primary: `${hours} ч`,
      soon: ms >= 0,
    };
  }
  const dayIso = venueLocalDate(nearestStartUtc, venueTimezone);
  const { month, day } = parseIsoDateParts(dayIso);
  return {
    kind: "date",
    primary: String(day),
    secondary: MONTHS_GENITIVE[month - 1].slice(0, 3),
    soon: false,
  };
}

function formatWeekdayDayMonth(isoDate: string): string {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS_SHORT[wd]}, ${day} ${MONTHS_GENITIVE[month - 1]}`;
}

function relativeDayWord(dayIso: string, timeZone: string, now: Date): "сегодня" | "завтра" | null {
  const today = todayInTimezone(timeZone, now);
  if (dayIso === today) {
    return "сегодня";
  }
  if (dayIso === addIsoDays(today, 1)) {
    return "завтра";
  }
  return null;
}

export function formatFlightBookmarkTitle(
  item: Pick<BookmarkDisplayFields, "event_number" | "event_name" | "flight_label" | "series_name">,
): string {
  const parts: string[] = [];
  if (item.event_number != null) {
    parts.push(`#${item.event_number}`);
  }
  if (item.event_name) {
    parts.push(item.event_name);
  }
  if (item.flight_label) {
    parts.push(item.flight_label);
  }
  if (parts.length === 0) {
    return item.series_name;
  }
  // "#5 Main Event · Day 1A"
  if (item.event_number != null && item.event_name) {
    const head = `#${item.event_number} ${item.event_name}`;
    return item.flight_label ? `${head} · ${item.flight_label}` : head;
  }
  return parts.join(" · ");
}

export function formatFlightBookmarkMeta(
  item: Pick<BookmarkDisplayFields, "series_name" | "nearest_start_at" | "venue_city">,
  options?: {
    userTimezone?: string;
    now?: Date;
  },
): string {
  const nearest = item.nearest_start_at;
  if (!nearest) {
    return item.series_name;
  }
  const userTimezone = options?.userTimezone ?? getUserTimezone();
  const now = options?.now ?? new Date();
  const dayIso = venueLocalDate(nearest.utc, nearest.venue_timezone);
  const relative = relativeDayWord(dayIso, nearest.venue_timezone, now);
  const dayPart = relative ?? formatWeekdayDayMonth(dayIso);
  const dual = formatDualTime(nearest.utc, nearest.venue_timezone, userTimezone);
  const timePart = dual.user ? `${dual.venue} (${dual.user})` : `${dual.venue} (то же у вас)`;

  if (relative) {
    return `${item.series_name} · ${dayPart} ${timePart}`;
  }
  return `${item.series_name} · ${dayPart} · ${timePart}`;
}

export function formatSeriesBookmarkMeta(
  item: Pick<
    BookmarkDisplayFields,
    "series_status" | "series_starts_on" | "series_ends_on" | "venue_city"
  >,
): string {
  const city = item.venue_city;
  const status = item.series_status;
  if (status === "running") {
    const { day, month } = parseIsoDateParts(item.series_ends_on);
    return `Идёт · до ${day} ${MONTHS_GENITIVE[month - 1]} · ${city}`;
  }
  if (status === "announced") {
    const { month } = parseIsoDateParts(item.series_starts_on);
    return `${MONTHS_NOMINATIVE[month]} · ${city}`;
  }
  if (status === "finished") {
    return `Завершена · ${city}`;
  }
  if (status === "cancelled") {
    return `Отменена · ${city}`;
  }
  const { day: startDay, month: startMonth } = parseIsoDateParts(item.series_starts_on);
  const { day: endDay, month: endMonth } = parseIsoDateParts(item.series_ends_on);
  const range =
    startMonth === endMonth
      ? `${startDay}–${endDay} ${MONTHS_GENITIVE[startMonth - 1]}`
      : `${startDay} ${MONTHS_GENITIVE[startMonth - 1]} – ${endDay} ${MONTHS_GENITIVE[endMonth - 1]}`;
  return `${formatSeriesStatus(status as SeriesStatus)} · ${range} · ${city}`;
}

export function seriesShowsSchedulePending(status: SeriesStatus): boolean {
  return status === "announced";
}

export function overviewToListItem(item: BookmarkOverviewItem): BookmarkListItem {
  return {
    key: item.id,
    source: "server",
    bookmarkId: item.id,
    target_type: item.target_type,
    target_id: item.target_id,
    reminder_offsets: item.reminder_offsets,
    created_at: item.created_at,
    series_id: item.series_id,
    event_id: item.event_id,
    series_name: item.series_name,
    series_status: item.series_status,
    series_starts_on: item.series_starts_on,
    series_ends_on: item.series_ends_on,
    organizer_name: item.organizer_name,
    organizer_slug: item.organizer_slug,
    venue_name: item.venue_name,
    venue_city: item.venue_city,
    event_number: item.event_number,
    event_name: item.event_name,
    flight_label: item.flight_label,
    nearest_start_at: item.nearest_start_at,
    url: item.url,
  };
}

export function guestResolvedToListItem(
  record: {
    target_type: BookmarkTargetType;
    target_id: string;
    reminder_offsets: number[];
    created_at: string;
  },
  resolved: BookmarkTargetResolveItem,
): BookmarkListItem | null {
  if (!resolved.found || !resolved.display) {
    return null;
  }
  const display = resolved.display;
  return {
    key: `${record.target_type}:${record.target_id}`,
    source: "guest",
    bookmarkId: null,
    target_type: record.target_type,
    target_id: record.target_id,
    reminder_offsets: record.reminder_offsets,
    created_at: record.created_at,
    ...display,
  };
}

export type HistoryDayGroup<T> = {
  key: string;
  label: string;
  items: T[];
};

export function groupHistoryByLocalDay<T extends { sent_at: string | null; created_at: string }>(
  items: T[],
  options?: { userTimezone?: string; now?: Date },
): HistoryDayGroup<T>[] {
  const userTimezone = options?.userTimezone ?? getUserTimezone();
  const now = options?.now ?? new Date();
  const today = todayInTimezone(userTimezone, now);
  const yesterday = addIsoDays(today, -1);

  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const when = item.sent_at ?? item.created_at;
    const dayIso = todayInTimezone(userTimezone, new Date(when));
    const list = buckets.get(dayIso) ?? [];
    list.push(item);
    buckets.set(dayIso, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dayIso, dayItems]) => {
      let label: string;
      if (dayIso === today) {
        label = "Сегодня";
      } else if (dayIso === yesterday) {
        label = "Вчера";
      } else {
        const { day, month } = parseIsoDateParts(dayIso);
        label = `${day} ${MONTHS_GENITIVE[month - 1]}`;
      }
      return { key: dayIso, label, items: dayItems };
    });
}

export type NotificationIconVariant = "gold" | "warn" | "info";

export function notificationIconVariant(type: string): NotificationIconVariant {
  switch (type) {
    case "reminder":
    case "series_starting":
      return "gold";
    case "time_changed":
    case "event_cancelled":
    case "guarantee_changed":
    case "series_cancelled":
      return "warn";
    case "schedule_published":
    default:
      return "info";
  }
}

export function notificationIconGlyph(type: string): string {
  const variant = notificationIconVariant(type);
  if (variant === "gold") {
    return "2";
  }
  if (variant === "warn") {
    return "!";
  }
  return "i";
}

export function formatHistoryTime(iso: string, userTimezone: string = getUserTimezone()): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: userTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * A bookmark that can no longer be attended. Flights go by their own start;
 * series by status and last day — the API sends `nearest_start_at: null` both for
 * a finished series and for one whose schedule is not published yet, so the date
 * is the only reliable signal.
 */
export function isPastBookmarkItem(
  item: Pick<
    BookmarkListItem,
    "target_type" | "nearest_start_at" | "series_status" | "series_ends_on"
  >,
  options?: { userTimezone?: string; now?: Date },
): boolean {
  const now = options?.now ?? new Date();
  if (item.target_type === "flight") {
    return item.nearest_start_at
      ? new Date(item.nearest_start_at.utc).getTime() <= now.getTime()
      : false;
  }
  if (item.series_status === "finished" || item.series_status === "cancelled") {
    return true;
  }
  const userTimezone = options?.userTimezone ?? getUserTimezone();
  return item.series_ends_on < todayInTimezone(userTimezone, now);
}

/** Most recently finished first. */
export function sortPastBookmarkListItems(items: BookmarkListItem[]): BookmarkListItem[] {
  const when = (item: BookmarkListItem) =>
    item.nearest_start_at ? item.nearest_start_at.utc.slice(0, 10) : item.series_ends_on;
  return [...items].sort((a, b) => {
    const aWhen = when(a);
    const bWhen = when(b);
    if (aWhen !== bWhen) {
      return aWhen < bWhen ? 1 : -1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function sortBookmarkListItems(items: BookmarkListItem[]): BookmarkListItem[] {
  const far = Number.POSITIVE_INFINITY;
  return [...items].sort((a, b) => {
    const aMs = a.nearest_start_at ? new Date(a.nearest_start_at.utc).getTime() : far;
    const bMs = b.nearest_start_at ? new Date(b.nearest_start_at.utc).getTime() : far;
    if (a.nearest_start_at == null && b.nearest_start_at != null) {
      return 1;
    }
    if (a.nearest_start_at != null && b.nearest_start_at == null) {
      return -1;
    }
    if (aMs !== bMs) {
      return aMs - bMs;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
