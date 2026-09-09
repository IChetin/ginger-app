/** Pure date/time helpers on Intl — no date libraries. */

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;
const WEEKDAYS_LONG = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
] as const;
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

export function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Inclusive UTC calendar range from startsOn to endsOn (`YYYY-MM-DD`). */
export function eachIsoDate(startsOn: string, endsOn: string): string[] {
  const start = parseIsoDateParts(startsOn);
  const end = parseIsoDateParts(endsOn);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const last = new Date(Date.UTC(end.year, end.month - 1, end.day));
  const result: string[] = [];
  while (cursor.getTime() <= last.getTime()) {
    result.push(
      formatIsoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()),
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function weekdayShort(isoDate: string): string {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAYS_SHORT[wd];
}

export function formatDayListTitle(isoDate: string): string {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS_LONG[wd]}, ${day} ${MONTHS_GENITIVE[month - 1]}`;
}

/** 1-based day index within series range. */
export function seriesDayIndex(
  startsOn: string,
  endsOn: string,
  dayIso: string,
): {
  day: number;
  total: number;
} | null {
  const days = eachIsoDate(startsOn, endsOn);
  const index = days.indexOf(dayIso);
  if (index < 0) {
    return null;
  }
  return { day: index + 1, total: days.length };
}

export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Manual override from profile (`users.timezone`); null = use browser. */
let preferredUserTimezone: string | null = null;

export function setPreferredUserTimezone(timezone: string | null | undefined): void {
  preferredUserTimezone = timezone?.trim() ? timezone.trim() : null;
}

export function getUserTimezone(): string {
  return preferredUserTimezone ?? getBrowserTimezone();
}

/** Today's calendar date in an IANA timezone as `YYYY-MM-DD`. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function formatTimeInTimezone(isoUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoUtc));
}

export function venueLocalDate(isoUtc: string, venueTimezone: string): string {
  return todayInTimezone(venueTimezone, new Date(isoUtc));
}

export function formatShortDayMonth(isoDate: string): string {
  const { month, day } = parseIsoDateParts(isoDate);
  return `${day} ${MONTHS_GENITIVE[month - 1].slice(0, 3)}`;
}

export interface DualTime {
  venue: string;
  user: string | null;
}

/**
 * Venue local HH:MM plus optional user-local line.
 * When timezones match, `user` is null (no secondary line).
 */
export function formatDualTime(
  utcIso: string,
  venueTimezone: string,
  userTimezone: string = getUserTimezone(),
): DualTime {
  const venue = formatTimeInTimezone(utcIso, venueTimezone);
  if (userTimezone === venueTimezone) {
    return { venue, user: null };
  }
  const user = formatTimeInTimezone(utcIso, userTimezone);
  return { venue, user: `${user} у вас` };
}

export function isPastUtc(utcIso: string, now: Date = new Date()): boolean {
  return new Date(utcIso).getTime() < now.getTime();
}

export type FlightLike = {
  id: string;
  label: string | null;
  start_at: { utc: string; venue_timezone: string };
};

/** Earliest flight with start_at >= now; null if all are in the past. */
export function nearestFutureFlight<T extends FlightLike>(
  flights: T[],
  now: Date = new Date(),
): T | null {
  const nowMs = now.getTime();
  let best: T | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const flight of flights) {
    const ms = new Date(flight.start_at.utc).getTime();
    if (ms >= nowMs && ms < bestMs) {
      best = flight;
      bestMs = ms;
    }
  }
  return best;
}

/** Latest flight by start_at (for “last start” when none are upcoming). */
export function lastFlightByStart<T extends FlightLike>(flights: T[]): T | null {
  if (flights.length === 0) {
    return null;
  }
  let best = flights[0];
  let bestMs = new Date(best.start_at.utc).getTime();
  for (let i = 1; i < flights.length; i += 1) {
    const flight = flights[i];
    const ms = new Date(flight.start_at.utc).getTime();
    if (ms > bestMs) {
      best = flight;
      bestMs = ms;
    }
  }
  return best;
}

export function hasFutureFlights(flights: FlightLike[], now: Date = new Date()): boolean {
  return nearestFutureFlight(flights, now) != null;
}

/**
 * Header meta under the event title.
 * Future: «Ближайший старт: …»; all past: «Последний старт: …».
 * Single unlabeled flight omits the chip label segment.
 */
export function formatEventStartMeta(
  flight: FlightLike,
  options: {
    kind: "nearest" | "last";
    userTimezone?: string;
    singleUnlabeled?: boolean;
  },
): string {
  const userTimezone = options.userTimezone ?? getUserTimezone();
  const venueTz = flight.start_at.venue_timezone;
  const dayIso = venueLocalDate(flight.start_at.utc, venueTz);
  // Compact meta weekday (design: «сб, 2 августа»)
  const { year, month, day } = parseIsoDateParts(dayIso);
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const shortDay = `${WEEKDAYS_SHORT[wd]}, ${day} ${MONTHS_GENITIVE[month - 1]}`;
  const dual = formatDualTime(flight.start_at.utc, venueTz, userTimezone);
  const timePart = dual.user ? `${dual.venue} (${dual.user})` : dual.venue;

  const prefix = options.kind === "nearest" ? "Ближайший старт" : "Последний старт";
  const showLabel = Boolean(flight.label) && !options.singleUnlabeled;
  const labelPart = showLabel ? `${flight.label} · ` : "";
  return `${prefix}: ${labelPart}${shortDay} · ${timePart}`;
}

export function defaultSeriesDay(
  startsOn: string,
  endsOn: string,
  status: string,
  venueTimezone: string,
  now: Date = new Date(),
): string {
  const days = eachIsoDate(startsOn, endsOn);
  if (days.length === 0) {
    return startsOn;
  }
  if (status === "running") {
    const today = todayInTimezone(venueTimezone, now);
    if (days.includes(today)) {
      return today;
    }
    if (today < startsOn) {
      return startsOn;
    }
    return endsOn;
  }
  return startsOn;
}
