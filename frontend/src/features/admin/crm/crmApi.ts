import { apiGet, apiPost } from "@/api/client";
import type { ChipRequestKind, ChipRequestStatus, PlayerKind } from "@/api/types/chips";
import type { PlayerAdmin } from "@/features/admin/chips/api";

const ADMIN = "/api/v1/admin";

export interface RequestBrief {
  id: string;
  kind: ChipRequestKind;
  status: ChipRequestStatus;
  summary: string;
  created_at: string;
}

export interface ThreadBrief {
  id: string;
  subject: string;
  status: "open" | "answered" | "closed";
  last_message_at: string;
}

/** Карточка человека (ТЗ §9а.3): всё из списка плюс история и связи. */
export interface PlayerCrmCard extends PlayerAdmin {
  referrer_nickname: string | null;
  invited_players: number;
  completed_topups: number;
  requests: RequestBrief[];
  threads: ThreadBrief[];
}

export interface BirthdayItem {
  player_id: string;
  nickname: string;
  real_name: string | null;
  birthday: string;
  days: number;
}

export interface CrmSummary {
  birthdays: BirthdayItem[];
  sleeping: number;
  active_7d: number;
  new_7d: number;
  total_active: number;
}

export type SegmentKind = "all" | "sleeping" | "tag" | "player_kind" | "players";

export interface BroadcastSegment {
  kind: SegmentKind;
  tag?: string | null;
  player_kind?: PlayerKind | null;
  player_ids?: string[];
}

export interface BroadcastPreview {
  recipients: number;
  with_push: number;
}

export interface BroadcastCreate {
  title: string;
  body: string;
  url: string;
  segment: BroadcastSegment;
}

export interface BroadcastRead extends BroadcastCreate {
  id: string;
  recipients: number;
  pushes: number;
  author_nickname: string | null;
  created_at: string;
}

// Запросы отдельно от хуков: тесты подменяют модуль целиком.
export const fetchPlayerCard = (id: string) => apiGet<PlayerCrmCard>(`${ADMIN}/players/${id}`);
export const fetchCrmSummary = () => apiGet<CrmSummary>(`${ADMIN}/crm/summary`);
export const previewBroadcast = (segment: BroadcastSegment) =>
  apiPost<BroadcastPreview>(`${ADMIN}/broadcasts/preview`, segment);
export const sendBroadcast = (body: BroadcastCreate) =>
  apiPost<BroadcastRead>(`${ADMIN}/broadcasts`, body);
export const fetchBroadcasts = () => apiGet<BroadcastRead[]>(`${ADMIN}/broadcasts`);

export const PLAYERS_EXPORT_URL = `${ADMIN}/players/export.csv`;
