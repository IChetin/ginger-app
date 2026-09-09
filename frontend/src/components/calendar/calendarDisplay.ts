import type { CalendarSeriesItem, SeriesStatus } from "@/api/types/schedule";
import { isSeriesOver } from "@/components/series/seriesDisplay";
import { shiftMonth } from "@/features/schedule/lib/calendarGrid";
import { daysWord } from "@/lib/plural";
import { formatSeriesVenuePlace, joinMetaParts } from "@/lib/seriesMeta";
import { parseIsoDateParts } from "@/lib/time";

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

const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
] as const;

export type CalendarDotKind = "gold" | "gray";

export interface MonthParts {
  year: number;
  month: number;
  monthKey: string;
}

export function currentMonthKey(now: Date = new Date()): string {
  return formatMonthKey(now.getFullYear(), now.getMonth() + 1);
}

export function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(monthKey: string): MonthParts | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month, monthKey: formatMonthKey(year, month) };
}

export function readMonthFromSearchParams(
  params: URLSearchParams,
  now: Date = new Date(),
): MonthParts {
  const parsed = parseMonthKey(params.get("month") ?? "");
  if (parsed) {
    return parsed;
  }
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    monthKey: currentMonthKey(now),
  };
}

export function readDayFromSearchParams(params: URLSearchParams, month: MonthParts): string | null {
  const day = params.get("day");
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null;
  }
  if (!day.startsWith(month.monthKey)) {
    return null;
  }
  return day;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarRangeState = {
  from: string | null;
  to: string | null;
};

export function readRangeFromSearchParams(params: URLSearchParams): CalendarRangeState {
  const from = params.get("from");
  const to = params.get("to");
  const fromOk = from !== null && ISO_DATE_RE.test(from) ? from : null;
  const toOk = to !== null && ISO_DATE_RE.test(to) ? to : null;
  // Incomplete selection: only `from` in URL (picking end).
  if (fromOk && !toOk) {
    return { from: fromOk, to: null };
  }
  if (fromOk && toOk) {
    return fromOk <= toOk ? { from: fromOk, to: toOk } : { from: toOk, to: fromOk };
  }
  return { from: null, to: null };
}

