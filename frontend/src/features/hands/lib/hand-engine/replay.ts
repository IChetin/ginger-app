import type { HandAction, HandBlinds, HandData, StreetName } from "@/api/types/hands";
import { formatActionPhrase } from "@/features/hands/lib/actionTone";
import { resolveAnteMode } from "@/features/hands/lib/anteMode";
import type {
  GetStateAtStepOptions,
  LegalActions,
  ReplayState,
  SeatRuntime,
  TimelineItem,
} from "@/features/hands/lib/hand-engine/types";

export type {
  GetStateAtStepOptions,
  LegalActions,
  ReplayState,
  SeatRuntime,
  TimelineItem,
  TimelineKind,
} from "@/features/hands/lib/hand-engine/types";

const PREFLOP_ORDER = ["UTG", "+1", "+2", "MP", "HJ", "CO", "BTN", "SB", "BB"] as const;
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "+1", "+2", "MP", "HJ", "CO", "BTN"] as const;

function cloneSeat(seat: SeatRuntime): SeatRuntime {
  return { ...seat, cards: [...seat.cards] };
}

function bySeat(seats: SeatRuntime[]): Map<number, SeatRuntime> {
  return new Map(seats.map((seat) => [seat.seat, seat]));
}

export function canAct(seat: SeatRuntime): boolean {
  return !seat.folded && seat.stack > 0;
}

function living(seats: SeatRuntime[]): SeatRuntime[] {
  return seats.filter((seat) => !seat.folded);
}

export function bettingPossible(seats: SeatRuntime[]): boolean {
  return seats.filter(canAct).length >= 2;
}

function returnUncalled(
  seats: SeatRuntime[],
  pot: number,
  actedThisStreet: ReadonlySet<number>,
): number {
  let highest = 0;
  let cover = 0;
  for (const seat of seats) {
    if (seat.committed > highest) {
      cover = highest;
      highest = seat.committed;
    } else if (seat.committed > cover) {
      cover = seat.committed;
    }
  }
  const extra = highest - cover;
  if (extra <= 0) return pot;
  const leaders = seats.filter((seat) => seat.committed === highest);
  if (leaders.length !== 1) return pot;
  const leader = leaders[0];
  if (!leader || leader.folded || !actedThisStreet.has(leader.seat)) return pot;
  leader.committed -= extra;
  leader.invested -= extra;
  leader.stack += extra;
  if (leader.stack > 0) leader.allIn = false;
  return pot - extra;
}

function livingCommittedMatched(seats: SeatRuntime[]): boolean {
  const amounts = living(seats).map((seat) => seat.committed);
  if (amounts.length < 2) return true;
  return amounts.every((value) => value === amounts[0]);
}

function settleUncalled(
  seats: SeatRuntime[],
  pot: number,
  uneven: boolean,
  actedThisStreet: ReadonlySet<number>,
): { pot: number; uneven: boolean } {
  const nextPot = returnUncalled(seats, pot, actedThisStreet);
  return {
    pot: nextPot,
    uneven: livingCommittedMatched(seats) ? false : uneven,
  };
}

function isHeadsUp(seats: SeatRuntime[]): boolean {
  if (seats.length !== 2) return false;
  const positions = new Set(seats.map((seat) => seat.position));
  return positions.has("BTN") && positions.has("BB");
}

export function actionOrder(seats: SeatRuntime[], street: StreetName): number[] {
  if (isHeadsUp(seats)) {
    const btn = seats.find((seat) => seat.position === "BTN")?.seat;
    const bb = seats.find((seat) => seat.position === "BB")?.seat;
    if (btn == null || bb == null) return seats.map((seat) => seat.seat);
    return street === "preflop" ? [btn, bb] : [bb, btn];
  }
  const order = street === "preflop" ? PREFLOP_ORDER : POSTFLOP_ORDER;
  const lookup = new Map(seats.map((seat) => [seat.position, seat.seat]));
  return order.map((pos) => lookup.get(pos)).filter((seat): seat is number => seat != null);
}

