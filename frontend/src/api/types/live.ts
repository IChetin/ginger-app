import type { CurrencyBrief } from "@/api/types/schedule";

export type LiveSessionStatus = "active" | "finished" | "cancelled";
export type LiveEventType = "entry" | "reentry" | "note";

export interface LiveEventRead {
  id: string;
  type: LiveEventType;
  amount: string | null;
  currency_code: string | null;
  text: string | null;
  occurred_at: string;
  created_at: string;
}

export interface LiveSessionRead {
  id: string;
  event_id: string | null;
  flight_id: string | null;
  manual_name: string | null;
  manual_venue: string | null;
  manual_buyin: string | null;
  manual_currency: string | null;
  started_at: string;
  finished_at: string | null;
  status: LiveSessionStatus;
  place: number | null;
  field_size: number | null;
  payout: string | null;
  result_id: string | null;
  display_name: string;
  display_series: string | null;
  buyin: string;
  currency: CurrencyBrief;
  reentry_allowed: boolean;
  events: LiveEventRead[];
  created_at: string;
  updated_at: string;
}

export interface LiveCandidateRead {
  event_id: string;
  flight_id: string;
  name: string;
  series_name: string;
  buyin: string;
  currency: CurrencyBrief;
  start_at: string;
  reentry_count: number | null;
  reentry_unlimited: boolean;
}

export interface LiveSessionCreatePayload {
  id: string;
  event_id?: string | null;
  flight_id?: string | null;
  manual_name?: string | null;
  manual_venue?: string | null;
  manual_buyin?: string | null;
  manual_currency?: string | null;
  started_at?: string | null;
}

export interface LiveEventCreateItem {
  id: string;
  type: LiveEventType;
  amount?: string | null;
  currency_code?: string | null;
  text?: string | null;
  occurred_at: string;
}

export interface LiveEventUpdatePayload {
  amount?: string | null;
  occurred_at?: string | null;
  text?: string | null;
}

export interface LiveSessionFinishPayload {
  in_the_money: boolean;
  place?: number | null;
  field_size?: number | null;
  payout: string;
}
