import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPostForm,
  apiPut,
  buildQuery,
  previewAdminEvent,
  previewAdminFlights,
  previewAdminSeries,
  withPreviewToken,
} from "@/api/client";
import type {
  AdminDashboard,
  AdminUser,
  AdminUserRoleUpdatePayload,
  BlindLevelAdmin,
  ChangeLogAdmin,
  ChangeLogListParams,
  EventAdmin,
  EventCreatePayload,
  EventUpdatePayload,
  FlightAdmin,
  FlightUpsert,
  BlindLevelUpsert,
  OrganizerAdmin,
  OrganizerCreatePayload,
  OrganizerUpdatePayload,
  PaginatedResponse,
  ParserInfo,
  ParserProfileUpdatePayload,
  SeriesAdmin,
  SeriesCreatePayload,
  SeriesUpdatePayload,
  VenueAdmin,
  VenueCreatePayload,
  VenueUpdatePayload,
} from "@/api/types/admin";
import type { SeriesStatus } from "@/api/types/schedule";
import type { UserRole } from "@/api/types/auth";

export { previewAdminEvent, previewAdminFlights, previewAdminSeries };

const ADMIN_PREFIX = "/api/v1/admin";

export interface AdminListParams {
  limit?: number;
  offset?: number;
  search?: string;
  country_code?: string;
}

export interface AdminUsersListParams extends AdminListParams {
  search?: string;
  role?: UserRole;
}

export interface AdminSeriesListParams extends AdminListParams {
  search?: string;
  status?: SeriesStatus;
  country_code?: string;
  organizer_id?: string;
  empty_events?: boolean;
  stale?: boolean;
}

export function fetchAdminVenues(
  params: AdminListParams = {},
): Promise<PaginatedResponse<VenueAdmin>> {
  return apiGet(`${ADMIN_PREFIX}/venues${buildQuery(params)}`);
}

export function createAdminVenue(body: VenueCreatePayload): Promise<VenueAdmin> {
  return apiPost(`${ADMIN_PREFIX}/venues`, body);
}

export function updateAdminVenue(id: string, body: VenueUpdatePayload): Promise<VenueAdmin> {
  return apiPatch(`${ADMIN_PREFIX}/venues/${id}`, body);
}

export function deleteAdminVenue(id: string): Promise<void> {
  return apiDelete(`${ADMIN_PREFIX}/venues/${id}`);
}

export function fetchAdminOrganizers(
  params: AdminListParams = {},
): Promise<PaginatedResponse<OrganizerAdmin>> {
  return apiGet(`${ADMIN_PREFIX}/organizers${buildQuery(params)}`);
}

export function createAdminOrganizer(body: OrganizerCreatePayload): Promise<OrganizerAdmin> {
  return apiPost(`${ADMIN_PREFIX}/organizers`, body);
}

export function updateAdminOrganizer(
  id: string,
  body: OrganizerUpdatePayload,
): Promise<OrganizerAdmin> {
  return apiPatch(`${ADMIN_PREFIX}/organizers/${id}`, body);
}

export function deleteAdminOrganizer(id: string): Promise<void> {
  return apiDelete(`${ADMIN_PREFIX}/organizers/${id}`);
}

export function uploadAdminOrganizerLogo(id: string, file: File): Promise<OrganizerAdmin> {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostForm(`${ADMIN_PREFIX}/organizers/${id}/logo`, formData);
}

export function deleteAdminOrganizerLogo(id: string): Promise<void> {
  return apiDelete(`${ADMIN_PREFIX}/organizers/${id}/logo`);
}

export function fetchAdminSeries(
  params: AdminSeriesListParams = {},
): Promise<PaginatedResponse<SeriesAdmin>> {
  return apiGet(`${ADMIN_PREFIX}/series${buildQuery(params)}`);
}

export function createAdminSeries(body: SeriesCreatePayload): Promise<SeriesAdmin> {
  return apiPost(`${ADMIN_PREFIX}/series`, body);
}

export function fetchAdminSeriesDetail(seriesId: string): Promise<SeriesAdmin> {
  return apiGet(`${ADMIN_PREFIX}/series/${seriesId}`);
}

