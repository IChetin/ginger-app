import { apiGet, apiPatch, apiPost, apiPostForm } from "@/api/client";
import type {
  ChipRequest,
  ChipRequestCreatePayload,
  InviteCheck,
  PlayerAccount,
  PlayerAccountCreatePayload,
  PlayerMe,
  PublicClub,
  ReferralRead,
} from "@/api/types/chips";

export function fetchPlayerMe(): Promise<PlayerMe> {
  return apiGet("/api/v1/me/player");
}

export function updatePlayerMe(body: {
  results_consent?: boolean;
  birthday?: string | null;
}): Promise<PlayerMe> {
  return apiPatch("/api/v1/me/player", body);
}

export function fetchChipRequests(): Promise<ChipRequest[]> {
  return apiGet("/api/v1/me/chip-requests");
}

export function fetchChipRequest(id: string): Promise<ChipRequest> {
  return apiGet(`/api/v1/me/chip-requests/${id}`);
}

export function createChipRequest(body: ChipRequestCreatePayload): Promise<ChipRequest> {
  return apiPost("/api/v1/me/chip-requests", body);
}

export function uploadScreenshot(id: string, file: Blob, filename: string): Promise<ChipRequest> {
  const form = new FormData();
  form.append("file", file, filename);
  return apiPostForm(`/api/v1/me/chip-requests/${id}/screenshot`, form);
}

export function screenshotUrl(id: string): string {
  return `/api/v1/me/chip-requests/${id}/screenshot`;
}

export function addPlayerAccount(body: PlayerAccountCreatePayload): Promise<PlayerAccount> {
  return apiPost("/api/v1/me/accounts", body);
}

export function fetchPublicClubs(): Promise<PublicClub[]> {
  return apiGet("/api/v1/clubs");
}

export function checkInvite(token: string): Promise<InviteCheck> {
  return apiGet(`/api/v1/invites/${encodeURIComponent(token)}`);
}

export function fetchReferral(): Promise<ReferralRead> {
  return apiGet("/api/v1/me/referral");
}

export function rotateReferral(): Promise<ReferralRead> {
  return apiPost("/api/v1/me/referral/rotate");
}
