import { apiDelete, apiGet, apiPatch, apiPost } from "@/api/client";
import type {
  LiveCandidateRead,
  LiveEventCreateItem,
  LiveEventUpdatePayload,
  LiveSessionCreatePayload,
  LiveSessionFinishPayload,
  LiveSessionRead,
} from "@/api/types/live";

export function createLiveSession(body: LiveSessionCreatePayload): Promise<LiveSessionRead> {
  return apiPost("/api/v1/live-sessions", body);
}

export function fetchActiveLiveSession(): Promise<LiveSessionRead> {
  return apiGet("/api/v1/live-sessions/active");
}

export function fetchLiveCandidates(params?: {
  eventId?: string | null;
  flightId?: string | null;
}): Promise<LiveCandidateRead[]> {
  const query = new URLSearchParams();
  if (params?.eventId) query.set("event_id", params.eventId);
  if (params?.flightId) query.set("flight_id", params.flightId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiGet(`/api/v1/live-sessions/candidates${suffix}`);
}

export function postLiveEvents(
  sessionId: string,
  events: LiveEventCreateItem[],
): Promise<LiveSessionRead> {
  return apiPost(`/api/v1/live-sessions/${sessionId}/events`, { events });
}

export function patchLiveEvent(
  eventId: string,
  body: LiveEventUpdatePayload,
): Promise<LiveSessionRead> {
  return apiPatch(`/api/v1/live-events/${eventId}`, body);
}

export function deleteLiveEvent(eventId: string): Promise<LiveSessionRead> {
  return apiDelete<LiveSessionRead>(`/api/v1/live-events/${eventId}`, { allowEmpty: false });
}

export function finishLiveSession(
  sessionId: string,
  body: LiveSessionFinishPayload,
): Promise<LiveSessionRead> {
  return apiPost(`/api/v1/live-sessions/${sessionId}/finish`, body);
}

export function cancelLiveSession(sessionId: string): Promise<LiveSessionRead> {
  return apiPost(`/api/v1/live-sessions/${sessionId}/cancel`, {});
}