export function updateAdminSeries(
  seriesId: string,
  body: SeriesUpdatePayload,
  previewToken?: string,
  notify?: boolean,
): Promise<SeriesAdmin> {
  return apiPatch(
    `${ADMIN_PREFIX}/series/${seriesId}`,
    body,
    withPreviewToken(undefined, previewToken, notify),
  );
}

export function deleteAdminSeries(seriesId: string): Promise<void> {
  return apiDelete(`${ADMIN_PREFIX}/series/${seriesId}`);
}

export function fetchAdminSeriesEvents(seriesId: string): Promise<EventAdmin[]> {
  return apiGet(`${ADMIN_PREFIX}/series/${seriesId}/events`);
}

export function fetchAdminSeriesChanges(
  seriesId: string,
  params: { limit?: number } = {},
): Promise<ChangeLogAdmin[]> {
  return apiGet(`${ADMIN_PREFIX}/series/${seriesId}/changes${buildQuery(params)}`);
}

export function createAdminSeriesEvent(
  seriesId: string,
  body: EventCreatePayload,
): Promise<EventAdmin> {
  return apiPost(`${ADMIN_PREFIX}/series/${seriesId}/events`, body);
}

export function fetchAdminEvent(eventId: string): Promise<EventAdmin> {
  return apiGet(`${ADMIN_PREFIX}/events/${eventId}`);
}

export function fetchAdminEventChanges(
  eventId: string,
  params: { limit?: number } = {},
): Promise<ChangeLogAdmin[]> {
  return apiGet(`${ADMIN_PREFIX}/events/${eventId}/changes${buildQuery(params)}`);
}

export function duplicateAdminEvent(eventId: string): Promise<EventAdmin> {
  return apiPost(`${ADMIN_PREFIX}/events/${eventId}/duplicate`);
}

export function updateAdminEvent(
  eventId: string,
  body: EventUpdatePayload,
  previewToken?: string,
  notify?: boolean,
): Promise<EventAdmin> {
  return apiPatch(
    `${ADMIN_PREFIX}/events/${eventId}`,
    body,
    withPreviewToken(undefined, previewToken, notify),
  );
}

export function deleteAdminEvent(eventId: string): Promise<void> {
  return apiDelete(`${ADMIN_PREFIX}/events/${eventId}`);
}

export function replaceAdminEventFlights(
  eventId: string,
  items: FlightUpsert[],
  previewToken?: string,
  notify?: boolean,
): Promise<FlightAdmin[]> {
  return apiPut(
    `${ADMIN_PREFIX}/events/${eventId}/flights`,
    items,
    withPreviewToken(undefined, previewToken, notify),
  );
}

export function replaceAdminEventBlindLevels(
  eventId: string,
  items: BlindLevelUpsert[],
): Promise<BlindLevelAdmin[]> {
  return apiPut(`${ADMIN_PREFIX}/events/${eventId}/blind-levels`, items);
}

export function fetchAdminUsers(
  params: AdminUsersListParams = {},
): Promise<PaginatedResponse<AdminUser>> {
  return apiGet(`${ADMIN_PREFIX}/users${buildQuery(params)}`);
}

export function updateAdminUserRole(
  id: string,
  body: AdminUserRoleUpdatePayload,
): Promise<AdminUser> {
  return apiPatch(`${ADMIN_PREFIX}/users/${id}/role`, body);
}

export function fetchAdminParsers(): Promise<ParserInfo[]> {
  return apiGet(`${ADMIN_PREFIX}/parsers`);
}

export function fetchAdminParser(id: string): Promise<ParserInfo> {
  return apiGet(`${ADMIN_PREFIX}/parsers/${id}`);
}

export function updateAdminParser(
  id: string,
  body: ParserProfileUpdatePayload,
): Promise<ParserInfo> {
  return apiPatch(`${ADMIN_PREFIX}/parsers/${id}`, body);
}

export function fetchAdminChangeLog(
  params: ChangeLogListParams = {},
): Promise<PaginatedResponse<ChangeLogAdmin>> {
  return apiGet(`${ADMIN_PREFIX}/change-log${buildQuery(params)}`);
}

export function fetchAdminDashboard(): Promise<AdminDashboard> {
  return apiGet(`${ADMIN_PREFIX}/dashboard`);
}
