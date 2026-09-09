import type { MinBuyinByCurrency, SeriesListItem, SeriesStatus } from "@/api/types/schedule";
import { formatMoney } from "@/features/schedule/lib/format";
import { daysUntil, daysWord, tournamentsWord } from "@/lib/plural";
import { countryFlag, formatSeriesMeta } from "@/lib/seriesMeta";
import { getUserTimezone, parseIsoDateParts, seriesDayIndex, todayInTimezone } from "@/lib/time";

export { countryFlag };

const COUNTRY_CURRENCY: Record<string, string> = {
  RU: "RUB",
  BY: "BYN",
  CY: "EUR",
};

const MONTHS_RU = [
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

const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
] as const;

/** Abbr from organizer slug; if empty — initials of series name words. */
export function organizerAbbrev(series: SeriesListItem): string {
  const slug = series.organizer.slug.trim().toUpperCase();
  if (slug) {
    return slug.slice(0, 4);
  }
  const words = series.name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 4)
      .map((word) => word[0]!.toUpperCase())
      .join("");
  }
  return (words[0] ?? series.organizer.name).slice(0, 4).toUpperCase();
}

const MONTHS_PREPOSITIONAL = [
  "январе",
  "феврале",
  "марте",
  "апреле",
  "мае",
  "июне",
  "июле",
  "августе",
  "сентябре",
  "октябре",
  "ноябре",
  "декабре",
] as const;

export type EffectiveSeriesPhase = "running" | "soon" | "announced" | "past" | "cancelled";

/**
 * Feed/card phase from dates (venue TZ), not only DB status.
 * DB status still decides announced vs soon for future series.
 */
export function effectiveSeriesPhase(
  series: Pick<SeriesListItem, "status" | "starts_on" | "ends_on" | "venue">,
  options?: { now?: Date },
): EffectiveSeriesPhase {
  if (series.status === "cancelled") {
    return "cancelled";
  }
  if (series.status === "finished") {
    return "past";
  }
  const today = todayInTimezone(series.venue.timezone, options?.now ?? new Date());
  if (series.ends_on < today) {
    return "past";
  }
  if (series.starts_on <= today && series.ends_on >= today) {
    return "running";
  }
  // Future start.
  if (series.status === "announced") {
    return "announced";
  }
  return "soon";
}

export function formatHighlightDay(isoDate: string): string {
  const { day, month } = parseIsoDateParts(isoDate);
  return `${day} ${MONTHS_SHORT[month - 1]}`;
}

export type SeriesCardDataPart = {
  text: string;
  emphasis?: boolean;
};

/** Third line of compact series card; null → do not render the row. */
export function seriesCardDataParts(series: SeriesListItem): SeriesCardDataPart[] | null {
  const phase = effectiveSeriesPhase(series);

  if (phase === "running") {
    const count = series.today_events_count ?? 0;
    const parts: SeriesCardDataPart[] = [
      {
        text: `Сегодня ${count} ${tournamentsWord(count)}`,
        emphasis: true,
      },
    ];
    if (series.highlight) {
      parts.push({
        text: `${series.highlight.name} ${formatHighlightDay(series.highlight.date)}`,
      });
    } else {
      const min = pickDisplayMinBuyin(series.min_buyins, series.country.code);
      if (min) {
        parts.push({ text: `от ${formatMoney(min.amount, min.currency.symbol)}` });
      }
    }
    return parts;
  }

  if (phase === "announced") {
    return [{ text: "Сетка ещё не опубликована" }];
  }

  if (phase === "soon") {
    const parts: SeriesCardDataPart[] = [];
    if (series.events_count > 0) {
      parts.push({
        text: `${series.events_count} ${tournamentsWord(series.events_count)}`,
      });
    }
    const min = pickDisplayMinBuyin(series.min_buyins, series.country.code);
    if (min) {
      parts.push({ text: `от ${formatMoney(min.amount, min.currency.symbol)}` });
    }
    return parts.length > 0 ? parts : null;
  }

  return null;
}

