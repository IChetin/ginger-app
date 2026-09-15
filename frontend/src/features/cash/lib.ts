import type { CashTable } from "@/api/types/cash";
import type { GameType } from "@/api/types/tournaments";

export type CashGame = Extract<GameType, "nlh" | "plo" | "plo5">;
export type StakeTier = "low" | "mid" | "high";

export interface CashFilters {
  games: CashGame[];
  stakes: StakeTier[];
}

export const EMPTY_CASH_FILTERS: CashFilters = { games: [], stakes: [] };

export const GAME_LABELS: Record<GameType, string> = {
  nlh: "NLH",
  plo: "PLO",
  plo5: "PLO5",
  mixed: "Mixed",
  other: "Другое",
};

export const CASH_GAMES: CashGame[] = ["nlh", "plo", "plo5"];

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

export function applyCashFilters(tables: CashTable[], filters: CashFilters): CashTable[] {
  return tables.filter((table) => {
    if (filters.games.length > 0 && !filters.games.includes(table.game_type as CashGame)) {
      return false;
    }
    if (filters.stakes.length === 0) return true;
    const tier = stakeTier(table.big_blind_rub);
    return tier !== null && filters.stakes.includes(tier);
  });
}

const GAME_ORDER: GameType[] = ["nlh", "plo", "plo5", "mixed", "other"];

/**
 * Группы по игре; внутри — от младших ставок к старшим, при равных — где больше игроков:
 * игрок ищет свой лимит, а из двух столов садится за живой.
 */
export function groupByGame(tables: CashTable[]): [GameType, CashTable[]][] {
  const rub = (table: CashTable) =>
    table.big_blind_rub === null ? Number.POSITIVE_INFINITY : Number(table.big_blind_rub);
  const sorted = [...tables].sort(
    (a, b) => rub(a) - rub(b) || (b.seated ?? 0) - (a.seated ?? 0) || a.name.localeCompare(b.name),
  );
  return GAME_ORDER.map(
    (game) => [game, sorted.filter((table) => table.game_type === game)] as [GameType, CashTable[]],
  ).filter(([, items]) => items.length > 0);
}

const amountFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

/** «$0,1/0,2» — символ один раз впереди; без курса клуба — «0,5/1 фиш.». */
export function formatBlinds(table: Pick<CashTable, "small_blind" | "big_blind" | "club">): string {
  const { club } = table;
  const rate = club.chip_value === null ? null : Number(club.chip_value);
  const amount = (chips: string) => amountFormat.format(Number(chips) * (rate ?? 1));
  const pair = `${amount(table.small_blind)}/${amount(table.big_blind)}`;
  if (rate === null || club.currency_symbol === null) return `${pair} фиш.`;
  return `${club.currency_symbol}${pair}`;
}

/** Вход в больших блайндах: «40 ББ» — понятно без пересчёта валют. */
export function buyinInBigBlinds(chips: string | null, bigBlind: string): string | null {
  if (chips === null) return null;
  return `${amountFormat.format(Math.round(Number(chips) / Number(bigBlind)))} ББ`;
}

/** Самое свежее обновление среди столов — «обновлено 4 мин назад» в шапке. */
export function latestSeen(tables: CashTable[]): Date | null {
  let latest: number | null = null;
  for (const table of tables) {
    const at = new Date(table.seen_at).getTime();
    if (latest === null || at > latest) latest = at;
  }
  return latest === null ? null : new Date(latest);
}

export function minutesAgo(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  return minutes < 1 ? "только что" : `${minutes} мин назад`;
}