function pendingActors(seats: SeatRuntime[], street: StreetName): number[] {
  const lookup = bySeat(seats);
  return actionOrder(seats, street).filter((seat) => {
    const row = lookup.get(seat);
    return row ? canAct(row) : false;
  });
}

function pendingIfBetting(seats: SeatRuntime[], street: StreetName): number[] {
  return bettingPossible(seats) ? pendingActors(seats, street) : [];
}

function putChips(
  seat: SeatRuntime,
  amount: number,
  pot: number,
): { pot: number; uneven: boolean } {
  const put = Math.min(Math.max(0, amount), seat.stack);
  const uneven = put < amount;
  seat.stack -= put;
  seat.committed += put;
  seat.invested += put;
  if (seat.stack === 0) seat.allIn = true;
  return { pot: pot + put, uneven: uneven || (seat.allIn && put < amount) };
}

function applyPosts(
  seats: SeatRuntime[],
  blinds: HandBlinds,
  tableSize: number,
  buttonSeat: number,
): { pot: number; uneven: boolean } {
  let pot = 0;
  let uneven = false;
  if (blinds.ante) {
    const mode = resolveAnteMode(blinds);
    if (mode === "bb") {
      const bbAnte = seats.find((seat) => seat.position === "BB");
      if (bbAnte) {
        const result = putChips(bbAnte, blinds.ante, pot);
        pot = result.pot;
        uneven = uneven || result.uneven;
      }
    } else {
      for (const seat of seats) {
        const result = putChips(seat, blinds.ante, pot);
        pot = result.pot;
        uneven = uneven || result.uneven;
      }
      if (mode === "table") {
        pot += blinds.ante * Math.max(0, tableSize - seats.length);
      }
    }
    for (const seat of seats) seat.committed = 0;
  }
  const lookup = bySeat(seats);
  // Стартовый банк: (SB, если место SB занято) + BB + анте по ante_mode.
  // bb — одно анте с BB; occupied — с каждого сидящего; нет поля — table_size × ante.
  // Хедз-ап (два игрока): BTN постит SB. Нет позиции SB — в банк не идёт.
  if (isHeadsUp(seats)) {
    const btn = lookup.get(buttonSeat) ?? seats.find((seat) => seat.position === "BTN");
    const bb = seats.find((seat) => seat.position === "BB");
    if (btn) {
      const result = putChips(btn, blinds.sb, pot);
      pot = result.pot;
      uneven = uneven || result.uneven;
    }
    if (bb) {
      const result = putChips(bb, blinds.bb, pot);
      pot = result.pot;
      uneven = uneven || result.uneven;
    }
    return { pot, uneven };
  }
  const sb = seats.find((seat) => seat.position === "SB");
  const bb = seats.find((seat) => seat.position === "BB");
  if (sb) {
    const result = putChips(sb, blinds.sb, pot);
    pot = result.pot;
    uneven = uneven || result.uneven;
  }
  if (bb) {
    const result = putChips(bb, blinds.bb, pot);
    pot = result.pot;
    uneven = uneven || result.uneven;
  }
  return { pot, uneven };
}