export function liveDayBadgeLabel(
  series: Pick<SeriesListItem, "starts_on" | "ends_on" | "venue" | "status">,
  options?: { now?: Date },
): string | null {
  if (effectiveSeriesPhase(series, options) !== "running") {
    return null;
  }
  const today = todayInTimezone(series.venue.timezone, options?.now ?? new Date());
  const index = seriesDayIndex(series.starts_on, series.ends_on, today);
  if (!index) {
    return null;
  }
  return `День ${index.day} из ${index.total}`;
}

export function posterGradientClass(slug: string): string {
  const key = slug.toLowerCase();
  if (key.includes("rpt")) {
    return "bg-poster-rpt";
  }
  if (key.includes("eapt")) {
    return "bg-poster-eapt";
  }
  return "bg-poster-default";
}

export function formatSeriesDateRange(startsOn: string, endsOn: string): string {
  const start = parseIsoDateParts(startsOn);
  const end = parseIsoDateParts(endsOn);
  if (startsOn === endsOn) {
    return `${start.day} ${MONTHS_RU[start.month - 1]}`;
  }
  if (start.month === end.month && start.year === end.year) {
    return `${start.day}–${end.day} ${MONTHS_RU[start.month - 1]}`;
  }
  return `${start.day} ${MONTHS_RU[start.month - 1]} – ${end.day} ${MONTHS_RU[end.month - 1]}`;
}

export function formatAnnouncePeriod(startsOn: string): string {
  const { month } = parseIsoDateParts(startsOn);
  return MONTHS_NOMINATIVE[month - 1];
}

export function pickDisplayMinBuyin(
  minBuyins: MinBuyinByCurrency[],
  countryCode: string,
): MinBuyinByCurrency | null {
  if (minBuyins.length === 0) {
    return null;
  }
  const preferred = COUNTRY_CURRENCY[countryCode];
  if (preferred) {
    const match = minBuyins.find((item) => item.currency.code === preferred);
    if (match) {
      return match;
    }
  }
  return minBuyins[0] ?? null;
}

export function seriesMetaLine(series: SeriesListItem): string {
  return formatSeriesMeta({
    dateLabel: formatSeriesDateRange(series.starts_on, series.ends_on),
    venueName: series.venue.name,
    venueCity: series.venue.city,
    countryCode: series.country.code,
  });
}

export function seriesStatsLine(series: SeriesListItem): string {
  const parts: string[] = [];

  if (series.events_count > 0) {
    parts.push(`${series.events_count} ${tournamentsWord(series.events_count)}`);
  }

  const min = pickDisplayMinBuyin(series.min_buyins, series.country.code);
  if (min) {
    parts.push(`от ${formatMoney(min.amount, min.currency.symbol)}`);
  }

  if (series.status === "schedule_published") {
    parts.push("сетка опубликована");
  }

  return parts.join(" · ");
}

export const PAST_SERIES_HINT = "Серия уже прошла — напоминания недоступны";
export const PAST_FLIGHT_HINT = "Флайт уже начался — напоминание недоступно";

/** Series that can no longer be attended: cancelled, or its last day is behind us. */
export function isSeriesOver(
  series: { status: SeriesStatus; ends_on: string },
  options?: { userTimezone?: string; now?: Date },
): boolean {
  if (series.status === "finished" || series.status === "cancelled") {
    return true;
  }
  const userTimezone = options?.userTimezone ?? getUserTimezone();
  return series.ends_on < todayInTimezone(userTimezone, options?.now ?? new Date());
}

export function soonLabel(startsOn: string): string {
  return countdownLabel(startsOn);
}

/**
 * Badge countdown for upcoming series. Never returns «Скоро».
 * >60 days → «в октябре» (prepositional month).
 */
export function countdownLabel(startsOn: string, todayIso?: string): string {
  const days = daysUntil(startsOn, todayIso);
  if (days === null) {
    const { month } = parseIsoDateParts(startsOn);
    return `в ${MONTHS_PREPOSITIONAL[month - 1]}`;
  }
  if (days === 0) {
    return "сегодня";
  }
  if (days === 1) {
    return "завтра";
  }
  if (days > 60) {
    const { month } = parseIsoDateParts(startsOn);
    return `в ${MONTHS_PREPOSITIONAL[month - 1]}`;
  }
  return `через ${days} ${daysWord(days)}`;
}
