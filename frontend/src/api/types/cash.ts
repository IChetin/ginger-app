import type { GameType, TournamentClub } from "@/api/types/tournaments";

/** Кэш-лимит в клубе: игра, блайнды и сколько столов открыто. Суммы — в фишках клуба. */
export interface CashGame {
  id: string;
  club: TournamentClub;
  game_type: GameType;
  small_blind: string;
  big_blind: string;
  tables: number;
  /** Диплинк на один из столов лимита — только у PPPoker. */
  app_link: string | null;
  /** Когда сборщик видел лимит последний раз. */
  seen_at: string;
  /** Большой блайнд в рублях по курсу клуба — для фильтра ставок. */
  big_blind_rub: string | null;
  is_editor_pick: boolean;
  editor_pick_note: string | null;
  /** Ручной Editor's Pick без данных сборщика: столов не знаем (24.09). */
  manual?: boolean;
}