function applyAction(
  seats: SeatRuntime[],
  action: HandAction,
  pot: number,
  currentBet: number,
): { pot: number; currentBet: number; uneven: boolean } {
  const seat = bySeat(seats).get(action.seat);
  if (!seat) throw new Error(`Место ${action.seat} не найдено`);
  if (seat.folded) throw new Error(`${seat.name} уже в фолде`);
  if (action.action !== "allin" && !canAct(seat)) {
    throw new Error(`${seat.name} не может действовать`);
  }
  if (action.action === "fold") {
    seat.folded = true;
    return { pot, currentBet, uneven: false };
  }
  if (action.action === "check") {
    if (seat.committed < currentBet) throw new Error(`${seat.name} не может чекать против ставки`);
    return { pot, currentBet, uneven: false };
  }
  if (action.action === "call") {
    const target = action.amount ?? currentBet;
    if (currentBet <= seat.committed && target <= seat.committed) {
      throw new Error(`${seat.name} нечего коллировать`);
    }
    const need = target - seat.committed;
    const result = putChips(seat, need, pot);
    return { pot: result.pot, currentBet, uneven: result.uneven };
  }
  if (action.action === "bet") {
    if (currentBet > 0) throw new Error(`${seat.name} не может ставить — уже есть ставка`);
    const amount = action.amount ?? 0;
    const need = amount - seat.committed;
    const result = putChips(seat, need, pot);
    return { pot: result.pot, currentBet: seat.committed, uneven: result.uneven };
  }
  if (action.action === "raise") {
    const amount = action.amount ?? 0;
    const need = amount - seat.committed;
    const result = putChips(seat, need, pot);
    return { pot: result.pot, currentBet: seat.committed, uneven: result.uneven };
  }
  const target = action.amount ?? seat.committed + seat.stack;
  let need = target - seat.committed;
  if (need < 0) need = seat.stack;
  const result = putChips(seat, need > 0 ? need : seat.stack, pot);
  return {
    pot: result.pot,
    currentBet: Math.max(currentBet, seat.committed),
    uneven: result.uneven,
  };
}

function reopenPending(
  pending: number[],
  seats: SeatRuntime[],
  street: StreetName,
  actor: number,
  raised: boolean,
): number[] {
  if (raised) {
    const full = pendingActors(seats, street);
    const index = full.indexOf(actor);
    if (index >= 0) return [...full.slice(index + 1), ...full.slice(0, index)];
    return full;
  }
  return pending.filter((seat) => seat !== actor);
}

function initSeats(data: HandData): SeatRuntime[] {
  return data.seats.map((item) => ({
    seat: item.seat,
    position: item.position,
    name: item.name,
    stack: item.stack,
    committed: 0,
    folded: false,
    allIn: false,
    isHero: Boolean(item.is_hero),
    cards: [],
    startingStack: item.stack,
    invested: 0,
  }));
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function actionLog(seats: SeatRuntime[], action: HandAction, nextSeat: number | null): string {
  const lookup = bySeat(seats);
  const actor = lookup.get(action.seat);
  if (!actor) return "";
  const body = `${actor.name} ${formatActionPhrase(action, formatAmount, actor.committed)}`;
  if (nextSeat == null) return body;
  const nxt = lookup.get(nextSeat);
  if (!nxt) return body;
  return body + (nxt.isHero ? " · ваш ход" : ` · ход ${nxt.name}`);
}

function streetLabel(street: StreetName): string {
  if (street === "preflop") return "Префлоп";
  if (street === "flop") return "Флоп";
  if (street === "turn") return "Тёрн";
  return "Ривер";
}

function buildActionTimeline(data: HandData): TimelineItem[] {
  const items: TimelineItem[] = [{ kind: "post", street: "preflop", actionIndex: null }];
  for (const street of data.streets) {
    if (street.street !== "preflop") {
      items.push({ kind: "deal", street: street.street, actionIndex: null });
    }
    for (let index = 0; index < street.actions.length; index += 1) {
      const actionItem: TimelineItem = {
        kind: "action",
        street: street.street,
        actionIndex: index,
      };
      try {
        const preview = [...items, actionItem];
        runTimeline(data, preview, preview.length - 1, { hideUntilShowdown: true });
        items.push(actionItem);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("Улица уже закрыта")) break;
        throw error;
      }
    }
  }
  return items;
}

export function buildTimeline(data: HandData): TimelineItem[] {
  const items = buildActionTimeline(data);
  if (items.length === 0) return items;
  try {
    const end = runTimeline(data, items, items.length - 1, { hideUntilShowdown: true });
    if (living(end.seats).length >= 2 && end.actorSeat == null) {
      items.push({ kind: "showdown", street: end.street, actionIndex: null });
    }
  } catch {
    // Неполная или невалидная раздача — без шага вскрытия.
  }
  return items;
}

