import type { CalendarParams, SeriesListParams } from "@/api/types/schedule";

export const scheduleKeys = {
  all: ["schedule"] as const,
  filters: () => [...scheduleKeys.all, "filters"] as const,
  seriesList: (params: SeriesListParams) => [...scheduleKeys.all, "series", params] as const,
  seriesDetail: (seriesId: string) => [...scheduleKeys.all, "series-detail", seriesId] as const,
  eventDetail: (eventId: string) => [...scheduleKeys.all, "event-detail", eventId] as const,
  calendar: (params: CalendarParams) => [...scheduleKeys.all, "calendar", params] as const,
};