export function addCalendarMonths(isoDate: string, months: number): string {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const total = month - 1 + months;
  const nextYear = year + Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  const cappedDay = Math.min(day, lastDayOfMonth(nextYear, nextMonth));
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(cappedDay).padStart(2, "0")}`;
}

export function isPeriodLongerThanMonths(from: string, to: string, months: number): boolean {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  return end > addCalendarMonths(start, months);
}

export function inclusiveDayCount(from: string, to: string): number {
  const start = parseIsoDateParts(from);
  const end = parseIsoDateParts(to);
  const ms =
    Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day);
  return Math.floor(ms / 86_400_000) + 1;
}

export type RangeTapResult =
  | { kind: "state"; from: string | null; to: string | null }
  | { kind: "too_long"; from: string };

export function applyRangeTap(state: CalendarRangeState, dayIso: string): RangeTapResult {
  const { from, to } = state;

  if (!from && !to) {
    return { kind: "state", from: dayIso, to: null };
  }

  if (from && !to) {
    if (dayIso === from) {
      return { kind: "state", from: null, to: null };
    }
    const start = dayIso < from ? dayIso : from;
    const end = dayIso < from ? from : dayIso;
    if (isPeriodLongerThanMonths(start, end, 6)) {
      return { kind: "too_long", from };
    }
    return { kind: "state", from: start, to: end };
  }

  // Both bounds set.
  if (from && to) {
    if (dayIso === from && dayIso === to) {
      return { kind: "state", from: null, to: null };
    }
    if (dayIso === from) {
      return { kind: "state", from: to, to: null };
    }
    if (dayIso === to) {
      return { kind: "state", from, to: null };
    }
    return { kind: "state", from: dayIso, to: null };
  }

  return { kind: "state", from: dayIso, to: null };
}

export function formatPeriodBarLabel(from: string, to: string | null): string {
  const start = parseIsoDateParts(from);
  if (!to) {
    return `${start.day} ${MONTHS_SHORT[start.month - 1]} — выберите конец`;
  }
  const end = parseIsoDateParts(to);
  const count = inclusiveDayCount(from, to);
  const label = `${count} ${daysWord(count)}`;
  if (start.year === end.year && start.month === end.month) {
    if (from === to) {
      return `${start.day} ${MONTHS_GENITIVE[start.month - 1]} · ${label}`;
    }
    return `${start.day} — ${end.day} ${MONTHS_GENITIVE[start.month - 1]} · ${label}`;
  }
  return `${start.day} ${MONTHS_SHORT[start.month - 1]} — ${end.day} ${MONTHS_SHORT[end.month - 1]} · ${label}`;
}

export function formatOverlapRange(from: string, to: string): string {
  const start = parseIsoDateParts(from);
  const end = parseIsoDateParts(to);
  if (from === to) {
    return `${start.day} ${MONTHS_SHORT[start.month - 1]}`;
  }
  if (start.year === end.year && start.month === end.month) {
    return `${start.day}–${end.day} ${MONTHS_SHORT[start.month - 1]}`;
  }
  return `${start.day} ${MONTHS_SHORT[start.month - 1]} – ${end.day} ${MONTHS_SHORT[end.month - 1]}`;
}

export type RangeCellRole = "none" | "in" | "start" | "end" | "only";

export function rangeCellRole(isoDate: string, range: CalendarRangeState): RangeCellRole {
  const { from, to } = range;
  if (!from) {
    return "none";
  }
  if (!to) {
    return isoDate === from ? "only" : "none";
  }
  if (isoDate < from || isoDate > to) {
    return "none";
  }
  if (from === to) {
    return "only";
  }
  if (isoDate === from) {
    return "start";
  }
  if (isoDate === to) {
    return "end";
  }
  return "in";
}

export function readCalendarFilterParams(params: URLSearchParams): {
  country_code?: string;
  zone?: string;
  organizer_id?: string;
  status?: SeriesStatus;
  buyin_min?: string;
  buyin_max?: string;
  game_type?: import("@/api/types/schedule").GameType;
  tags?: string[];
} {
  const result: ReturnType<typeof readCalendarFilterParams> = {};
  const country = params.get("country_code");
  if (country) result.country_code = country;
  const zone = params.get("zone");
  if (zone) result.zone = zone;
  const organizer = params.get("organizer_id");
  if (organizer) result.organizer_id = organizer;
  const status = params.get("status");
  if (status) result.status = status as SeriesStatus;
  const buyinMin = params.get("buyin_min");
  if (buyinMin) result.buyin_min = buyinMin;
  const buyinMax = params.get("buyin_max");
  if (buyinMax) result.buyin_max = buyinMax;
  const gameType = params.get("game_type");
  if (gameType) {
    result.game_type = gameType as import("@/api/types/schedule").GameType;
  }
  const tags = params.getAll("tags");
  if (tags.length > 0) result.tags = tags;
  return result;
}

export function shiftMonthKey(monthKey: string, delta: number): MonthParts {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    const fallback = readMonthFromSearchParams(new URLSearchParams());
    const shifted = shiftMonth(fallback.year, fallback.month, delta);
    return {
      year: shifted.year,
      month: shifted.month,
      monthKey: formatMonthKey(shifted.year, shifted.month),
    };
  }
  const shifted = shiftMonth(parsed.year, parsed.month, delta);
  return {
    year: shifted.year,
    month: shifted.month,
    monthKey: formatMonthKey(shifted.year, shifted.month),
  };
}

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

export function monthTitle(year: number, month: number): string {
  return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
}

export function monthSeriesSectionTitle(month: number): string {
  return `Серии ${MONTHS_GENITIVE[month - 1]}`;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function isSeriesActiveOnDay(series: CalendarSeriesItem, isoDate: string): boolean {
  return series.starts_on <= isoDate && series.ends_on >= isoDate;
}

export function getDayDots(
  series: CalendarSeriesItem[],
  isoDate: string,
  showBookmarkDots: boolean,
): CalendarDotKind[] {
  const active = series.filter((item) => isSeriesActiveOnDay(item, isoDate));
  const dots: CalendarDotKind[] = [];

  if (showBookmarkDots) {
    for (const item of active) {
      // Past series keep the bookmark in data, but the gold "active" cue is off (BUG-3).
      if (item.is_bookmarked && !isSeriesOver(item)) {
        dots.push("gold");
      }
    }
  }

  for (const item of active) {
    if (showBookmarkDots && item.is_bookmarked && !isSeriesOver(item)) {
      continue;
    }
    dots.push("gray");
  }

  return dots.slice(0, 3);
}

export function sortCalendarSeries(series: CalendarSeriesItem[]): CalendarSeriesItem[] {
  return [...series].sort((left, right) => {
    const leftAnnounced = left.status === "announced" ? 1 : 0;
    const rightAnnounced = right.status === "announced" ? 1 : 0;
    if (leftAnnounced !== rightAnnounced) {
      return leftAnnounced - rightAnnounced;
    }
    if (left.starts_on !== right.starts_on) {
      return left.starts_on.localeCompare(right.starts_on);
    }
    return left.name.localeCompare(right.name, "ru");
  });
}

export function filterSeriesByDay(
  series: CalendarSeriesItem[],
  dayIso: string | null,
): CalendarSeriesItem[] {
  const sorted = sortCalendarSeries(series);
  if (!dayIso) {
    return sorted;
  }
  return sorted.filter((item) => isSeriesActiveOnDay(item, dayIso));
}

export function formatCalendarRangeChip(
  series: CalendarSeriesItem,
  viewYear: number,
  viewMonth: number,
): { main: string; monthLabel: string } {
  const monthLabel = MONTHS_SHORT[viewMonth - 1];
  const viewStart = formatMonthKey(viewYear, viewMonth) + "-01";
  const viewEnd =
    formatMonthKey(viewYear, viewMonth) +
    `-${String(lastDayOfMonth(viewYear, viewMonth)).padStart(2, "0")}`;

  if (series.status === "announced") {
    const { day } = parseIsoDateParts(series.starts_on);
    return { main: `~${day}`, monthLabel };
  }

  const start = parseIsoDateParts(series.starts_on);
  const end = parseIsoDateParts(series.ends_on);
  const startDay = start.day;
  const endDay = end.day;
  const startMonth = start.month;
  const endMonth = end.month;

  if (series.starts_on === series.ends_on) {
    return { main: String(startDay), monthLabel };
  }

  if (series.starts_on < viewStart) {
    const startLabel = `${String(startDay).padStart(2, "0")}.${String(startMonth).padStart(2, "0")}`;
    return { main: `${startLabel}–${endDay}`, monthLabel };
  }

  if (series.ends_on > viewEnd) {
    const endLabel = `${String(endDay).padStart(2, "0")}.${String(endMonth).padStart(2, "0")}`;
    return { main: `${startDay}–${endLabel}`, monthLabel };
  }

  return { main: `${startDay}–${endDay}`, monthLabel };
}

export function seriesMetaLine(series: CalendarSeriesItem): string {
  return joinMetaParts(
    formatSeriesVenuePlace({
      venueName: series.venue.name,
      venueCity: series.venue.city,
      countryCode: series.country.code,
    }),
  );
}

export function statusBadgeVariant(status: SeriesStatus): "live" | "announced" | null {
  if (status === "running") {
    return "live";
  }
  if (status === "announced") {
    return "announced";
  }
  return null;
}
