import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  fetchCalendar,
  fetchEventDetail,
  fetchScheduleFilters,
  fetchSeriesDetail,
  fetchSeriesList,
} from "@/api/client";
import type { CalendarParams, SeriesListParams } from "@/api/types/schedule";
import { scheduleKeys } from "@/features/schedule/api/queryKeys";

const PAGE_SIZE = 20;

export function seriesFiltersQueryOptions() {
  return queryOptions({
    queryKey: scheduleKeys.filters(),
    queryFn: fetchScheduleFilters,
    staleTime: 60_000,
  });
}

export function seriesInfiniteQueryOptions(params: Omit<SeriesListParams, "limit" | "offset">) {
  return infiniteQueryOptions({
    queryKey: scheduleKeys.seriesList(params),
    queryFn: ({ pageParam }) =>
      fetchSeriesList({
        ...params,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    staleTime: 30_000,
  });
}

export function seriesDetailQueryOptions(seriesId: string) {
  return queryOptions({
    queryKey: scheduleKeys.seriesDetail(seriesId),
    queryFn: () => fetchSeriesDetail(seriesId),
    staleTime: 30_000,
  });
}

export function eventDetailQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: scheduleKeys.eventDetail(eventId),
    queryFn: () => fetchEventDetail(eventId),
    staleTime: 30_000,
  });
}

export function calendarQueryOptions(params: CalendarParams) {
  return queryOptions({
    queryKey: scheduleKeys.calendar(params),
    queryFn: () => fetchCalendar(params),
    staleTime: 30_000,
  });
}

export { PAGE_SIZE };