/** Минимум агрессии «до»: открытие = BB, рейз = текущая ставка + последнее повышение. */
export function minAggressiveTo(currentBet: number, lastRaise: number, bb: number): number {
  const big = Math.max(1, bb);
  if (currentBet <= 0) return big;
  return currentBet + Math.max(lastRaise, 1);
}

function snapshot(args: {
  step: number;
  total: number;
  street: StreetName;
  board: string[];
  pot: number;
  currentBet: number;
  lastRaise: number;
  bb: number;
  seats: SeatRuntime[];
  actorSeat: number | null;
  lastAction: HandAction | null;
  log: string;
  isDeal: boolean;
  isShowdown: boolean;
  uneven: boolean;
}): ReplayState {
  const hero = args.seats.find((seat) => seat.isHero);
  return {
    step: args.step,
    totalSteps: args.total,
    street: args.street,
    board: [...args.board],
    pot: args.pot,
    currentBet: args.currentBet,
    lastRaise: args.lastRaise,
    bb: args.bb,
    seats: args.seats.map(cloneSeat),
    actorSeat: args.actorSeat,
    lastAction: args.lastAction,
    log: args.log,
    isDeal: args.isDeal,
    isShowdown: args.isShowdown,
    hasSidePotWarning: args.uneven,
    heroInvested: hero?.invested ?? 0,
  };
}

function applyHoleVisibility(
  seats: SeatRuntime[],
  data: HandData,
  isShowdown: boolean,
  hideUntilShowdown: boolean,
): SeatRuntime[] {
  const known = new Map(data.seats.map((item) => [item.seat, item.cards ?? []]));
  return seats.map((seat) => {
    const published = known.get(seat.seat) ?? [];
    if (seat.isHero) {
      return { ...seat, cards: published.length === 2 ? [...published] : [] };
    }
    if (seat.folded) {
      return { ...seat, cards: [] };
    }
    const reveal = !hideUntilShowdown || isShowdown;
    return {
      ...seat,
      cards: reveal && published.length === 2 ? [...published] : [],
    };
  });
}

