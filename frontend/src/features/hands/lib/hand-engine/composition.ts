import type { HandBlinds, HandData, HandSeat, HandStreet, StreetName } from "@/api/types/hands";
import {
  DEFAULT_ANTE_MODE,
  publishedWizardAnteMode,
  wizardAnteMode,
} from "@/features/hands/lib/anteMode";
import { boardSizeFor, nextStreet } from "@/features/hands/lib/handSchema";
import { bestFive } from "@/features/hands/lib/handRank";
import type {
  BlindsManual,
  GetStateAtStepOptions,
  HandComposition,
} from "@/features/hands/lib/hand-engine/types";
import { buildTimeline, getStateAtStep } from "@/features/hands/lib/hand-engine/replay";
import { commitSeatName, displaySeatName } from "@/features/hands/lib/playerNames";
import {
  allSeats,
  assignPositions,
  withRequiredOccupied,
  type TableSize,
} from "@/features/hands/lib/positions";

export type { TableSize };

export const STACK_MUST_BE_POSITIVE = "Стек должен быть больше нуля";

export const EMPTY_BLINDS_MANUAL: BlindsManual = { sb: false, bb: false, ante: false };

export function emptyComposition(): HandComposition {
  return {
    tableSize: 6,
    occupied: allSeats(6),
    heroSeat: 1,
    buttonSeat: 1,
    blinds: { sb: 1000, bb: 2000, ante: 2000, ante_mode: DEFAULT_ANTE_MODE },
    blindsManual: { ...EMPTY_BLINDS_MANUAL },
    stacks: {},
    names: {},
    eventId: null,
    seriesId: null,
    liveSessionId: null,
    heroCards: [],
    streets: [{ street: "preflop", board: [], actions: [] }],
    showdownCards: {},
    showdownMucked: false,
    muckedSeats: [],
    note: "",
    isPublic: true,
    winnerSeats: [],
  };
}

/** SB = половина BB с округлением, анте = BB. Оба формата анте. */
export function blindsFromBb(bb: number): Pick<HandBlinds, "sb" | "ante"> {
  const big = Math.max(0, Math.round(bb));
  return {
    sb: big <= 0 ? 0 : Math.max(1, Math.round(big / 2)),
    ante: big,
  };
}

function blindsFromSb(sb: number): Pick<HandBlinds, "sb" | "bb" | "ante"> {
  const small = Math.max(0, Math.round(sb));
  const bb = small <= 0 ? 0 : Math.max(1, Math.round(small * 2));
  return { sb: small, bb, ante: bb };
}

export function inferBlindsManual(blinds: HandBlinds): BlindsManual {
  const derived = blindsFromBb(blinds.bb);
  return {
    sb: blinds.sb !== derived.sb,
    bb: false,
    ante: blinds.ante !== derived.ante,
  };
}

/**
 * Связанный пересчёт блайндов: BB = анте, SB = 0.5 BB с округлением.
 * Ввод BB → SB и анте; ввод SB → BB и анте; ввод анте → SB и BB.
 * Флаги «вручную» только подсвечивают поле-источник, пересчёт не блокируют.
 * Смена формата анте суммы не трогает.
 */
