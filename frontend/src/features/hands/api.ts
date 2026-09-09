import { apiDelete, apiGet, apiPatch, apiPost, buildQuery } from "@/api/client";
import type { PaginatedResponse } from "@/api/types/schedule";
import type {
  HandCreatePayload,
  HandDraftCreatePayload,
  HandDraftUpdatePayload,
  HandEventBrief,
  HandLinkTarget,
  HandListItem,
  HandPublishPayload,
  HandRead,
  HandsListParams,
  HandUpdatePayload,
} from "@/api/types/hands";

export function fetchHands(params: HandsListParams = {}): Promise<PaginatedResponse<HandListItem>> {
  return apiGet(`/api/v1/hands${buildQuery(params)}`);
}

export function fetchHand(ref: string): Promise<HandRead> {
  return apiGet(`/api/v1/hands/${ref}`);
}

export function createHand(body: HandCreatePayload): Promise<HandRead> {
  return apiPost("/api/v1/hands", body);
}

export function createHandDraft(body: HandDraftCreatePayload): Promise<HandRead> {
  return apiPost("/api/v1/hands/draft", body);
}

export function patchHandDraft(id: string, body: HandDraftUpdatePayload): Promise<HandRead> {
  return apiPatch(`/api/v1/hands/${id}`, body);
}

export function publishHand(id: string, body: HandPublishPayload): Promise<HandRead> {
  return apiPost(`/api/v1/hands/${id}/publish`, body);
}

export function updateHand(slug: string, body: HandUpdatePayload): Promise<HandRead> {
  return apiPatch(`/api/v1/hands/${slug}`, body);
}

export function deleteHand(ref: string): Promise<void> {
  return apiDelete(`/api/v1/hands/${ref}`);
}

export function fetchHandEvents(): Promise<HandEventBrief[]> {
  return apiGet("/api/v1/hands/events");
}

export function fetchHandLinkTargets(q?: string): Promise<HandLinkTarget[]> {
  return apiGet(`/api/v1/hands/link-targets${buildQuery({ q: q?.trim() || undefined })}`);
}

export function fetchOpponentNames(): Promise<string[]> {
  return apiGet("/api/v1/hands/opponent-names");
}
