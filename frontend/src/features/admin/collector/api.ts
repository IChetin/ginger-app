import { apiGet, apiPost } from "@/api/client";
import type { PokerApp } from "@/api/types/tournaments";

const ADMIN = "/api/v1/admin/collector";

export type CollectorRunKind = "mtt" | "cash";
export type CollectorRunStatus = "running" | "ok" | "failed";
export type TournamentChangeKind = "new" | "missing" | "changed";

export interface CollectorRun {
  id: string;
  kind: CollectorRunKind;
  app: PokerApp;
  status: CollectorRunStatus;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  stats: Record<string, unknown>;
}

export interface CollectorStatus {
  runs: CollectorRun[];
  pending_changes: number;
}

export interface TournamentChange {
  id: string;
  club_id: string;
  club_name: string;
  app: PokerApp;
  tournament_id: string | null;
  kind: TournamentChangeKind;
  status: "pending" | "applied" | "dismissed";
  starts_at: string;
  title: string;
  /** new — турнир из лобби; changed — {поле: {ours, lobby}}; missing — пусто. */
  payload: Record<string, unknown>;
  created_at: string;
}

// Запросы отдельно от страницы: тесты подменяют модуль целиком.
export const fetchCollectorStatus = () => apiGet<CollectorStatus>(`${ADMIN}/status`);
export const fetchTournamentChanges = () => apiGet<TournamentChange[]>(`${ADMIN}/changes`);
export const applyTournamentChange = (id: string) =>
  apiPost<TournamentChange>(`${ADMIN}/changes/${id}/apply`);
export const dismissTournamentChange = (id: string) =>
  apiPost<TournamentChange>(`${ADMIN}/changes/${id}/dismiss`);