export function applyBlindsAutofill(
  current: HandBlinds,
  patch: Partial<HandBlinds>,
  manual: BlindsManual,
): { blinds: HandBlinds; manual: BlindsManual } {
  const hasSb = patch.sb !== undefined;
  const hasBb = patch.bb !== undefined;
  const hasAnte = patch.ante !== undefined;
  const amountCount = Number(hasSb) + Number(hasBb) + Number(hasAnte);

  if (amountCount === 0) {
    return { blinds: { ...current, ...patch }, manual };
  }

  if (amountCount > 1) {
    const blinds: HandBlinds = { ...current, ...patch };
    if (hasSb) blinds.sb = Math.max(0, Math.round(patch.sb!));
    if (hasBb) blinds.bb = Math.max(0, Math.round(patch.bb!));
    if (hasAnte) blinds.ante = Math.max(0, Math.round(patch.ante!));
    return { blinds, manual: inferBlindsManual(blinds) };
  }

  if (hasBb) {
    const derived = blindsFromBb(patch.bb!);
    return {
      blinds: { ...current, ...patch, bb: derived.ante, sb: derived.sb, ante: derived.ante },
      manual: { sb: false, bb: true, ante: false },
    };
  }
  if (hasSb) {
    const derived = blindsFromSb(patch.sb!);
    return {
      blinds: { ...current, ...patch, ...derived },
      manual: { sb: true, bb: false, ante: false },
    };
  }

  const derived = blindsFromBb(patch.ante!);
  return {
    blinds: { ...current, ...patch, ante: derived.ante, bb: derived.ante, sb: derived.sb },
    manual: { sb: false, bb: false, ante: true },
  };
}

/** Совместимость: смена BB заполняет SB и анте, если в патче нет sb/ante. */
export function applyBbDerived(current: HandBlinds, patch: Partial<HandBlinds>): HandBlinds {
  return applyBlindsAutofill(current, patch, EMPTY_BLINDS_MANUAL).blinds;
}

export function isDefaultStack(raw: string | undefined): boolean {
  return parseChipInput(raw ?? "") == null;
}

