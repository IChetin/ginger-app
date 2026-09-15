import { apiDelete, apiGet, apiPatch, apiPost } from "@/api/client";
import type { GameType } from "@/api/types/tournaments";

export type PickKind = "mtt" | "cash";

export interface EditorPickAdmin {
  id: string;
  kind: PickKind;
  club_id: string;
  club_name: string;
  /** MTT: часть названия турнира. */
  match: string | null;
  /** CASH: игра и большой блайнд в фишках клуба (пусто — все лимиты игры). */
  game_type: GameType | null;
  big_blind: string | null;
  note: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  /** MTT — стартов за неделю, CASH — открытых столов; 0 — в фильтре пусто. */
  matched_now: number;
}

export interface EditorPickCreate {
  kind: PickKind;
  club_id: string;
  match?: string;
  game_type?: GameType;
  big_blind?: string;
  note: string | null;
}

const ADMIN = "/api/v1/admin/editor-picks";

// Запросы отдельно от страницы: тесты подменяют модуль целиком.
export const fetchAdminPicks = () => apiGet<EditorPickAdmin[]>(ADMIN);
export const createPick = (body: EditorPickCreate) => apiPost<EditorPickAdmin[]>(ADMIN, body);
export const updatePick = (id: string, body: { is_active?: boolean; note?: string | null }) =>
  apiPatch<EditorPickAdmin[]>(`${ADMIN}/${id}`, body);
export const deletePick = (id: string) =>
  apiDelete<EditorPickAdmin[]>(`${ADMIN}/${id}`, { allowEmpty: false });
