import type { PokerApp } from "@/api/types/tournaments";

export type PlayerKind = "credit" | "deposit";
export type PlayerStatus = "active" | "blocked" | "archived";
export type PlayerAccountStatus = "pending" | "confirmed" | "rejected";
export type ChipRequestKind = "topup" | "withdrawal";
export type ChipRequestStatus =
  "sent" | "accepted" | "awaiting_payment" | "paid" | "completed" | "rejected" | "expired";

export interface AccountClub {
  id: string;
  name: string;
  slug: string;
  app: PokerApp;
  chip_value: string | null;
  chip_currency_code: string | null;
  currency_symbol: string | null;
}

export interface PlayerAccount {
  id: string;
  club: AccountClub;
  nickname: string;
  app_account_id: string;
  status: PlayerAccountStatus;
  created_at: string;
}

export interface PlayerMe {
  id: string;
  kind: PlayerKind;
  status: PlayerStatus;
  offline_access: boolean;
  results_consent: boolean;
  birthday: string | null;
  accounts: PlayerAccount[];
  /** Касса 12:00–03:00 МСК. Заявку можно оставить всегда — это только подпись. */
  cashdesk_open: boolean;
  cashdesk_hours: string;
}

export interface MoneyTotal {
  currency_code: string;
  currency_symbol: string | null;
  amount: string;
}

export interface ChipRequestItem {
  id: string;
  account_id: string;
  account_nickname: string;
  account_app_id: string;
  club: AccountClub;
  amount: string;
  chip_value: string | null;
  chip_currency_code: string | null;
  money_amount: string | null;
}

export interface ChipRequest {
  id: string;
  kind: ChipRequestKind;
  status: ChipRequestStatus;
  items: ChipRequestItem[];
  totals: MoneyTotal[];
  payment_requisites: string | null;
  payment_deadline_at: string | null;
  has_screenshot: boolean;
  withdrawal_requisites: string | null;
  reject_comment: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ChipRequestCreatePayload {
  kind: ChipRequestKind;
  items: { account_id: string; amount: string }[];
  withdrawal_requisites?: string;
}

export interface PlayerAccountCreatePayload {
  club_id: string;
  nickname: string;
  app_account_id: string;
}

export interface PublicClub {
  id: string;
  name: string;
  slug: string;
  app: PokerApp;
  app_club_id: string | null;
  chip_value: string | null;
  chip_currency_code: string | null;
  download_url: string | null;
  join_steps: string | null;
}

export interface InviteCheck {
  valid: boolean;
  reason: string | null;
  /** Для личной ссылки игрока: «Вас пригласил …». */
  referrer_nickname?: string | null;
}

/** Личная многоразовая ссылка «Пригласить» (вопрос 11.8). */
export interface ReferralRead {
  code: string;
  path: string;
  invited_total: number;
  registrations_24h: number;
  daily_limit: number;
  paused: boolean;
}
