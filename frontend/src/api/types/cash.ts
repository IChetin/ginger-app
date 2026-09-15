import type { GameType, TournamentClub } from "@/api/types/tournaments";

/** Кэш-стол, как его видел сборщик в лобби. Суммы — в фишках клуба. */
export interface CashTable {
  id: string;
  club: TournamentClub;
  name: string;
  game_type: GameType;
  small_blind: string;
  big_blind: string;
  ante: string | null;
  table_size: number | null;
  seated: number | null;
  waiting: number | null;
  min_buyin: string | null;
  max_buyin: string | null;
  /** Диплинк на стол — только у PPPoker. */
  app_link: string | null;
  /** Когда сборщик видел стол последний раз. */
  seen_at: string;
  /** Большой блайнд в рублях по курсу клуба — для фильтра ставок. */
  big_blind_rub: string | null;
}
