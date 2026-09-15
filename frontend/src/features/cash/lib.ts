import type { CashGame } from "@/api/types/cash";
import type { GameType } from "@/api/types/tournaments";

export type CashGameType = Extract<GameType, "nlh" | "plo" | "plo5">;
export type StakeTier = "low" | "mid" | "high";

export interface CashFilters {
  games: CashGameType[];
  stakes: StakeTier[];
  /** Только отобранное в Editor's Pick. */
  picked: boolean;
}

export const EMPTY_CASH_FILTERS: CashFilters = { games: [], stakes: [], picked: false };

export const GAME_LABELS: Record<GameType, string> = {
  nlh: "NLH",
  plo: "PLO",
  plo5: "PLO5",
  mixed: "Mixed",
  other: "Другое",
};

export const CASH_GAMES: CashGameType[] = ["nlh", "plo", "plo5"];

/** Ступени ставок — большой блайнд в рублях: одинаково для клубов в $ и в ₽. */
export const STAKE_TIERS: { value: StakeTier; label: string }[] = [
  { value: "low", label: "ББ до 25 ₽" },
  { value: "mid", label: "25–100 ₽" },
  { value: "high", label: "от 100 ₽" },
];

export function stakeTier(bigBlindRub: string | null): StakeTier | null {
  if (bigBlindRub === null) return null;
  const value = Number(bigBlindRub);
  if (value <= 25) return "low";
  if (value <= 100) return "mid";
  return "high";
}

export function applyCashFilters(games: CashGame[], filters: CashFilters): CashGame[] {
  return games.filter((game) => {
    if (filters.picked && !game.is_editor_pick) return false;
    if (filters.games.length > 0 && !filters.games.includes(game.game_type as CashGameType)) {
      return false;
    }
    if (filters.stakes.length === 0) return true;
    const tier = stakeTier(game.big_blind_rub);
    return tier !== null && filters.stakes.includes(tier);
  });
}

const GAME_ORDER: GameType[] = ["nlh", "plo", "plo5", "mixed", "other"];

/**
 * Группы по игре; внутри — от младших ставок к старшим, при равных — где больше столов:
 * игрок ищет свой лимит, а из двух клубов идёт туда, где игра шире.
 */
export function groupByGame(games: CashGame[]): [GameType, CashGame[]][] {
  const rub = (game: CashGame) =>
    game.big_blind_rub === null ? Number.POSITIVE_INFINITY : Number(game.big_blind_rub);
  const sorted = [...games].sort(
    (a, b) =>
      rub(a) - rub(b) || b.tables - a.tables || a.club.name.localeCompare(b.club.name, "ru"),
  );
  return GAME_ORDER.map(
    (game) => [game, sorted.filter((item) => item.game_type === game)] as [GameType, CashGame[]],
  ).filter(([, items]) => items.length > 0);
}

export function totalTables(games: CashGame[]): number {
  return games.reduce((sum, game) => sum + game.tables, 0);
}

const amountFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

/** «$0,1/0,2» — символ один раз впереди; без курса клуба — «0,5/1 фиш.». */
export function formatBlinds(game: Pick<CashGame, "small_blind" | "big_blind" | "club">): string {
  const { club } = game;
  const rate = club.chip_value === null ? null : Number(club.chip_value);
  const amount = (chips: string) => amountFormat.format(Number(chips) * (rate ?? 1));
  const pair = `${amount(game.small_blind)}/${amount(game.big_blind)}`;
  if (rate === null || club.currency_symbol === null) return `${pair} фиш.`;
  return `${club.currency_symbol}${pair}`;
}

/** Самое свежее обновление — «10 мин назад» в шапке. */
export function latestSeen(games: CashGame[]): Date | null {
  let latest: number | null = null;
  for (const game of games) {
    const at = new Date(game.seen_at).getTime();
    if (latest === null || at > latest) latest = at;
  }
  return latest === null ? null : new Date(latest);
}

export function minutesAgo(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  return minutes < 1 ? "только что" : `${minutes} мин назад`;
}
