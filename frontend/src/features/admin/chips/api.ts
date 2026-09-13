import { apiGet, apiPatch, apiPost } from "@/api/client";
import type {
  ChipRequest,
  ChipRequestStatus,
  PlayerAccount,
  PlayerKind,
  PlayerStatus,
} from "@/api/types/chips";

const ADMIN = "/api/v1/admin";

export interface ChipRequestEvent {
  from_status: ChipRequestStatus | null;
  to_status: ChipRequestStatus;
  comment: string | null;
  actor_nickname: string | null;
  created_at: string;
}

export interface ChipRequestAdmin extends ChipRequest {
  player: { id: string; nickname: string; email: string; kind: PlayerKind; status: PlayerStatus };
  handled_by_nickname: string | null;
  events: ChipRequestEvent[];
}

export interface RequisiteTemplate {
  id: string;
  title: string;
  body: string;
  is_active: boolean;
  sort_order: number;
}

export interface PlayerAdmin {
  id: string;
  user_id: string;
  nickname: string;
  email: string;
  kind: PlayerKind;
  status: PlayerStatus;
  offline_access: boolean;
  results_consent: boolean;
  birthday: string | null;
  notes: string | null;
  referrer_player_id: string | null;
  accounts: PlayerAccount[];
  created_at: string;
}

export interface PendingAccount extends PlayerAccount {
  player_id: string;
  player_nickname: string;
}

export interface Invite {
  id: string;
  player_kind: PlayerKind;
  note: string | null;
  state: "active" | "used" | "expired" | "revoked";
  expires_at: string;
  used_at: string | null;
  used_by_nickname: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface InviteCreated extends Invite {
  token: string;
  path: string;
}

export type RequestScope = "open" | "all";

export const fetchAdminChipRequests = (scope: RequestScope): Promise<ChipRequestAdmin[]> =>
  apiGet(`${ADMIN}/chip-requests?scope=${scope}`);

export const fetchAdminChipRequest = (id: string): Promise<ChipRequestAdmin> =>
  apiGet(`${ADMIN}/chip-requests/${id}`);

export const adminScreenshotUrl = (id: string): string => `${ADMIN}/chip-requests/${id}/screenshot`;

export const acceptChipRequest = (id: string): Promise<ChipRequestAdmin> =>
  apiPost(`${ADMIN}/chip-requests/${id}/accept`);

export const sendRequisites = (
  id: string,
  body: { template_id?: string; text?: string },
): Promise<ChipRequestAdmin> => apiPost(`${ADMIN}/chip-requests/${id}/requisites`, body);

export const completeChipRequest = (id: string): Promise<ChipRequestAdmin> =>
  apiPost(`${ADMIN}/chip-requests/${id}/complete`);

export const rejectChipRequest = (id: string, comment: string): Promise<ChipRequestAdmin> =>
  apiPost(`${ADMIN}/chip-requests/${id}/reject`, { comment });

export const fetchRequisiteTemplates = (): Promise<RequisiteTemplate[]> =>
  apiGet(`${ADMIN}/requisite-templates`);

export const createRequisiteTemplate = (body: {
  title: string;
  body: string;
}): Promise<RequisiteTemplate> => apiPost(`${ADMIN}/requisite-templates`, body);

export const updateRequisiteTemplate = (
  id: string,
  body: Partial<Pick<RequisiteTemplate, "title" | "body" | "is_active" | "sort_order">>,
): Promise<RequisiteTemplate> => apiPatch(`${ADMIN}/requisite-templates/${id}`, body);

export const fetchAdminPlayers = (): Promise<PlayerAdmin[]> => apiGet(`${ADMIN}/players`);

export const updateAdminPlayer = (
  id: string,
  body: Partial<Pick<PlayerAdmin, "kind" | "status" | "offline_access" | "notes">>,
): Promise<PlayerAdmin> => apiPatch(`${ADMIN}/players/${id}`, body);

export const fetchPendingAccounts = (): Promise<PendingAccount[]> =>
  apiGet(`${ADMIN}/player-accounts/pending`);

export const reviewAccount = (id: string, approve: boolean): Promise<PendingAccount> =>
  apiPost(`${ADMIN}/player-accounts/${id}/${approve ? "confirm" : "reject"}`);

export const fetchInvites = (): Promise<Invite[]> => apiGet(`${ADMIN}/invites`);

export const createInvite = (body: {
  player_kind: PlayerKind;
  note?: string;
}): Promise<InviteCreated> => apiPost(`${ADMIN}/invites`, body);

export const revokeInvite = (id: string): Promise<Invite> =>
  apiPost(`${ADMIN}/invites/${id}/revoke`);
