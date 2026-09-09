import type { DateTimeWithTimezone, GameType, SeriesStatus } from "@/api/types/schedule";
import { getUserTimezone } from "@/lib/time";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(isoDate: string): string {
  return dateFormatter.format(parseIsoDate(isoDate));
}

export function formatDateRange(startsOn: string, endsOn: string): string {
  const start = parseIsoDate(startsOn);
  const end = parseIsoDate(endsOn);
  if (startsOn === endsOn) {
    return dateFormatter.format(start);
  }
  return `${shortDateFormatter.format(start)} – ${dateFormatter.format(end)}`;
}

export function formatMoney(amount: string, symbol: string): string {
  const number = Number(amount);
  const formatted = Number.isFinite(number)
    ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(number)
    : amount;
  return `${formatted} ${symbol}`;
}

export function formatGameType(gameType: GameType): string {
  const labels: Record<GameType, string> = {
    nlh: "NLH",
    plo: "PLO",
    plo5: "PLO5",
    mixed: "Mixed",
    other: "Other",
  };
  return labels[gameType];
}

export function formatSeriesStatus(status: SeriesStatus): string {
  const labels: Record<SeriesStatus, string> = {
    announced: "Анонс",
    schedule_published: "Расписание",
    running: "Идёт",
    finished: "Завершена",
    cancelled: "Отменена",
  };
  return labels[status];
}

export function formatFlightDateTime(
  value: DateTimeWithTimezone,
  userTimezone: string = getUserTimezone(),
): { venue: string; user: string | null } {
  const venueDate = new Date(value.venue_local);
  const utcDate = new Date(value.utc);
  const venueLabel = `${shortDateFormatter.format(venueDate)}, ${timeFormatter.format(venueDate)} (${value.venue_timezone})`;

  if (userTimezone === value.venue_timezone) {
    return { venue: venueLabel, user: null };
  }

  const userLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: userTimezone,
  }).format(utcDate);

  return {
    venue: venueLabel,
    user: `${userLabel} (ваше время)`,
  };
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}
