import type { ResultsListParams, StatsFilterParams } from "@/api/types/tracker";

export const trackerKeys = {
  all: ["tracker"] as const,
  results: (params: ResultsListParams = {}) => [...trackerKeys.all, "results", params] as const,
  result: (id: string) => [...trackerKeys.all, "result", id] as const,
  stats: (params: StatsFilterParams = {}) => [...trackerKeys.all, "stats", params] as const,
  chart: (params: StatsFilterParams = {}) => [...trackerKeys.all, "chart", params] as const,
  filters: () => [...trackerKeys.all, "filters"] as const,
  filterCounts: (params: StatsFilterParams = {}) =>
    [...trackerKeys.all, "filter-counts", params] as const,
  eventSearch: (query: string) => [...trackerKeys.all, "event-search", query] as const,
  currencies: () => [...trackerKeys.all, "currencies"] as const,
};
