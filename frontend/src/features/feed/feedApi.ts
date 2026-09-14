import { apiDelete, apiGet, apiPost } from "@/api/client";
import type { PokerApp, Tournament } from "@/api/types/tournaments";

export interface WinItem {
  id: string;
  player_nickname: string;
  club: { id: string; name: string; app: PokerApp } | null;
  tournament_name: string;
  place: number | null;
  prize_amount: string;
  currency_code: string;
  currency_symbol: string | null;
  won_on: string;
}

/** Лента (этап 7): главное событие каждого дня, вечер в каждом клубе, выигрыши. */
export interface Feed {
  main_events: Tournament[];
  evening: Tournament[];
  wins: WinItem[];
}

export interface WinCreatePayload {
  player_nickname: string;
  club_id?: string | null;
  tournament_name: string;
  place?: number | null;
  prize_amount: string;
  currency_code: string;
  won_on?: string | null;
}

// Запросы отдельно от хуков: тесты подменяют модуль целиком.
export const fetchFeed = () => apiGet<Feed>("/api/v1/feed");
export const fetchAdminWins = () => apiGet<WinItem[]>("/api/v1/admin/wins");
export const createWin = (body: WinCreatePayload) => apiPost<WinItem>("/api/v1/admin/wins", body);
export const deleteWin = (id: string) => apiDelete(`/api/v1/admin/wins/${id}`);
