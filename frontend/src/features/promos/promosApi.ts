import { apiDelete, apiGet, apiPost, apiPostForm, apiPut } from "@/api/client";
import type { PokerApp } from "@/api/types/tournaments";

export type PromoKind = "leaderboard" | "freeroll" | "bonus" | "other";
export type PromoGame = "mtt" | "cash" | "any";
export type PromoRecurrence = "none" | "monthly";

export interface PromoPrize {
  place: number;
  amount: string | null;
  label: string | null;
}

export interface PromoWindow {
  start: string;
  end: string;
  multiplier: number;
}

/** Акция клуба единой плашкой (Иван, 30.09). Суммы — в деньгах, как на афише союза. */
export interface Promo {
  id: string;
  club: { id: string; name: string; app: PokerApp } | null;
  kind: PromoKind;
  title: string;
  prize_fund: string | null;
  prize_extra: string | null;
  currency_code: string | null;
  currency_symbol: string | null;
  starts_at: string | null;
  ends_at: string | null;
  recurrence: PromoRecurrence;
  game: PromoGame;
  buyin_min: string | null;
  buyin_max: string | null;
  prizes: PromoPrize[];
  boost_windows: PromoWindow[];
  image_url: string | null;
}

export interface PromoAdmin extends Promo {
  is_published: boolean;
  source_text: string | null;
  /** Поля, в которых разборщик не уверен, — подсвечены «проверить». */
  uncertain: string[];
  renewed_from_id: string | null;
  created_at: string;
}

export interface PromoPayload {
  club_id: string | null;
  kind: PromoKind;
  title: string;
  prize_fund: string | null;
  prize_extra: string | null;
  currency_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  recurrence: PromoRecurrence;
  game: PromoGame;
  buyin_min: string | null;
  buyin_max: string | null;
  prizes: { place: number; amount: string | null; label: string | null }[];
  boost_windows: { start: string; end: string; multiplier: number }[];
  uncertain: string[];
  is_published: boolean;
}

export const fetchPromos = () => apiGet<Promo[]>("/api/v1/promos");
export const fetchAdminPromos = () => apiGet<PromoAdmin[]>("/api/v1/admin/promos");
export const createPromo = (body: PromoPayload) =>
  apiPost<PromoAdmin>("/api/v1/admin/promos", body);
export const updatePromo = (id: string, body: PromoPayload) =>
  apiPut<PromoAdmin>(`/api/v1/admin/promos/${id}`, body);
export const deletePromo = (id: string) => apiDelete(`/api/v1/admin/promos/${id}`);
export const promoFromText = (text: string) =>
  apiPost<PromoAdmin>("/api/v1/admin/promos/from-text", { text });

export function promoFromImage(file: Blob, filename: string) {
  const form = new FormData();
  form.append("file", file, filename);
  return apiPostForm<PromoAdmin>("/api/v1/admin/promos/from-image", form);
}

export function uploadPromoImage(id: string, file: Blob, filename: string) {
  const form = new FormData();
  form.append("file", file, filename);
  return apiPostForm<PromoAdmin>(`/api/v1/admin/promos/${id}/image`, form);
}
