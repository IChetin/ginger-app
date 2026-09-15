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
import type { ApiErrorBody } from "@/api/types/common";
import type {
  PushSubscribePayload,
  PushSubscription,
  PushUnsubscribePayload,
  VapidPublicKeyResponse,
} from "@/api/types/push";
import type { Tournament, TournamentsParams } from "@/api/types/tournaments";
import { APP_BUILD } from "@/lib/appBuild";
import { forceClientUpdate } from "@/lib/forceUpdate";

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
  if (APP_BUILD) {
    headers.set("X-Client-Build", APP_BUILD);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await parseError(response);
    // Сервер требует сборку новее — обновляемся, не дожидаясь проверки service worker.
    if (error.status === 426 && error.code === "client_outdated") {
      void forceClientUpdate();
    }
    throw error;
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
    const error = await parseError(response);
    // Сервер требует сборку новее — обновляемся, не дожидаясь проверки service worker.
    if (error.status === 426 && error.code === "client_outdated") {
      void forceClientUpdate();
    }
    throw error;
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

/** Ginger APP: расписание турниров клубов. Без from/to — ближайшие сутки. */
export function fetchTournaments(
  params: TournamentsParams,
  signal?: AbortSignal,
): Promise<Tournament[]> {
  return apiGet(`/api/v1/tournaments${buildQuery(params)}`, undefined, signal);
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
  if (body.invite_token) {
    payload.invite_token = body.invite_token;
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

export { apiDelete, apiGet, apiPatch, apiPost, apiPostForm, apiPut, buildQuery };
