export type PokerApp = "pppoker" | "xpoker" | "poker21" | "other";
export type BountyKind = "none" | "ko" | "pko" | "mystery";
export type GameType = "nlh" | "plo" | "plo5" | "mixed" | "other";
export type DayPeriod = "day" | "evening" | "night";
export type ScheduleView = "cards" | "table";

export interface TournamentClub {
  id: string;
  name: string;
  slug: string;
  app: PokerApp;
  /** Курс: 1 фишка = chip_value в chip_currency_code. Суммы турнира — в фишках. */
  chip_value: string | null;
  chip_currency_code: string | null;
  /** Символ перед суммой; USDT приходит как «$». */
  currency_symbol: string | null;
}

export interface Tournament {
  id: string;
  name: string;
  game_type: GameType;
  bounty_kind: BountyKind;
  buyin: string;
  guarantee: string | null;
  rebuy_cost: string | null;
  rebuy_terms: string | null;
  addon_cost: string | null;
  addon_terms: string | null;
  start_stack: number | null;
  table_size: number | null;
  late_reg_levels: number | null;
  level_minutes: string | null;
  structure: string | null;
  ticket_value: string | null;
  early_bird_players: number | null;
  notes: string | null;
  club: TournamentClub;
  starts_at: string;
  late_reg_closes_at: string | null;
  status: "scheduled" | "cancelled";
  is_promoted: boolean;
  buyin_rub: string | null;
  guarantee_rub: string | null;
  has_addon: boolean;
}

export interface TournamentsParams {
  from?: string;
  to?: string;
  app?: PokerApp[];
  period?: DayPeriod[];
  buyin_rub_min?: number;
  buyin_rub_max?: number;
}
