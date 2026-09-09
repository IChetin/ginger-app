import type { BookmarkListItem } from "@/api/types/bookmarks";
import type { DateTimeWithTimezone, SeriesStatus } from "@/api/types/schedule";
import fixture from "@/demo/bookmarks.json";
import { addIsoDays } from "@/features/bookmarks/lib/bookmarkDisplay";
import { formatIsoDate, parseIsoDateParts, todayInTimezone } from "@/lib/time";

export const DEMO_BOOKMARK_LOGIN = {
  title: "Войдите, чтобы управлять закладками",
  description:
    "Пример нельзя изменить. После входа закладки и напоминания будут вашими на всех устройствах.",
} as const;

export const GUEST_BOOKMARKS_BANNER =
  "Войдите, чтобы получать напоминания на всех устройствах";

type HoursFromNow = { kind: "hours_from_now"; hours: number };
type DaysAt = { kind: "days_at"; days: number; hour: number; minute: number };

interface DemoFlightRow {
  id: string;
  event_number: number | null;
  event_name: string;
  flight_label: string | null;
  series_name: string;
  series_status: SeriesStatus;
  organizer_name: string;
  organizer_slug: string;
  venue_name: string;
  venue_city: string;
  venue_timezone: string;
  url: string;
  reminder_offsets: number[];
  start: HoursFromNow | DaysAt;
  series_starts_offset_days: number;
  series_ends_offset_days: number;
}

interface DemoSeriesRow {
  id: string;
  series_name: string;
  series_status: SeriesStatus;
  organizer_name: string;
  organizer_slug: string;
  venue_name: string;
  venue_city: string;
  venue_timezone: string;
  url: string;
  reminder_offsets: number[];
  starts_offset_days: number;
  ends_offset_days: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    offset: get("timeZoneName"),
  };
}

function gmtToIsoOffset(raw: string): string {
  const match = raw.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return "+00:00";
  }
  return `${match[1]}${pad2(Number(match[2]))}:${match[3] ?? "00"}`;
}

export function venueLocalToUtc(
  isoDate: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const { year, month, day } = parseIsoDateParts(isoDate);
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = zonedParts(new Date(utc), timeZone);
    const shown = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = wanted - shown;
    if (delta === 0) {
      break;
    }
    utc += delta;
  }
  return new Date(utc);
}

export function toDateTimeWithTimezone(utc: Date, timeZone: string): DateTimeWithTimezone {
  const parts = zonedParts(utc, timeZone);
  const offset = gmtToIsoOffset(parts.offset);
  return {
    utc: utc.toISOString(),
    venue_local: `${formatIsoDate(parts.year, parts.month, parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}${offset}`,
    venue_timezone: timeZone,
  };
}

function resolveStart(
  start: HoursFromNow | DaysAt,
  timeZone: string,
  now: Date,
): DateTimeWithTimezone {
  if (start.kind === "hours_from_now") {
    return toDateTimeWithTimezone(new Date(now.getTime() + start.hours * 3_600_000), timeZone);
  }
  const dayIso = addIsoDays(todayInTimezone(timeZone, now), start.days);
  return toDateTimeWithTimezone(
    venueLocalToUtc(dayIso, start.hour, start.minute, timeZone),
    timeZone,
  );
}

function flightToItem(row: DemoFlightRow, now: Date): BookmarkListItem {
  const created = now.toISOString();
  return {
    key: `demo:flight:${row.id}`,
    source: "demo",
    bookmarkId: null,
    target_type: "flight",
    target_id: row.id,
    reminder_offsets: row.reminder_offsets,
    created_at: created,
    series_id: null,
    event_id: null,
    series_name: row.series_name,
    series_status: row.series_status,
    series_starts_on: addIsoDays(todayInTimezone(row.venue_timezone, now), row.series_starts_offset_days),
    series_ends_on: addIsoDays(todayInTimezone(row.venue_timezone, now), row.series_ends_offset_days),
    organizer_name: row.organizer_name,
    organizer_slug: row.organizer_slug,
    venue_name: row.venue_name,
    venue_city: row.venue_city,
    event_number: row.event_number,
    event_name: row.event_name,
    flight_label: row.flight_label,
    nearest_start_at: resolveStart(row.start, row.venue_timezone, now),
    url: row.url,
  };
}

function seriesToItem(row: DemoSeriesRow, now: Date): BookmarkListItem {
  const today = todayInTimezone(row.venue_timezone, now);
  return {
    key: `demo:series:${row.id}`,
    source: "demo",
    bookmarkId: null,
    target_type: "series",
    target_id: row.id,
    reminder_offsets: row.reminder_offsets,
    created_at: now.toISOString(),
    series_id: null,
    event_id: null,
    series_name: row.series_name,
    series_status: row.series_status,
    series_starts_on: addIsoDays(today, row.starts_offset_days),
    series_ends_on: addIsoDays(today, row.ends_offset_days),
    organizer_name: row.organizer_name,
    organizer_slug: row.organizer_slug,
    venue_name: row.venue_name,
    venue_city: row.venue_city,
    event_number: null,
    event_name: null,
    flight_label: null,
    nearest_start_at: null,
    url: row.url,
  };
}

/** Собирает демо-закладки с датами относительно `now`, чтобы отсчёт не устаревал. */
export function listDemoBookmarks(now: Date = new Date()): BookmarkListItem[] {
  const flights = (fixture.flights as DemoFlightRow[]).map((row) => flightToItem(row, now));
  const series = (fixture.series as DemoSeriesRow[]).map((row) => seriesToItem(row, now));
  return [...flights, ...series];
}
