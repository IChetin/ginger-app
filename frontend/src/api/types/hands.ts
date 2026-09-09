export type StreetName = "preflop" | "flop" | "turn" | "river";
export type HandActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";
export type PositionName = "BTN" | "SB" | "BB" | "UTG" | "+1" | "+2" | "MP" | "HJ" | "CO";

export type HandStatus = "draft" | "published";
export type HandListStatus = "all" | "draft" | "published";
export type AnteMode = "bb" | "occupied";

export interface HandBlinds {
  sb: number;
  bb: number;
  ante: number;
  /** `bb` — одно анте с BB; `occupied` — с каждого сидящего. Нет поля — легаси table_size × ante. */
  ante_mode?: AnteMode;
}

export interface HandSeat {
  seat: number;
  position: PositionName;
  name: string;
  stack: number;
  is_hero?: boolean;
  cards?: string[];
}

export interface HandAction {
  seat: number;
  action: HandActionType;
  amount?: number | null;
}

export interface HandStreet {
  street: StreetName;
  board: string[];
  actions: HandAction[];
}

export interface HandResult {
  winner_seats: number[];
  pot: number;
  hero_invested: number;
  hero_profit: number;
  side_pots: null;
}

export interface HandData {
  schema_version: 1;
  table_size: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  blinds: HandBlinds;
  hero_seat: number;
  button_seat: number;
  seats: HandSeat[];
  streets: HandStreet[];
  result: HandResult;
}

export interface HandPreview {
  hero_cards: string[];
  board: string[];
  hero_profit: number;
  pot: number;
}

export interface HandEventBrief {
  id: string;
  name: string;
  series_name: string;
}

export interface HandSeriesBrief {
  id: string;
  name: string;
}

export interface HandAuthor {
  nickname: string;
}

export interface HandListItem {
  id: string;
  slug: string;
  status: HandStatus;
  current_step: number | null;
  current_street: StreetName | null;
  title: string | null;
  note: string | null;
  is_public: boolean;
  views_count: number;
  created_at: string;
  updated_at: string;
  preview: HandPreview;
  event: HandEventBrief | null;
  series?: HandSeriesBrief | null;
}

export interface HandRead {
  id: string;
  slug: string;
  status: HandStatus;
  current_step: number | null;
  current_street: StreetName | null;
  title: string | null;
  note: string | null;
  is_public: boolean;
  views_count: number;
  created_at: string;
  updated_at: string;
  event_id: string | null;
  series_id: string | null;
  live_session_id: string | null;
  event: HandEventBrief | null;
  series: HandSeriesBrief | null;
  author: HandAuthor;
  is_owner: boolean;
  data: HandData | null;
  wizard: Record<string, unknown> | null;
}

export interface HandDraftCreatePayload {
  id: string;
  current_step?: number;
  event_id?: string | null;
  series_id?: string | null;
  live_session_id?: string | null;
  title?: string | null;
  note?: string | null;
  wizard?: Record<string, unknown> | null;
  slug?: string | null;
}

export interface HandDraftUpdatePayload {
  current_step?: number;
  event_id?: string | null;
  series_id?: string | null;
  live_session_id?: string | null;
  title?: string | null;
  note?: string | null;
  wizard?: Record<string, unknown> | null;
  clear_event?: boolean;
  clear_series?: boolean;
  clear_live_session?: boolean;
  base_updated_at?: string | null;
}

export interface HandPublishPayload {
  event_id?: string | null;
  series_id?: string | null;
  live_session_id?: string | null;
  is_public?: boolean;
  title?: string | null;
  note?: string | null;
  data: HandData;
  clear_event?: boolean;
  clear_series?: boolean;
  clear_live_session?: boolean;
}

export interface HandCreatePayload {
  event_id?: string | null;
  series_id?: string | null;
  live_session_id?: string | null;
  is_public?: boolean;
  title?: string | null;
  note?: string | null;
  data: HandData;
}

export interface HandUpdatePayload {
  event_id?: string | null;
  series_id?: string | null;
  live_session_id?: string | null;
  is_public?: boolean | null;
  title?: string | null;
  note?: string | null;
  data?: HandData | null;
  clear_event?: boolean;
  clear_series?: boolean;
  clear_live_session?: boolean;
}

export interface HandLinkTarget {
  kind: "live" | "event" | "series";
  section: "live" | "today" | "running" | "search";
  event_id: string | null;
  series_id: string | null;
  live_session_id: string | null;
  label: string;
  series_name: string | null;
}

export interface HandsListParams {
  q?: string;
  event_id?: string;
  status?: HandListStatus;
  limit?: number;
  offset?: number;
}