export function parseChipInput(value: string): number | null {
  const digits = value.replace(/\s/g, "").replaceAll("−", "-").replace(",", ".");
  if (!digits || digits === "-" || digits === "." || digits === "-.") return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function formatChipInput(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function resolvedStack(raw: string | undefined, bb: number): number {
  return parseChipInput(raw ?? "") ?? bb * 100;
}

export function invalidStartingStackNames(state: HandComposition): string[] {
  return [...state.occupied]
    .sort((a, b) => a - b)
    .flatMap((seat) => {
      const raw = state.stacks[seat] ?? "";
      if (!raw.trim()) return [];
      const chips = parseChipInput(raw);
      if (chips != null && chips > 0) return [];
      return [displaySeatName(seat, state.heroSeat, state.names[seat])];
    });
}

export function startingStackHint(names: string[]): string | null {
  if (names.length === 0) return null;
  return `${STACK_MUST_BE_POSITIVE}: ${names.join(", ")}`;
}

export function usedCards(state: HandComposition): Set<string> {
  const used = new Set<string>();
  for (const card of state.heroCards) used.add(card);
  let longest: string[] = [];
  for (const street of state.streets) {
    if (street.board.length >= longest.length) longest = street.board;
  }
  for (const card of longest) used.add(card);
  for (const cards of Object.values(state.showdownCards)) {
    for (const card of cards) used.add(card);
  }
  return used;
}

export function buildSeats(state: HandComposition): HandSeat[] {
  const occupied = [...state.occupied].sort((a, b) => a - b);
  const positions = assignPositions(state.tableSize, state.buttonSeat, occupied);
  return occupied.map((seat) => {
    const isHero = seat === state.heroSeat;
    const extra = state.showdownCards[seat] ?? [];
    const cards = isHero ? state.heroCards : extra;
    return {
      seat,
      position: positions.get(seat) ?? "MP",
      name: displaySeatName(seat, state.heroSeat, state.names[seat]),
      stack: resolvedStack(state.stacks[seat], state.blinds.bb),
      is_hero: isHero,
      cards: cards.length === 2 ? cards : [],
    };
  });
}

function dummyResult(heroSeat: number): HandData["result"] {
  return {
    winner_seats: [heroSeat],
    pot: 0,
    hero_invested: 0,
    hero_profit: 0,
    side_pots: null,
  };
}

export function buildPartialData(state: HandComposition): HandData {
  return {
    schema_version: 1,
    table_size: state.tableSize,
    blinds: state.blinds,
    hero_seat: state.heroSeat,
    button_seat: state.buttonSeat,
    seats: buildSeats(state),
    streets: state.streets,
    result: dummyResult(state.heroSeat),
  };
}

export function lastReplayState(state: HandComposition, options?: GetStateAtStepOptions) {
  const data = buildPartialData(state);
  const timeline = buildTimeline(data);
  return getStateAtStep(data, timeline.length - 1, options);
}

export function livingSeats(state: HandComposition): number[] {
  try {
    return lastReplayState(state)
      .seats.filter((seat) => !seat.folded)
      .map((seat) => seat.seat);
  } catch {
    return state.occupied;
  }
}

export function isStreetComplete(state: HandComposition): boolean {
  try {
    const last = lastReplayState(state);
    const living = last.seats.filter((seat) => !seat.folded);
    if (living.length < 2) return true;
    return last.actorSeat === null;
  } catch {
    return false;
  }
}

/** Выигранная доля банка минус вложено героем. Пока победитель не известен — 0. */
export function heroProfit(
  pot: number,
  invested: number,
  winnerSeats: number[],
  heroSeat: number,
): number {
  if (winnerSeats.length === 0) return 0;
  const share = winnerSeats.includes(heroSeat) ? Math.floor(pot / winnerSeats.length) : 0;
  return share - invested;
}

export function normalizeMuckedSeats(state: {
  muckedSeats?: number[];
  showdownMucked?: boolean;
  occupied: number[];
  heroSeat: number;
  showdownCards: Record<number, string[]>;
}): number[] {
  if (Array.isArray(state.muckedSeats) && state.muckedSeats.length > 0) {
    return [...new Set(state.muckedSeats.filter((seat) => seat !== state.heroSeat))];
  }
  if (!state.showdownMucked) return [];
  return state.occupied.filter(
    (seat) => seat !== state.heroSeat && (state.showdownCards[seat]?.length ?? 0) !== 2,
  );
}

export function isSeatMucked(state: HandComposition, seat: number): boolean {
  return state.muckedSeats.includes(seat);
}

export function showdownAccountedFor(state: HandComposition): boolean {
  const living = livingSeats(state);
  return living.every((seat) => {
    if (seat === state.heroSeat) return state.heroCards.length === 2;
    return (state.showdownCards[seat]?.length ?? 0) === 2 || state.muckedSeats.includes(seat);
  });
}

export function needsManualWinner(state: HandComposition): boolean {
  const living = livingSeats(state);
  if (living.length <= 1) return false;
  const othersAccounted = living.every((seat) => {
    if (seat === state.heroSeat) return true;
    return (state.showdownCards[seat]?.length ?? 0) === 2 || state.muckedSeats.includes(seat);
  });
  if (!othersAccounted) return false;
  const heroReady = !living.includes(state.heroSeat) || state.heroCards.length === 2;
  if (!heroReady) return true;
  return living.some((seat) => state.muckedSeats.includes(seat));
}

export function rankedWinnerSeats(state: HandComposition): number[] | null {
  try {
    const last = lastReplayState(state);
    const living = last.seats.filter((seat) => !seat.folded);
    if (living.length === 0) return null;
    if (living.length === 1) {
      const winner = living[0];
      return winner ? [winner.seat] : null;
    }
    if (last.board.length < 5) return null;
    const holes = living.map((seat) => {
      if (seat.isHero) return state.heroCards.length === 2 ? state.heroCards : [];
      const shown = state.showdownCards[seat.seat] ?? [];
      return shown.length === 2 ? shown : [];
    });
    if (holes.some((hole) => hole.length !== 2)) return null;
    const scores = holes.map((hole) => bestFive(hole, last.board));
    const best = Math.max(...scores);
    return living.filter((_, index) => scores[index] === best).map((seat) => seat.seat);
  } catch {
    return null;
  }
}

export function resolveWinners(state: HandComposition): number[] {
  const ranked = rankedWinnerSeats(state);
  if (ranked && ranked.length > 0) return ranked;
  if (!needsManualWinner(state)) return [];
  const living = livingSeats(state);
  return [...new Set(state.winnerSeats.filter((seat) => living.includes(seat)))];
}

export function withRecomputedWinners<T extends HandComposition>(state: T): T {
  const winners = rankedWinnerSeats(state);
  if (winners && winners.length > 0) {
    const same =
      winners.length === state.winnerSeats.length &&
      winners.every((seat) => state.winnerSeats.includes(seat));
    if (same) return state;
    return { ...state, winnerSeats: winners, showdownMucked: false, muckedSeats: [] };
  }
  if (!state.showdownMucked && state.muckedSeats.length === 0 && state.winnerSeats.length > 0) {
    return { ...state, winnerSeats: [] };
  }
  return state;
}

export function withMuckedSeats<T extends HandComposition>(state: T, muckedSeats: number[]): T {
  const unique = [...new Set(muckedSeats.filter((seat) => seat !== state.heroSeat))];
  return { ...state, muckedSeats: unique, showdownMucked: unique.length > 0 };
}

export function buildHandData(state: HandComposition): HandData {
  const data: HandData = { ...buildPartialData(state), streets: state.streets };
  const timeline = buildTimeline(data);
  const last = getStateAtStep(data, timeline.length - 1);
  const uniqueWinners = resolveWinners(state);
  const pot = last.pot;
  const heroInvested = last.heroInvested;
  return {
    ...data,
    seats: data.seats.map((seat) => {
      if (seat.is_hero) return { ...seat, cards: state.heroCards };
      const cards = state.showdownCards[seat.seat] ?? [];
      return { ...seat, cards: cards.length === 2 ? cards : [] };
    }),
    result: {
      winner_seats: uniqueWinners,
      pot,
      hero_invested: heroInvested,
      hero_profit: heroProfit(pot, heroInvested, uniqueWinners, state.heroSeat),
      side_pots: null,
    },
  };
}

export function streetActionCount(state: HandComposition): number {
  return state.streets.reduce((sum, street) => sum + street.actions.length, 0);
}

export function pruneSeatNames(
  names: Record<number, string> | undefined,
  tableSize: number,
  heroSeat: number,
): Record<number, string> {
  const next: Record<number, string> = {};
  if (!names) return next;
  for (const [key, value] of Object.entries(names)) {
    const seat = Number(key);
    if (!Number.isInteger(seat) || seat < 1 || seat > tableSize) continue;
    const committed = commitSeatName(value, seat, heroSeat);
    if (committed) next[seat] = committed;
  }
  return next;
}

function sameOccupied(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

export function lineupChanged(previous: HandComposition, next: HandComposition): boolean {
  return (
    next.tableSize !== previous.tableSize ||
    next.heroSeat !== previous.heroSeat ||
    next.buttonSeat !== previous.buttonSeat ||
    !sameOccupied(next.occupied, previous.occupied)
  );
}

export function compositionChanged(previous: HandComposition, next: HandComposition): boolean {
  return (
    lineupChanged(previous, next) ||
    next.blinds.sb !== previous.blinds.sb ||
    next.blinds.bb !== previous.blinds.bb ||
    next.blinds.ante !== previous.blinds.ante ||
    wizardAnteMode(next.blinds) !== wizardAnteMode(previous.blinds)
  );
}

export function hasLaterProgress(state: HandComposition): boolean {
  return (
    state.streets.length > 1 ||
    state.winnerSeats.length > 0 ||
    state.showdownMucked ||
    state.muckedSeats.length > 0 ||
    state.streets.some((street) => street.actions.length > 0 || street.board.length > 0) ||
    Object.values(state.showdownCards).some((cards) => cards.length > 0)
  );
}

export function resetLaterProgress<T extends HandComposition>(state: T): T {
  if (!hasLaterProgress(state)) return state;
  return {
    ...state,
    streets: [{ street: "preflop", board: [], actions: [] }],
    showdownCards: {},
    showdownMucked: false,
    muckedSeats: [],
    winnerSeats: [],
  };
}

export function applyComposition<T extends HandComposition>(previous: T, next: T): T {
  const names = pruneSeatNames(next.names, next.tableSize, next.heroSeat);
  if (lineupChanged(previous, next)) {
    return resetLaterProgress({ ...next, names });
  }
  return { ...next, names };
}

function remapKeyed<T>(
  record: Record<number, T>,
  from: number,
  to: number,
  swap: boolean,
): Record<number, T> {
  const next = { ...record };
  const fromVal = next[from];
  const toVal = next[to];
  delete next[from];
  delete next[to];
  if (swap) {
    if (fromVal !== undefined) next[to] = fromVal;
    if (toVal !== undefined) next[from] = toVal;
  } else if (fromVal !== undefined) {
    next[to] = fromVal;
  }
  return next;
}

function remapSeatList(list: number[], from: number, to: number, swap: boolean): number[] {
  const mapped = list.map((seat) => {
    if (seat === from) return to;
    if (swap && seat === to) return from;
    return seat;
  });
  return [...new Set(mapped)].sort((a, b) => a - b);
}

/** Пересадка: имя, стек и карты едут с игроком. Занятое место — обмен. Герой следует за игроком. */
export function moveSeat<T extends HandComposition>(state: T, from: number, to: number): T {
  if (from === to) return state;
  if (!state.occupied.includes(from)) return state;
  if (to < 1 || to > state.tableSize) return state;
  const swap = state.occupied.includes(to);
  let occupied = state.occupied.filter((seat) => seat !== from);
  if (!occupied.includes(to)) occupied = [...occupied, to];
  if (swap && !occupied.includes(from)) occupied = [...occupied, from];
  occupied.sort((a, b) => a - b);

  let heroSeat = state.heroSeat;
  if (heroSeat === from) heroSeat = to;
  else if (swap && heroSeat === to) heroSeat = from;

  const showdownCards = remapKeyed(state.showdownCards, from, to, swap);
  const next = applyComposition(state, {
    ...state,
    occupied: withRequiredOccupied(occupied, state.tableSize, state.buttonSeat, heroSeat),
    heroSeat,
    stacks: remapKeyed(state.stacks, from, to, swap),
    names: remapKeyed(state.names, from, to, swap),
    showdownCards,
    muckedSeats: remapSeatList(state.muckedSeats, from, to, swap),
    winnerSeats: remapSeatList(state.winnerSeats, from, to, swap),
  });
  // Смена состава сбрасывает улицы; карты остаются у игрока.
  return { ...next, showdownCards };
}

export function applyBoardAtIndex(
  streets: HandStreet[],
  fromIndex: number,
  board: string[],
): HandStreet[] {
  return streets.map((street, index) => {
    if (street.street === "preflop") return street;
    const size = boardSizeFor(street.street);
    if (index < fromIndex) {
      return { ...street, board: board.slice(0, size) };
    }
    if (index === fromIndex) {
      return { ...street, board: board.slice(0, size) };
    }
    const seen = new Set(board);
    const extra = street.board.slice(board.length).filter((card) => !seen.has(card));
    return { ...street, board: [...board, ...extra].slice(0, size) };
  });
}

export function clearFollowingActions(streets: HandStreet[], fromIndex: number): HandStreet[] {
  return streets.map((street, index) => (index > fromIndex ? { ...street, actions: [] } : street));
}

export function clampSeat(seat: number, tableSize: number): number {
  if (seat < 1 || seat > tableSize) return 1;
  return seat;
}

export function currentStreetOf(state: HandComposition): HandStreet {
  return state.streets[state.streets.length - 1] ?? { street: "preflop", board: [], actions: [] };
}

export function followingActionCount(state: HandComposition, actionIndex: number): number {
  const index = state.streets.length - 1;
  const current = state.streets[index];
  if (!current) return 0;
  const rest = Math.max(0, current.actions.length - actionIndex - 1);
  return rest;
}

export function followingActionCountAt(
  state: HandComposition,
  streetIndex: number,
  actionIndex: number,
): number {
  const current = state.streets[streetIndex];
  if (!current) return 0;
  const rest = Math.max(0, current.actions.length - actionIndex - 1);
  const later = state.streets
    .slice(streetIndex + 1)
    .reduce((sum, street) => sum + street.actions.length, 0);
  return rest + later;
}

export function stateBeforeActionAt<T extends HandComposition>(
  state: T,
  streetIndex: number,
  actionIndex: number,
): T {
  const streets = state.streets.map((street, index) => {
    if (index === streetIndex) {
      return { ...street, actions: street.actions.slice(0, actionIndex) };
    }
    if (index > streetIndex) return { ...street, actions: [] };
    return street;
  });
  return { ...state, streets };
}

export function compositionFromHand(
  data: HandData,
  meta: {
    eventId: string | null;
    seriesId?: string | null;
    liveSessionId: string | null;
    note: string | null;
    isPublic: boolean;
  },
): HandComposition {
  const stacks: Record<number, string> = {};
  const names: Record<number, string> = {};
  const showdownCards: Record<number, string[]> = {};
  let heroCards: string[] = [];
  for (const seat of data.seats) {
    stacks[seat.seat] = formatChipInput(seat.stack);
    if (seat.is_hero) heroCards = [...(seat.cards ?? [])];
    else if ((seat.cards?.length ?? 0) === 2) showdownCards[seat.seat] = [...(seat.cards ?? [])];
    const committed = commitSeatName(seat.name, seat.seat, data.hero_seat);
    if (committed) names[seat.seat] = committed;
  }
  return {
    tableSize: data.table_size,
    occupied: data.seats.map((seat) => seat.seat),
    heroSeat: data.hero_seat,
    buttonSeat: data.button_seat,
    blinds: { ...data.blinds, ante_mode: publishedWizardAnteMode(data.blinds) },
    blindsManual: inferBlindsManual(data.blinds),
    stacks,
    names,
    eventId: meta.eventId,
    seriesId: meta.seriesId ?? null,
    liveSessionId: meta.liveSessionId,
    heroCards,
    streets: data.streets.map((street) => ({
      street: street.street,
      board: [...street.board],
      actions: street.actions.map((item) => ({ ...item })),
    })),
    showdownCards,
    showdownMucked: inferShowdownMucked(data),
    muckedSeats: inferMuckedSeats(data),
    note: meta.note ?? "",
    isPublic: meta.isPublic,
    winnerSeats: [...data.result.winner_seats],
  };
}

function inferMuckedSeats(data: HandData): number[] {
  if (!inferShowdownMucked(data)) return [];
  try {
    const timeline = buildTimeline(data);
    const last = getStateAtStep(data, timeline.length - 1);
    return last.seats
      .filter((seat) => !seat.folded && !seat.isHero)
      .filter((seat) => {
        const row = data.seats.find((item) => item.seat === seat.seat);
        return (row?.cards?.length ?? 0) !== 2;
      })
      .map((seat) => seat.seat);
  } catch {
    return [];
  }
}

function inferShowdownMucked(data: HandData): boolean {
  try {
    const timeline = buildTimeline(data);
    const last = getStateAtStep(data, timeline.length - 1);
    const living = last.seats.filter((seat) => !seat.folded);
    if (living.length <= 1) return false;
    const holesKnown = living.every((seat) => {
      const row = data.seats.find((item) => item.seat === seat.seat);
      return (row?.cards?.length ?? 0) === 2;
    });
    return !holesKnown && data.result.winner_seats.length > 0;
  } catch {
    return false;
  }
}

export function nextStreetName(street: StreetName): StreetName | null {
  return nextStreet(street);
}
