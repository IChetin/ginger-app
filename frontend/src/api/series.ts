import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  fetchEventDetail,
  fetchScheduleFilters,
  fetchSeriesDetail,
  fetchSeriesFilterCounts,
  fetchSeriesList,
  fetchSeriesSchedule,
} from "@/api/client";
import type { SeriesListParams } from "@/api/types/schedule";
import type { HomeFiltersState } from "@/features/home/homeFilterUrl";
import {
  HOME_ARCHIVE_PAGE_SIZE,
  homeFiltersToSeriesParams,
} from "@/features/home/homeFilterUrl";

export const seriesQueryKeys = {
  all: ["series"] as const,
  list: (filters: SeriesListParams) => [...seriesQueryKeys.all, "list", filters] as const,
  listInfinite: (filters: Omit<SeriesListParams, "limit" | "offset">) =>
    [...seriesQueryKeys.all, "list-infinite", filters] as const,
  detail: (id: string) => [...seriesQueryKeys.all, "detail", id] as const,
  schedule: (id: string, includeBlinds: boolean) =>
    [...seriesQueryKeys.all, "schedule", id, includeBlinds] as const,
  eventDetail: (id: string) => [...seriesQueryKeys.all, "event", id] as const,
  filterOptions: () => [...seriesQueryKeys.all, "filters"] as const,
  filterCounts: (filters: SeriesListParams) =>
    [...seriesQueryKeys.all, "filter-counts", filters] as const,
};

export function useSeriesList(filters: HomeFiltersState) {
  const params = homeFiltersToSeriesParams(filters);
  return useQuery({
    queryKey: seriesQueryKeys.list(params),
    queryFn: () => fetchSeriesList(params),
    staleTime: 30_000,
    enabled: filters.status !== "archive",
  });
}

export function useSeriesArchiveList(filters: HomeFiltersState) {
  const baseParams = homeFiltersToSeriesParams(filters);
  const { limit: _limit, offset: _offset, ...keyParams } = baseParams;
  return useInfiniteQuery({
    queryKey: seriesQueryKeys.listInfinite(keyParams),
    queryFn: ({ pageParam }) =>
      fetchSeriesList({
        ...keyParams,
        limit: HOME_ARCHIVE_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    staleTime: 30_000,
    enabled: filters.status === "archive",
  });
}

export function useSeriesFilterOptions() {
  return useQuery({
    queryKey: seriesQueryKeys.filterOptions(),
    queryFn: fetchScheduleFilters,
    staleTime: 60_000,
  });
}

export function useSeriesFilterCounts(filters: HomeFiltersState, enabled = true) {
  const params = homeFiltersToSeriesParams(filters);
  return useQuery({
    queryKey: seriesQueryKeys.filterCounts(params),
    queryFn: () => fetchSeriesFilterCounts(params),
    enabled,
    staleTime: 10_000,
  });
}

export function useSeries(id: string | undefined) {
  return useQuery({
    queryKey: seriesQueryKeys.detail(id ?? ""),
    queryFn: () => fetchSeriesDetail(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
  });
}

export function useSeriesSchedule(id: string | undefined, includeBlinds = false) {
  return useQuery({
    queryKey: seriesQueryKeys.schedule(id ?? "", includeBlinds),
    queryFn: () => fetchSeriesSchedule(id as string, { includeBlinds }),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: seriesQueryKeys.eventDetail(id ?? ""),
    queryFn: () => fetchEventDetail(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    // No retry: 404 must surface immediately; other errors use explicit refetch CTA.
    retry: false,
  });
}
