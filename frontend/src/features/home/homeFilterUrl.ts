import type { SeriesListParams } from "@/api/types/schedule";
import type { AppliedChip, FilterValues, SegmentOption } from "@/components/filters/types";
import { buyinLabel } from "@/features/filters/buyinPresets";
import {
  readCsvParam,
  writeCsvParam,
  writeScalarParam,
} from "@/features/filters/useFilterSearchParams";

export type HomeStatusSegment = "all" | "running" | "archive";
/** Shared period keys; meaning (future vs past) depends on the status segment. */
export type HomePeriod = "month" | "3m" | "6m" | "year" | "all" | "custom";

export interface HomeFiltersState {
  status: HomeStatusSegment;
  countries: string[];
  buyin: string[];
  organizers: string[];
  venues: string[];
  period: HomePeriod | "";
  date_from: string;
  date_to: string;
}

export const HOME_SEGMENTS: SegmentOption[] = [
  { value: "all", label: "Все" },
  { value: "running", label: "Идут" },
  { value: "archive", label: "Архив" },
];

/** Future-looking presets for active feed segments. */
export const HOME_PERIOD_OPTIONS: Array<{ value: HomePeriod; label: string }> = [
  { value: "month", label: "Ближайший месяц" },
  { value: "3m", label: "3 месяца" },
  { value: "6m", label: "Полгода" },
  { value: "custom", label: "Свой период" },
];

/** Past-looking presets for the archive segment. Default = весь архив (no period). */
export const HOME_ARCHIVE_PERIOD_OPTIONS: Array<{ value: HomePeriod; label: string }> = [
  { value: "month", label: "За последний месяц" },
  { value: "3m", label: "За 3 месяца" },
  { value: "year", label: "За год" },
  { value: "all", label: "Весь архив" },
  { value: "custom", label: "Свой период" },
];

const GROUP_IDS = ["countries", "buyin", "organizers", "period"] as const;

/** Page size for archive infinite scroll; other segments load one page. */
export const HOME_ARCHIVE_PAGE_SIZE = 20;
export const HOME_FEED_LIMIT = 100;

export function emptyHomeFilters(status: HomeStatusSegment = "all"): HomeFiltersState {
  return {
    status,
    countries: [],
    buyin: [],
    organizers: [],
    venues: [],
    period: "",
    date_from: "",
    date_to: "",
  };
}

function parseStatus(raw: string | null): HomeStatusSegment {
  if (raw === "running" || raw === "live_soon" || raw === "upcoming") return "running";
  if (raw === "archive" || raw === "finished") return "archive";
  // Legacy `status=announced` (removed home tab) falls through to «Все».
  return "all";
}

function parsePeriod(raw: string | null): HomePeriod | "" {
  if (
    raw === "month" ||
    raw === "3m" ||
    raw === "6m" ||
    raw === "year" ||
    raw === "all" ||
    raw === "custom"
  ) {
    return raw;
  }
  return "";
}

export function homePeriodOptionsForStatus(
  status: HomeStatusSegment,
): Array<{ value: HomePeriod; label: string }> {
  return status === "archive" ? HOME_ARCHIVE_PERIOD_OPTIONS : HOME_PERIOD_OPTIONS;
}

export function homePeriodLabel(period: HomePeriod | "", status: HomeStatusSegment): string {
  if (!period) {
    return status === "archive" ? "Весь архив" : period;
  }
  const fromSegment = homePeriodOptionsForStatus(status).find((item) => item.value === period);
  if (fromSegment) return fromSegment.label;
  const fromAny = [...HOME_PERIOD_OPTIONS, ...HOME_ARCHIVE_PERIOD_OPTIONS].find(
    (item) => item.value === period,
  );
  return fromAny?.label ?? period;
}

export function homeFiltersFromSearchParams(params: URLSearchParams): HomeFiltersState {
  return {
    status: parseStatus(params.get("status")),
    countries: readCsvParam(params, "countries"),
    buyin: readCsvParam(params, "buyin"),
    organizers: readCsvParam(params, "organizers"),
    venues: readCsvParam(params, "venues"),
    period: parsePeriod(params.get("period")),
    date_from: params.get("date_from") ?? "",
    date_to: params.get("date_to") ?? "",
  };
}

export function homeFiltersToSearchParams(filters: HomeFiltersState): URLSearchParams {
  const params = new URLSearchParams();
  writeScalarParam(params, "status", filters.status === "all" ? null : filters.status);
  writeCsvParam(params, "countries", filters.countries);
  writeCsvParam(params, "buyin", filters.buyin);
  writeCsvParam(params, "organizers", filters.organizers);
  writeCsvParam(params, "venues", filters.venues);
  // «весь архив» / empty — omit period from URL
  const periodParam = !filters.period || filters.period === "all" ? null : filters.period;
  writeScalarParam(params, "period", periodParam);
  if (filters.period === "custom") {
    writeScalarParam(params, "date_from", filters.date_from || null);
    writeScalarParam(params, "date_to", filters.date_to || null);
  }
  return params;
}

