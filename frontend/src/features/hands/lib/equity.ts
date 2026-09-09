import { bestFive } from "@/features/hands/lib/handRank";

const RANKS = "23456789TJQKA";
const SUITS = "shdc";

export const FULL_DECK: string[] = RANKS.split("").flatMap((rank) =>
  SUITS.split("").map((suit) => `${rank}${suit}`),
);

export interface EquityRequest {
  holes: string[][];
  board: string[];
  iterations: number;
  seed?: number;
  /** Сколько оппонентов с неизвестными картами — сдаются случайно из оставшейся колоды. */
  randomOpponents?: number;
}

export interface EquityResult {
  values: number[];
  exact: boolean;
}

function unused(holes: string[][], board: string[]): string[] {
  const taken = new Set([...board, ...holes.flat()]);
  return FULL_DECK.filter((card) => !taken.has(card));
}

function showdown(holes: string[][], board: string[]): number[] {
  const scores = holes.map((hole) => bestFive(hole, board));
  const best = Math.max(...scores);
  const winners = scores.map((score) => score === best);
  const share = 1 / winners.filter(Boolean).length;
  return winners.map((win) => (win ? share : 0));
}

function add(into: number[], part: number[]): void {
  for (let index = 0; index < into.length; index += 1) {
    into[index] = (into[index] ?? 0) + (part[index] ?? 0);
  }
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const result: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      result.push([...acc]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      acc.push(items[index] as T);
      rec(index + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return result;
}

/** Итераций Монте-Карло при вводе раздачи: точность до десятых не нужна. */
export const WIZARD_EQUITY_ITERATIONS = 20_000;

/** Полный перебор случайных рук, если комбинаций не больше этого.
 *  Флоп vs 1 random ≈ 1.07e6 шоудаунов — это уже слишком долго для UI. */
const EXACT_RANDOM_MAX = 80_000;

function makeRng(seed: number | undefined): () => number {
  if (seed == null) return Math.random;
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const m = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < m; i += 1) {
    c = (c * (n - i)) / (i + 1);
  }
  return Math.round(c);
}

function randomDealCount(deckLen: number, opponents: number, boardNeed: number): number {
  let n = deckLen;
  let count = 1;
  for (let i = 0; i < opponents; i += 1) {
    count *= binom(n, 2);
    n -= 2;
    if (count > EXACT_RANDOM_MAX) return count;
  }
  if (boardNeed > 0) count *= binom(n, boardNeed);
  return count;
}

function shouldEnumerateRandom(opponents: number, boardNeed: number, deckLen: number): boolean {
  if (opponents < 1) return false;
  if (boardNeed > 2) return false;
  if (opponents >= 3) return false;
  return randomDealCount(deckLen, opponents, boardNeed) <= EXACT_RANDOM_MAX;
}

function draw(pool: string[], count: number, random: () => number): string[] {
  const taken: string[] = [];
  for (let k = 0; k < count; k += 1) {
    if (pool.length === 0) break;
    const pick = Math.floor(random() * pool.length);
    const card = pool.splice(pick, 1)[0];
    if (card) taken.push(card);
  }
  return taken;
}

function accumulateBoard(
  holes: string[][],
  board: string[],
  rest: string[],
  need: number,
  values: number[],
): void {
  if (need <= 0) {
    add(values, showdown(holes, board.slice(0, 5)));
    return;
  }
  if (need === 1) {
    for (const card of rest) {
      add(values, showdown(holes, [...board, card]));
    }
    return;
  }
  for (let i = 0; i < rest.length; i += 1) {
    for (let j = i + 1; j < rest.length; j += 1) {
      add(values, showdown(holes, [...board, rest[i]!, rest[j]!]));
    }
  }
}

function forEachRandomHoles(
  deck: string[],
  remaining: number,
  acc: string[][],
  visit: (holes: string[][], rest: string[]) => void,
): void {
  if (remaining === 0) {
    visit(acc, deck);
    return;
  }
  for (let i = 0; i < deck.length; i += 1) {
    for (let j = i + 1; j < deck.length; j += 1) {
      const rest: string[] = [];
      for (let k = 0; k < deck.length; k += 1) {
        if (k !== i && k !== j) rest.push(deck[k]!);
      }
      acc.push([deck[i]!, deck[j]!]);
      forEachRandomHoles(rest, remaining - 1, acc, visit);
      acc.pop();
    }
  }
}

function computeEquityVsRandom(request: EquityRequest): EquityResult {
  const { holes, board, iterations } = request;
  const randomOpponents = request.randomOpponents ?? 0;
  const values = Array.from({ length: holes.length + randomOpponents }, () => 0);
  const rest = unused(holes, board);
  const need = Math.max(0, 5 - board.length);
  if (shouldEnumerateRandom(randomOpponents, need, rest.length)) {
    forEachRandomHoles(rest, randomOpponents, [], (extra, leftover) => {
      accumulateBoard([...holes, ...extra], board, leftover, need, values);
    });
    return { values, exact: true };
  }
  const n = Math.max(1, iterations);
  const random = makeRng(request.seed);
  for (let i = 0; i < n; i += 1) {
    const pool = [...rest];
    const extraHoles: string[][] = [];
    for (let opp = 0; opp < randomOpponents; opp += 1) {
      extraHoles.push(draw(pool, 2, random));
    }
    const extraBoard = need > 0 ? draw(pool, need, random) : [];
    add(values, showdown([...holes, ...extraHoles], [...board, ...extraBoard]));
  }
  return { values, exact: false };
}

/** Доли в процентах с десятыми; сумма ровно 100 (ничьи уже в values). */
export function equityPercents(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || values.length === 0) return values.map(() => 0);
  const rounded = values.map((value) => Math.round((value / total) * 1000) / 10);
  const drift = Math.round((100 - rounded.reduce((sum, value) => sum + value, 0)) * 10) / 10;
  if (drift === 0) return rounded;
  let best = 0;
  for (let index = 1; index < rounded.length; index += 1) {
    if ((values[index] ?? 0) > (values[best] ?? 0)) best = index;
  }
  rounded[best] = Math.round(((rounded[best] ?? 0) + drift) * 10) / 10;
  return rounded;
}

