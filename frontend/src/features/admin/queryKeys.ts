import type { ChangeLogListParams } from "@/api/types/admin";
import type {
  AdminListParams,
  AdminSeriesListParams,
  AdminUsersListParams,
} from "@/features/admin/api";

export const adminKeys = {
  all: ["admin"] as const,
  venues: (params: AdminListParams = {}) => [...adminKeys.all, "venues", params] as const,
  organizers: (params: AdminListParams = {}) => [...adminKeys.all, "organizers", params] as const,
  parsers: () => [...adminKeys.all, "parsers"] as const,
  dashboard: () => [...adminKeys.all, "dashboard"] as const,
  changeLog: (params: ChangeLogListParams = {}) =>
    [...adminKeys.all, "change-log", params] as const,
  series: (params: AdminSeriesListParams = {}) => [...adminKeys.all, "series", params] as const,
  seriesDetail: (seriesId: string) => [...adminKeys.all, "series-detail", seriesId] as const,
  seriesEvents: (seriesId: string) => [...adminKeys.all, "series-events", seriesId] as const,
  seriesChanges: (seriesId: string, limit = 20) =>
    [...adminKeys.all, "series-changes", seriesId, limit] as const,
  event: (eventId: string) => [...adminKeys.all, "event", eventId] as const,
  eventChanges: (eventId: string, limit = 50) =>
    [...adminKeys.all, "event-changes", eventId, limit] as const,
  users: (params: AdminUsersListParams = {}) => [...adminKeys.all, "users", params] as const,
};
