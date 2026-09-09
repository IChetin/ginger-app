import type { SeriesStatus } from "@/api/types/schedule";

export const SEED_COUNTRIES = [
  { code: "RU", name_ru: "Россия" },
  { code: "BY", name_ru: "Беларусь" },
  { code: "CY", name_ru: "Кипр" },
] as const;

export const SEED_CURRENCIES = ["RUB", "USD", "EUR", "BYN"] as const;

export const SEED_TIMEZONES = ["Europe/Moscow", "Europe/Minsk", "Asia/Nicosia"] as const;

export const SERIES_STATUS_TRANSITIONS: Record<SeriesStatus, SeriesStatus[]> = {
  announced: ["schedule_published", "cancelled"],
  schedule_published: ["running", "finished", "cancelled"],
  running: ["finished", "cancelled"],
  finished: ["cancelled"],
  cancelled: [],
};

export const PUBLISHED_SERIES_STATUSES: SeriesStatus[] = [
  "schedule_published",
  "running",
  "finished",
  "cancelled",
];

export function isSeriesPublished(status: SeriesStatus): boolean {
  return PUBLISHED_SERIES_STATUSES.includes(status);
}

/** Hard delete всегда доступен в UI; сервер отклонит при закладках/результатах. */
export function canDeleteSeries(_status?: SeriesStatus): boolean {
  return true;
}

export function canDeleteEvent(seriesStatus: SeriesStatus): boolean {
  return seriesStatus === "announced";
}

export const SUGGESTED_EVENT_TAGS = [
  { value: "turbo", label: "Турбо" },
  { value: "bounty", label: "Баунти" },
  { value: "satellite", label: "Сателлит" },
  { value: "deepstack", label: "Дипстек" },
  { value: "freezeout", label: "Freezeout" },
  { value: "pko", label: "PKO" },
  { value: "freeroll", label: "Фриролл" },
  { value: "main", label: "Флагман" },
  { value: "ladies", label: "Ladies" },
  { value: "seniors", label: "Seniors" },
  { value: "heads_up", label: "Heads-up" },
  { value: "6max", label: "6-max" },
  { value: "7max", label: "7-max" },
  { value: "8max", label: "8-max" },
] as const;
