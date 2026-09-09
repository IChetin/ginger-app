import type { StatsFilterParams } from "@/api/types/tracker";
import type { AppliedChip, FilterValues, SegmentOption } from "@/components/filters/types";
import { buyinLabel } from "@/features/filters/buyinPresets";
import {
  readCsvParam,
  writeCsvParam,
  writeScalarParam,
} from "@/features/filters/useFilterSearchParams";
import {
  parseTrackerPeriod,
  periodDateFilters,
  type TrackerPeriod,
} from "@/features/tracker/lib/trackerFilters";

export interface TrackerFiltersState {
  period: TrackerPeriod;
  series: string[];
  buyin: string[];
  venues: string[];
  result: string[];
}

export const TRACKER_SEGMENTS: SegmentOption[] = [
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
  { value: "all", label: "Всё время" },
];

export const TRACKER_RESULT_OPTIONS = [
  { value: "itm", label: "Только в призах" },
  { value: "no_itm", label: "Только без призов" },
] as const;

export function emptyTrackerFilters(period: TrackerPeriod = "year"): TrackerFiltersState {
  return {
    period,
    series: [],
    buyin: [],
    venues: [],
    result: [],
  };
}

export function trackerFiltersFromSearchParams(params: URLSearchParams): TrackerFiltersState {
  return {
    period: parseTrackerPeriod(params.get("period")),
    series: readCsvParam(params, "series"),
    buyin: readCsvParam(params, "buyin"),
    venues: readCsvParam(params, "venues"),
    result: readCsvParam(params, "result"),
  };
}

export function trackerFiltersToSearchParams(filters: TrackerFiltersState): URLSearchParams {
  const params = new URLSearchParams();
  writeScalarParam(params, "period", filters.period);
  writeCsvParam(params, "series", filters.series);
  writeCsvParam(params, "buyin", filters.buyin);
  writeCsvParam(params, "venues", filters.venues);
  writeCsvParam(params, "result", filters.result);
  return params;
}

export function trackerFilterValues(filters: TrackerFiltersState): FilterValues {
  return {
    series: filters.series,
    buyin: filters.buyin,
    venues: filters.venues,
    result: filters.result,
  };
}

export function applyTrackerFilterValues(
  filters: TrackerFiltersState,
  values: FilterValues,
): TrackerFiltersState {
  return {
    ...filters,
    series: values.series ?? [],
    buyin: values.buyin ?? [],
    venues: values.venues ?? [],
    result: values.result ?? [],
  };
}

export function trackerFiltersToApiParams(filters: TrackerFiltersState): StatsFilterParams {
  return {
    ...periodDateFilters(filters.period),
    ...(filters.series.length ? { series: filters.series.join(",") } : {}),
    ...(filters.buyin.length ? { buyin: filters.buyin.join(",") } : {}),
    ...(filters.venues.length ? { venues: filters.venues.join(",") } : {}),
    ...(filters.result.length ? { result: filters.result.join(",") } : {}),
  };
}

export function trackerActiveCount(filters: TrackerFiltersState): number {
  return (
    filters.series.length + filters.buyin.length + filters.venues.length + filters.result.length
  );
}

export function trackerAppliedChips(
  filters: TrackerFiltersState,
  labels: {
    series: Record<string, string>;
    venues: Record<string, string>;
  },
): AppliedChip[] {
  const chips: AppliedChip[] = [];
  for (const id of filters.series) {
    chips.push({
      groupId: "series",
      value: id,
      label: id === "none" ? "Без серии" : (labels.series[id] ?? id),
    });
  }
  for (const preset of filters.buyin) {
    chips.push({ groupId: "buyin", value: preset, label: buyinLabel(preset) });
  }
  for (const id of filters.venues) {
    chips.push({
      groupId: "venues",
      value: id,
      label: labels.venues[id] ?? id,
    });
  }
  for (const kind of filters.result) {
    const label =
      TRACKER_RESULT_OPTIONS.find((item) => item.value === kind)?.label ?? kind;
    chips.push({ groupId: "result", value: kind, label });
  }
  return chips;
}