export function heroEquityPct(result: EquityResult): number {
  return equityPercents(result.values)[0] ?? 0;
}

/** Точный перебор или дешёвый ривер — можно на главном потоке, без воркера. */
export function equityCanRunSync(
  request: Pick<EquityRequest, "board"> &
    Partial<Pick<EquityRequest, "randomOpponents" | "iterations">>,
): boolean {
  const random = request.randomOpponents ?? 0;
  const need = Math.max(0, 5 - request.board.length);
  if (random === 0) return need <= 2;
  const iterations = request.iterations ?? 50_000;
  return need <= 0 && random <= 3 && iterations <= 20_000;
}

export function computeEquity(request: EquityRequest): EquityResult {
  const randomOpponents = request.randomOpponents ?? 0;
  // UI gates this via VITE_EQUITY_VS_RANDOM / EQUITY_VS_RANDOM. Keep the path.
  if (randomOpponents > 0) return computeEquityVsRandom(request);

  const { holes, board, iterations } = request;
  const values = holes.map(() => 0);
  const rest = unused(holes, board);
  const need = 5 - board.length;
  if (need <= 0) {
    add(values, showdown(holes, board.slice(0, 5)));
    return { values, exact: true };
  }
  if (need <= 2) {
    const combos = combinations(rest, need);
    for (const extra of combos) {
      add(values, showdown(holes, [...board, ...extra]));
    }
    return { values, exact: true };
  }
  const n = Math.max(1, iterations);
  const random = makeRng(request.seed);
  for (let i = 0; i < n; i += 1) {
    const pool = [...rest];
    const extra: string[] = [];
    for (let k = 0; k < need; k += 1) {
      const pick = Math.floor(random() * pool.length);
      extra.push(pool.splice(pick, 1)[0] ?? "");
    }
    add(values, showdown(holes, [...board, ...extra]));
  }
  return { values, exact: false };
}