export function homeFilterValues(filters: HomeFiltersState): FilterValues {
  const isArchive = filters.status === "archive";
  let periodValues: string[] = [];
  if (filters.period && filters.period !== "all") {
    periodValues = [filters.period];
  } else if (isArchive) {
    // Explicit «весь архив» so the single-select shows a selected preset.
    periodValues = ["all"];
  }
  return {
    countries: filters.countries,
    buyin: filters.buyin,
    organizers: filters.organizers,
    venues: filters.venues,
    period: periodValues,
  };
}

export function applyHomeFilterValues(
  filters: HomeFiltersState,
  values: FilterValues,
): HomeFiltersState {
  const raw = values.period?.[0] as HomePeriod | undefined;
  const period: HomePeriod | "" = !raw || raw === "all" ? "" : raw;
  return {
    ...filters,
    countries: values.countries ?? [],
    buyin: values.buyin ?? [],
    organizers: values.organizers ?? [],
    venues: values.venues ?? [],
    period,
    date_from: period === "custom" ? filters.date_from : "",
    date_to: period === "custom" ? filters.date_to : "",
  };
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function homePeriodToDateRange(
  period: HomePeriod | "",
  dateFrom: string,
  dateTo: string,
  options?: { mode?: "future" | "past"; now?: Date },
): { starts_from?: string; starts_to?: string } {
  if (!period || period === "all") return {};
  if (period === "custom") {
    return {
      ...(dateFrom ? { starts_from: dateFrom } : {}),
      ...(dateTo ? { starts_to: dateTo } : {}),
    };
  }
  const now = options?.now ?? new Date();
  const mode = options?.mode ?? "future";

  if (mode === "past") {
    const to = isoDate(now);
    const start = new Date(now);
    if (period === "month") start.setDate(start.getDate() - 30);
    else if (period === "3m") start.setMonth(start.getMonth() - 3);
    else if (period === "6m") start.setMonth(start.getMonth() - 6);
    else if (period === "year") start.setFullYear(start.getFullYear() - 1);
    else return {};
    return { starts_from: isoDate(start), starts_to: to };
  }

  const from = isoDate(now);
  const end = new Date(now);
  if (period === "month") end.setDate(end.getDate() + 30);
  else if (period === "3m") end.setMonth(end.getMonth() + 3);
  else if (period === "6m") end.setMonth(end.getMonth() + 6);
  else if (period === "year") end.setFullYear(end.getFullYear() + 1);
  else return {};
  return { starts_from: from, starts_to: isoDate(end) };
}

export function homeStatusToApiFilter(
  status: HomeStatusSegment,
): NonNullable<SeriesListParams["status"]> {
  if (status === "all") return "actual";
  if (status === "running") return "running";
  return "finished";
}

export function homeFiltersToSeriesParams(
  filters: HomeFiltersState,
  options?: { limit?: number; offset?: number },
): SeriesListParams {
  const isArchive = filters.status === "archive";
  const range = homePeriodToDateRange(filters.period, filters.date_from, filters.date_to, {
    mode: isArchive ? "past" : "future",
  });
  return {
    status: homeStatusToApiFilter(filters.status),
    countries: filters.countries.length ? filters.countries.join(",") : undefined,
    organizers: filters.organizers.length ? filters.organizers.join(",") : undefined,
    venues: filters.venues.length ? filters.venues.join(",") : undefined,
    buyin: filters.buyin.length ? filters.buyin.join(",") : undefined,
    ...range,
    limit: options?.limit ?? (isArchive ? HOME_ARCHIVE_PAGE_SIZE : HOME_FEED_LIMIT),
    offset: options?.offset ?? 0,
  };
}

export function homeActiveCount(filters: HomeFiltersState): number {
  return (
    filters.countries.length +
    filters.buyin.length +
    filters.organizers.length +
    filters.venues.length +
    (filters.period && filters.period !== "all" ? 1 : 0)
  );
}

export function homeAppliedChips(
  filters: HomeFiltersState,
  labels: {
    countries: Record<string, string>;
    organizers: Record<string, string>;
    venues?: Record<string, string>;
  },
): AppliedChip[] {
  const chips: AppliedChip[] = [];
  for (const code of filters.countries) {
    chips.push({
      groupId: "countries",
      value: code,
      label: labels.countries[code] ?? code,
    });
  }
  for (const preset of filters.buyin) {
    chips.push({ groupId: "buyin", value: preset, label: buyinLabel(preset) });
  }
  for (const id of filters.organizers) {
    chips.push({
      groupId: "organizers",
      value: id,
      label: labels.organizers[id] ?? id,
    });
  }
  for (const id of filters.venues) {
    chips.push({
      groupId: "venues",
      value: id,
      label: labels.venues?.[id] ?? "Площадка",
    });
  }
  if (filters.period && filters.period !== "all") {
    chips.push({
      groupId: "period",
      value: filters.period,
      label: homePeriodLabel(filters.period, filters.status),
    });
  }
  return chips;
}

export { GROUP_IDS as HOME_GROUP_IDS };
