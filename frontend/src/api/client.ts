import type {
  ChangePasswordPayload,
  LoginPasswordPayload,
  RegisterCompletePayload,
  RegisterStartPayload,
  RegisterVerifyPayload,
  RegisterVerifyResponse,
  RequestCodeResponse,
  SetPasswordPayload,
  UpdateMePayload,
  UserMe,
} from "@/api/types/auth";
import type { EventUpdatePayload, FlightUpsert, SeriesUpdatePayload } from "@/api/types/admin";
import type {
  Bookmark,
  BookmarkCreatePayload,
  BookmarkMigratePayload,
  BookmarkMigrateResponse,
  BookmarkOverviewItem,
  BookmarkTargetResolvePayload,
  BookmarkTargetResolveResponse,
  BookmarkUpdatePayload,
} from "@/api/types/bookmarks";
import type {
  NotificationHistoryItem,
  NotificationPreviewResponse,
} from "@/api/types/notifications";
import type {
  PushSubscribePayload,
  PushSubscription,
  PushUnsubscribePayload,
  VapidPublicKeyResponse,
} from "@/api/types/push";
import type {
  ApiErrorBody,
  CalendarParams,
  CalendarResponse,
  CurrencyBrief,
  EventDetail,
  ScheduleFilterCountsResponse,
  ScheduleFiltersResponse,
  SeriesDetail,
  SeriesListParams,
  SeriesListResponse,
  SeriesScheduleResponse,
} from "@/api/types/schedule";
import type { Tournament, TournamentsParams } from "@/api/types/tournaments";

export type ApiRequestHeaders = HeadersInit;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter: number | null;
  readonly attemptsLeft: number | null;
  readonly activeSessionId: string | null;
  readonly resultId: string | null;
  readonly server: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: {
      retryAfter?: number | null;
      attemptsLeft?: number | null;
      activeSessionId?: string | null;
      resultId?: string | null;
      server?: unknown;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = options?.retryAfter ?? null;
    this.attemptsLeft = options?.attemptsLeft ?? null;
    this.activeSessionId = options?.activeSessionId ?? null;
    this.resultId = options?.resultId ?? null;
    this.server = options?.server ?? null;
  }
}