function runTimeline(
  data: HandData,
  timeline: TimelineItem[],
  step: number,
  options: GetStateAtStepOptions,
): ReplayState {
  const hideUntilShowdown = options.hideUntilShowdown !== false;
  const total = timeline.length;
  if (step < 0 || step >= total) throw new Error("Шаг вне раздачи");
  const seats = initSeats(data);
  let pot = 0;
  let currentBet = 0;
  let lastRaise = 0;
  let board: string[] = [];
  let street: StreetName = "preflop";
  let pending: number[] = [];
  let lastAction: HandAction | null = null;
  let log = "";
  let isDeal = false;
  let uneven = false;
  const actedThisStreet = new Set<number>();
  const streets = new Map(data.streets.map((item) => [item.street, item]));

  const actor = () => pending[0] ?? null;
  const suffix = (nextSeat: number | null) => {
    if (nextSeat == null) return "";
    const nxt = bySeat(seats).get(nextSeat);
    if (!nxt) return "";
    return nxt.isHero ? " · ваш ход" : ` · ход ${nxt.name}`;
  };

  for (let index = 0; index < timeline.length; index += 1) {
    const item = timeline[index];
    if (!item) continue;
    const isShowdown = item.kind === "showdown";
    if (item.kind === "post") {
      const posted = applyPosts(seats, data.blinds, data.table_size, data.button_seat);
      pot = posted.pot;
      uneven = uneven || posted.uneven;
      currentBet = Math.max(0, ...seats.map((seat) => seat.committed));
      const hasLiveBb = seats.some((seat) => seat.position === "BB");
      if (!hasLiveBb) currentBet = Math.max(currentBet, data.blinds.bb);
      lastRaise = currentBet;
      pending = pendingActors(seats, "preflop");
      log = `Блайнды и анте${suffix(actor())}`;
      isDeal = false;
      lastAction = null;
    } else if (item.kind === "deal") {
      const settled = settleUncalled(seats, pot, uneven, actedThisStreet);
      pot = settled.pot;
      uneven = settled.uneven;
      actedThisStreet.clear();
      street = item.street;
      board = [...(streets.get(street)?.board ?? [])];
      for (const seat of seats) seat.committed = 0;
      currentBet = 0;
      lastRaise = 0;
      pending = pendingIfBetting(seats, street);
      log = `${streetLabel(street)}${suffix(actor())}`;
      isDeal = true;
      lastAction = null;
    } else if (item.kind === "showdown") {
      const settled = settleUncalled(seats, pot, uneven, actedThisStreet);
      pot = settled.pot;
      uneven = settled.uneven;
      pending = [];
      log = "Вскрытие";
      isDeal = false;
      lastAction = null;
    } else {
      const streetData = streets.get(item.street);
      const action = streetData?.actions[item.actionIndex ?? -1];
      if (!action) throw new Error("Улица уже закрыта, лишнее действие");
      if (pending.length === 0) throw new Error("Улица уже закрыта, лишнее действие");
      const expected = pending[0];
      if (action.seat !== expected) {
        throw new Error(`Сейчас ход места ${expected}, а действует место ${action.seat}`);
      }
      const prevBet = currentBet;
      const applied = applyAction(seats, action, pot, currentBet);
      pot = applied.pot;
      currentBet = applied.currentBet;
      uneven = uneven || applied.uneven;
      actedThisStreet.add(action.seat);
      const raised =
        action.action === "bet" ||
        action.action === "raise" ||
        (action.action === "allin" && currentBet > prevBet);
      if (raised) lastRaise = currentBet - prevBet;
      pending = reopenPending(pending, seats, item.street, action.seat, raised).filter((seat) => {
        const row = bySeat(seats).get(seat);
        return row ? canAct(row) : false;
      });
      if (living(seats).length < 2) pending = [];
      if (pending.length === 0) {
        const settled = settleUncalled(seats, pot, uneven, actedThisStreet);
        pot = settled.pot;
        uneven = settled.uneven;
      }
      lastAction = action;
      log = actionLog(seats, action, actor());
      isDeal = false;
    }
    if (index === step) {
      return snapshot({
        step,
        total,
        street,
        board,
        pot,
        currentBet,
        lastRaise,
        bb: data.blinds.bb,
        seats: applyHoleVisibility(seats, data, isShowdown, hideUntilShowdown),
        actorSeat: actor(),
        lastAction,
        log,
        isDeal,
        isShowdown,
        uneven,
      });
    }
  }
  throw new Error("Шаг вне раздачи");
}

export function getStateAtStep(
  data: HandData,
  step: number,
  options: GetStateAtStepOptions = {},
): ReplayState {
  const timeline = buildTimeline(data);
  return runTimeline(data, timeline, step, options);
}

export function legalActions(state: ReplayState): LegalActions {
  const empty: LegalActions = {
    canFold: false,
    canCheck: false,
    canCall: false,
    canBet: false,
    canRaise: false,
    callAmount: 0,
    callTarget: 0,
    minBet: Math.max(1, state.bb),
    maxBet: 0,
  };
  if (state.actorSeat == null) return empty;
  const actor = state.seats.find((seat) => seat.seat === state.actorSeat);
  if (!actor || !canAct(actor)) return empty;
  const toCall = Math.max(0, state.currentBet - actor.committed);
  const maxBet = actor.committed + actor.stack;
  const callTarget = Math.min(state.currentBet, maxBet);
  const othersCanAct = state.seats.some((seat) => seat.seat !== actor.seat && canAct(seat));
  return {
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0 && actor.stack > 0,
    canBet: othersCanAct && state.currentBet === 0 && actor.stack > 0,
    canRaise: othersCanAct && state.currentBet > 0 && actor.stack > toCall,
    callAmount: Math.min(toCall, actor.stack),
    callTarget,
    minBet: minAggressiveTo(state.currentBet, state.lastRaise, state.bb),
    maxBet,
  };
}
