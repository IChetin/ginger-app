import type { StatsFilterParams } from "@/api/types/tracker";

export type TrackerPeriod = "year" | "all" | "month";

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function periodDateFilters(
  period: TrackerPeriod,
  now: Date = new Date(),
): Pick<StatsFilterParams, "date_from" | "date_to"> {
  if (period === "all") {
    return {};
  }
  if (period === "month") {
    return {
      date_from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      date_to: isoDate(now),
    };
  }
  return {
    date_from: `${now.getFullYear()}-01-01`,
    date_to: isoDate(now),
  };
}

export function parseTrackerPeriod(value: string | null): TrackerPeriod {
  return value === "all" || value === "month" ? value : "year";
}
