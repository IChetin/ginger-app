import { apiDelete, apiGet, apiPatch, apiPost } from "@/api/client";
import type { CashTable } from "@/api/types/cash";
import type { Tournament } from "@/api/types/tournaments";

export type PickKind = "mtt" | "cash";

/** Пик глазами игрока: у MTT — ближайший старт, у CASH — открытые сейчас столы. */
export interface EditorPick {
  id: string;
  kind: PickKind;
  note: string | null;
  tournament: Tournament | null;
  tables: CashTable[];
}

export interface EditorPickAdmin {
  id: string;
  kind: PickKind;
  club_id: string;
  club_name: string;
  match: string;
  note: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  /** Сколько подходит сейчас: стартов за неделю или открытых столов; 0 — игроку не виден. */
  matched_now: number;
}

export interface EditorPickCreate {
  kind: PickKind;
  club_id: string;
  match: string;
  note: string | null;
}

const ADMIN = "/api/v1/admin/editor-picks";

// Запросы отдельно от компонентов: тесты подменяют модуль целиком.
export const fetchEditorPicks = (kind: PickKind, signal?: AbortSignal) =>
  apiGet<EditorPick[]>(`/api/v1/editor-picks?kind=${kind}`, undefined, signal);

export const fetchAdminPicks = () => apiGet<EditorPickAdmin[]>(ADMIN);
export const createPick = (body: EditorPickCreate) => apiPost<EditorPickAdmin[]>(ADMIN, body);
export const updatePick = (
  id: string,
  body: Partial<Pick<EditorPickAdmin, "is_active" | "note">>,
) => apiPatch<EditorPickAdmin[]>(`${ADMIN}/${id}`, body);
export const deletePick = (id: string) =>
  apiDelete<EditorPickAdmin[]>(`${ADMIN}/${id}`, { allowEmpty: false });