type QueryValue = string | number | string[] | undefined;

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, QueryValue>)) {
    if (value === undefined || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) {
          search.append(key, item);
        }
      }
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function parseError(response: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Request failed with status ${response.status}`;
  let retryAfter: number | null = null;
  let attemptsLeft: number | null = null;
  let activeSessionId: string | null = null;
  let resultId: string | null = null;
  let server: unknown = null;
  try {
    const body = (await response.json()) as ApiErrorBody;
    code = body.error.code;
    message = body.error.message;
    if (typeof body.error.retry_after === "number") {
      retryAfter = body.error.retry_after;
    }
    if (typeof body.error.attempts_left === "number") {
      attemptsLeft = body.error.attempts_left;
    }
    if (typeof body.error.active_session_id === "string") {
      activeSessionId = body.error.active_session_id;
    }
    if (typeof body.error.result_id === "string") {
      resultId = body.error.result_id;
    }
    if (body.error.server !== undefined) {
      server = body.error.server;
    }
  } catch {
    // keep defaults
  }
  return new ApiError(response.status, code, message, {
    retryAfter,
    attemptsLeft,
    activeSessionId,
    resultId,
    server,
  });
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { allowEmpty?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (options.allowEmpty || response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

function withPreviewToken(
  headers?: ApiRequestHeaders,
  previewToken?: string,
  notify?: boolean,
): Headers {
  const next = new Headers(headers);
  if (previewToken) {
    next.set("X-Preview-Token", previewToken);
  }
  if (notify !== undefined) {
    next.set("X-Notify", notify ? "1" : "0");
  }
  return next;
}

async function apiGet<T>(
  path: string,
  headers?: ApiRequestHeaders,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(path, { headers, signal });
}

async function apiPost<T>(path: string, body?: unknown, headers?: ApiRequestHeaders): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
  });
}

async function apiPostForm<T>(
  path: string,
  formData: FormData,
  headers?: ApiRequestHeaders,
): Promise<T> {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", "application/json");
  }
  // Do not set Content-Type: browser must add multipart boundary.
  const response = await fetch(path, {
    method: "POST",
    body: formData,
    headers: requestHeaders,
    credentials: "include",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as T;
}

async function apiPatch<T>(path: string, body: unknown, headers?: ApiRequestHeaders): Promise<T> {
  return apiRequest<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers,
  });
}

async function apiPut<T>(path: string, body: unknown, headers?: ApiRequestHeaders): Promise<T> {
  return apiRequest<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
    headers,
  });
}

async function apiDelete<T = void>(
  path: string,
  options: { allowEmpty?: boolean } = {},
): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" }, { allowEmpty: options.allowEmpty ?? true });
}

export function fetchSeriesList(params: SeriesListParams = {}): Promise<SeriesListResponse> {
  return apiGet(`/api/v1/series${buildQuery(params)}`);
}

export function fetchSeriesDetail(seriesId: string): Promise<SeriesDetail> {
  return apiGet(`/api/v1/series/${seriesId}`);
}

export function fetchSeriesSchedule(
  seriesId: string,
  options: { includeBlinds?: boolean } = {},
): Promise<SeriesScheduleResponse> {
  return apiGet(
    `/api/v1/series/${seriesId}/schedule${buildQuery({
      include_blinds: options.includeBlinds ? "true" : undefined,
    })}`,
  );
}

export async function fetchSeriesSchedulePdf(
  seriesId: string,
  options: { signal?: AbortSignal } = {},
): Promise<{
  blob: Blob;
  filename: string;
}> {
  const response = await fetch(`/api/v1/series/${seriesId}/schedule.pdf`, {
    credentials: "include",
    headers: { Accept: "application/pdf" },
    signal: options.signal,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `Day2_series_${seriesId}.pdf`;
  const blob = await response.blob();
  return { blob, filename };
}

/** Справочник валют. Раньше жил в трекере (/results/currencies), нужен профилю для базовой валюты. */
export function fetchCurrencies(): Promise<CurrencyBrief[]> {
  return apiGet("/api/v1/currencies");
}

/** Ginger APP: расписание турниров клубов. Без from/to — ближайшие сутки. */
export function fetchTournaments(
  params: TournamentsParams,
  signal?: AbortSignal,
): Promise<Tournament[]> {
  return apiGet(`/api/v1/tournaments${buildQuery(params)}`, undefined, signal);
}

export function fetchEventDetail(eventId: string): Promise<EventDetail> {
  return apiGet(`/api/v1/events/${eventId}`);
}

export function fetchCalendar(params: CalendarParams): Promise<CalendarResponse> {
  return apiGet(`/api/v1/calendar${buildQuery(params)}`);
}

export function fetchScheduleFilters(): Promise<ScheduleFiltersResponse> {
  return apiGet("/api/v1/series/filters");
}

export function fetchSeriesFilterCounts(
  params: SeriesListParams = {},
): Promise<ScheduleFilterCountsResponse> {
  return apiGet(`/api/v1/series/filter-counts${buildQuery(params)}`);
}

export function requestAuthCode(
  email: string,
  captchaToken?: string,
): Promise<RequestCodeResponse> {
  const body: { email: string; captcha_token?: string } = { email };
  if (captchaToken) {
    body.captcha_token = captchaToken;
  }
  return apiPost("/api/v1/auth/request-code", body);
}

export function updateCurrentUser(body: UpdateMePayload): Promise<UserMe> {
  return apiPatch("/api/v1/auth/me", body);
}

export function verifyAuthCode(email: string, code: string): Promise<UserMe> {
  return apiPost("/api/v1/auth/verify", { email, code });
}

export function registerStart(body: RegisterStartPayload): Promise<RequestCodeResponse> {
  const payload: RegisterStartPayload = {
    email: body.email,
    privacy_consent: body.privacy_consent,
  };
  if (body.captcha_token) {
    payload.captcha_token = body.captcha_token;
  }
  return apiPost("/api/v1/auth/register/start", payload);
}

export function registerVerify(body: RegisterVerifyPayload): Promise<RegisterVerifyResponse> {
  return apiPost("/api/v1/auth/register/verify", body);
}

export function registerComplete(body: RegisterCompletePayload): Promise<UserMe> {
  return apiPost("/api/v1/auth/register/complete", body);
}

export function loginWithPassword(body: LoginPasswordPayload): Promise<UserMe> {
  return apiPost("/api/v1/auth/login", body);
}

export function setPassword(body: SetPasswordPayload): Promise<UserMe> {
  return apiPost("/api/v1/auth/set-password", body);
}

export function changePassword(body: ChangePasswordPayload): Promise<UserMe> {
  return apiPost("/api/v1/auth/change-password", body);
}

export function fetchCurrentUser(): Promise<UserMe> {
  return apiGet("/api/v1/auth/me");
}

export function logoutAuth(): Promise<{ ok: boolean }> {
  return apiPost("/api/v1/auth/logout");
}

export function fetchBookmarks(): Promise<Bookmark[]> {
  return apiGet("/api/v1/bookmarks");
}

export function fetchBookmarksOverview(): Promise<BookmarkOverviewItem[]> {
  return apiGet("/api/v1/bookmarks/overview");
}

export function resolveBookmarkTargets(
  body: BookmarkTargetResolvePayload,
): Promise<BookmarkTargetResolveResponse> {
  return apiPost("/api/v1/bookmarks/resolve-targets", body);
}

export function createBookmark(body: BookmarkCreatePayload): Promise<Bookmark> {
  return apiPost("/api/v1/bookmarks", body);
}

export function updateBookmark(bookmarkId: string, body: BookmarkUpdatePayload): Promise<Bookmark> {
  return apiPatch(`/api/v1/bookmarks/${bookmarkId}`, body);
}

export function deleteBookmark(bookmarkId: string): Promise<void> {
  return apiDelete(`/api/v1/bookmarks/${bookmarkId}`);
}

export function migrateBookmarks(body: BookmarkMigratePayload): Promise<BookmarkMigrateResponse> {
  return apiPost("/api/v1/bookmarks/migrate", body);
}

export function fetchNotificationHistory(days = 30): Promise<NotificationHistoryItem[]> {
  return apiGet(`/api/v1/notifications/history${buildQuery({ days })}`);
}

export function previewAdminSeries(
  seriesId: string,
  body: SeriesUpdatePayload,
): Promise<NotificationPreviewResponse> {
  return apiPost(`/api/v1/admin/series/${seriesId}/preview`, body);
}

export function previewAdminEvent(
  eventId: string,
  body: EventUpdatePayload,
): Promise<NotificationPreviewResponse> {
  return apiPost(`/api/v1/admin/events/${eventId}/preview`, body);
}

export function previewAdminFlights(
  eventId: string,
  items: FlightUpsert[],
): Promise<NotificationPreviewResponse> {
  return apiPost(`/api/v1/admin/events/${eventId}/flights/preview`, items);
}

export function fetchVapidPublicKey(): Promise<VapidPublicKeyResponse> {
  return apiGet("/api/v1/push/vapid-public-key");
}

export function subscribePush(body: PushSubscribePayload): Promise<PushSubscription> {
  return apiPost("/api/v1/push/subscribe", body);
}

export function unsubscribePush(body: PushUnsubscribePayload): Promise<void> {
  return apiRequest<void>(
    "/api/v1/push/subscribe",
    {
      method: "DELETE",
      body: JSON.stringify(body),
    },
    { allowEmpty: true },
  );
}

export { apiDelete, apiGet, apiPatch, apiPost, apiPostForm, apiPut, buildQuery, withPreviewToken };
