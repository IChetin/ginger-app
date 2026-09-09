import type { HandAction, HandBlinds, HandActionType } from "@/api/types/hands";
import {
  applyAction,
  applyBlindsAutofill,
  applyBoardAtIndex,
  applyComposition,
  canBet,
  clampSeat,
  emptyComposition,
  followingActionCount,
  getAvailableActions,
  inferBlindsManual,
  isHandComplete,
  isStreetComplete,
  lastReplayState,
  lineupChanged,
  livingSeats,
  moveSeat,
  needsManualWinner,
  rankedWinnerSeats,
  replaceAction,
  resolveWinners,
  setBoard,
  stateBeforeAction,
  streetActionCount,
  undo as engineUndo,
  usedCards,
  withMuckedSeats,
  withRecomputedWinners,
  type HandComposition,
} from "@/features/hands/lib/hand-engine";
import { boardSizeFor, boardStreetForIndex, nextStreet } from "@/features/hands/lib/handSchema";
import { commitSeatName } from "@/features/hands/lib/playerNames";
import {
  defaultLineupSeats,
  requiredSeats,
  withRequiredOccupied,
  type TableSize,
} from "@/features/hands/lib/positions";
import type { WizardState } from "@/features/hands/lib/wizardState";
import { inferFurthestStep } from "@/features/hands/lib/wizardState";
import { pluralRu } from "@/lib/plural";

export function seatsLostWhenResizing(occupied: number[], nextSize: number): number[] {
  return occupied.filter((seat) => seat > nextSize).sort((a, b) => a - b);
}

export function tableShrinkWarning(lost: number[]): string {
  if (lost.length === 1) {
    return `На месте ${lost[0]} уже сидит игрок — он будет снят со стола.`;
  }
  return `На местах ${lost.join(", ")} уже сидят игроки — они будут сняты со стола.`;
}

export function occupiedAfterResize(
  occupied: number[],
  nextSize: number,
  buttonSeat: number,
  heroSeat: number,
): number[] {
  return withRequiredOccupied(
    occupied.filter((seat) => seat <= nextSize),
    nextSize,
    buttonSeat,
    heroSeat,
  );
}

export type TablePhase =
  | "setup"
  | "acting"
  | "sizing"
  | "cards"
  | "heroPrompt"
  | "showdown"
  | "winner"
  | "result";

export interface TableDeck {
  kind: "board" | "hero" | "showdown";
  seat?: number;
  selected: string[];
  replaceIndex?: number;
  /** Карты предыдущей улицы в колоде борда — undo их не снимает. */
  lockedCount?: number;
}

export interface TableInputState extends HandComposition {
  phase: TablePhase;
  sizing: { to: number | null; preset: string | null } | null;
  deck: TableDeck | null;
  editingActionIndex: number | null;
  flyingChip: { seat: number; amount: number } | null;
  /** Диалог «укажите карты» на выходе с префлопа — один раз за раздачу. */
  heroCardsPromptSeen: boolean;
  /** После олл-ина уже предложили ввести карты вскрытия (до ранаута). */
  showdownPromptSeen: boolean;
  /** Подсказка посадки: скрыть после первой посадки в этой раздаче. */
  seatHintSeen: boolean;
}

export type TableInputAction =
  | { type: "hydrate"; state: TableInputState }
  | { type: "setTableSize"; size: TableSize }
  | { type: "toggleSeat"; seat: number }
  | { type: "setHero"; seat: number }
  | { type: "moveSeat"; from: number; to: number }
  | { type: "setBlinds"; blinds: Partial<HandBlinds> }
  | { type: "setStack"; seat: number; value: string }
  | { type: "setSeatName"; seat: number; name: string }
  | { type: "startHand" }
  | { type: "chooseAction"; kind: Exclude<HandActionType, "bet" | "raise"> }
  | { type: "openSizing"; kind: "bet" | "raise" }
  | { type: "setSizing"; to: number | null; preset: string | null }
  | { type: "confirmSizing" }
  | { type: "cancelSizing" }
  | { type: "openDeck"; kind: TableDeck["kind"]; seat?: number }
  | { type: "toggleCard"; card: string }
  | { type: "closeDeck" }
  | { type: "tapSeat"; seat: number }
  | { type: "tapSeatCards"; seat: number }
  | { type: "tapBoardCard"; index: number }
  | { type: "undo" }
  | { type: "pickWinner"; seat: number }
  | { type: "muckSeat"; seat: number }
  | { type: "setNote"; note: string }
  | { type: "setPublic"; value: boolean }
  | { type: "setLink"; eventId: string | null; seriesId?: string | null; liveSessionId: string | null }
  | { type: "clearFly" }
  | { type: "continueWithoutHeroCards" }
  | { type: "continueShowdown" }
  | { type: "skipToResult" };

function emptyUi(): Pick<
  TableInputState,
  | "phase"
  | "sizing"
  | "deck"
  | "editingActionIndex"
  | "flyingChip"
  | "heroCardsPromptSeen"
  | "showdownPromptSeen"
  | "seatHintSeen"
> {
  return {
    phase: "setup",
    sizing: null,
    deck: null,
    editingActionIndex: null,
    flyingChip: null,
    heroCardsPromptSeen: false,
    showdownPromptSeen: false,
    seatHintSeen: false,
  };
}

export function emptyTableInput(): TableInputState {
  const composition = emptyComposition();
  const tableSize = 9;
  return {
    ...composition,
    tableSize,
    occupied: defaultLineupSeats(tableSize, composition.buttonSeat, composition.heroSeat),
    blinds: { sb: 100, bb: 200, ante: 200, ante_mode: composition.blinds.ante_mode },
    ...emptyUi(),
  };
}

export function asComposition(state: TableInputState): HandComposition {
  return {
    tableSize: state.tableSize,
    occupied: state.occupied,
    heroSeat: state.heroSeat,
    buttonSeat: state.buttonSeat,
    blinds: state.blinds,
    blindsManual: state.blindsManual,
    stacks: state.stacks,
    names: state.names,
    eventId: state.eventId,
    seriesId: state.seriesId ?? null,
    liveSessionId: state.liveSessionId,
    heroCards: state.heroCards,
    streets: state.streets,
    showdownCards: state.showdownCards,
    showdownMucked: state.showdownMucked,
    muckedSeats: state.muckedSeats,
    note: state.note,
    isPublic: state.isPublic,
    winnerSeats: state.winnerSeats,
  };
}

function actorSeat(state: HandComposition): number | null {
  try {
    return lastReplayState(state).actorSeat;
  } catch {
    return null;
  }
}

function flyFor(state: TableInputState, action: HandAction): TableInputState {
  if (action.action === "fold" || action.action === "check") {
    return { ...state, flyingChip: null };
  }
  const amount = action.amount ?? 0;
  if (amount <= 0) return { ...state, flyingChip: null };
  return { ...state, flyingChip: { seat: action.seat, amount } };
}

/** Торговля закрыта: фолд до одного или некому больше ставить (олл-ин). */
export function isBettingOver(state: HandComposition): boolean {
  if (!isStreetComplete(state)) return false;
  const living = livingSeats(state);
  if (living.length < 2) return true;
  return !canBet(state);
}

function needsRunout(state: HandComposition): boolean {
  const current = state.streets[state.streets.length - 1];
  if (!current) return false;
  if (current.street !== "river") return true;
  return current.board.length < 5;
}

function resumeAfterLineup(previous: TableInputState, next: TableInputState): TableInputState {
  if (previous.phase === "setup" || !lineupChanged(previous, next)) return next;
  return afterBetting({ ...next, phase: "acting" });
}

export function tableActionCount(state: HandComposition): number {
  return streetActionCount(state);
}

export function canTableUndo(state: TableInputState): boolean {
  if (state.phase === "setup") return false;
  if (state.phase === "sizing") return true;
  if (state.phase === "cards" && state.deck) {
    const locked = state.deck.kind === "board" ? (state.deck.lockedCount ?? 0) : 0;
    if (state.deck.replaceIndex != null || state.deck.selected.length > locked) return true;
  }
  if (tableActionCount(state) > 0) return true;
  if (state.streets.length > 1) return true;
  return state.phase === "showdown" || state.phase === "winner" || state.phase === "result";
}

export function lineupResetWarning(count: number): string {
  return `Введено ${count} ${pluralRu(count, "действие", "действия", "действий")}. Изменение состава сбросит их.`;
}

export function canEnterShowdownCards(state: TableInputState): boolean {
  if (state.phase === "showdown" || state.phase === "winner" || state.phase === "result") {
    return true;
  }
  return isBettingOver(state);
}

function clearTableUi(state: TableInputState): TableInputState {
  return { ...state, sizing: null, deck: null, editingActionIndex: null };
}

function finishToWinnerOrResult(state: TableInputState): TableInputState {
  const next = clearTableUi(withRecomputedWinners(state));
  const resolved = resolveWinners(next);
  if (resolved.length > 0) {
    return { ...next, phase: "result", winnerSeats: resolved };
  }
  return { ...next, phase: "winner" };
}

function afterBetting(state: TableInputState): TableInputState {
  const next = withRecomputedWinners(state);
  if (!isStreetComplete(next)) {
    return { ...clearTableUi(next), phase: "acting" };
  }
  const living = livingSeats(next);
  if (living.length < 2) {
    const winners = rankedWinnerSeats(next);
    if (winners && winners.length > 0) {
      return { ...clearTableUi(next), phase: "result", winnerSeats: winners };
    }
    return { ...clearTableUi(next), phase: "winner" };
  }
  const current = next.streets[next.streets.length - 1];
  if (!current) return { ...next, phase: "acting" };
  if (current.street === "preflop" && next.heroCards.length < 2 && !next.heroCardsPromptSeen) {
    return {
      ...clearTableUi(next),
      phase: "heroPrompt",
      heroCardsPromptSeen: true,
    };
  }
  if (!canBet(next) && needsRunout(next) && !next.showdownPromptSeen) {
    return { ...clearTableUi(next), phase: "showdown", showdownPromptSeen: true };
  }
  return openNextStreetOrShowdown(next);
}

function openBoardPicker(state: TableInputState, selected: string[]): TableInputState {
  return {
    ...state,
    phase: "cards",
    deck: { kind: "board", selected, lockedCount: selected.length },
    sizing: null,
    editingActionIndex: null,
  };
}

function openNextStreetOrShowdown(state: TableInputState): TableInputState {
  const current = state.streets[state.streets.length - 1];
  if (!current) return { ...state, phase: "acting" };
  if (current.street === "river") {
    if (current.board.length < 5) {
      return openBoardPicker(state, [...current.board]);
    }
    return finishToWinnerOrResult(state);
  }
  const nxt = nextStreet(current.street);
  if (!nxt) return finishToWinnerOrResult(state);
  const existing = state.streets.find((street) => street.street === nxt);
  const prefix = existing?.board.length ? [...existing.board] : [...current.board];
  return openBoardPicker(state, prefix);
}

function restorePhaseAfterUndo(state: TableInputState): TableInputState {
  const next = clearTableUi(withRecomputedWinners(state));
  const living = livingSeats(next);
  if (living.length < 2) {
    const winners = rankedWinnerSeats(next);
    if (winners && winners.length > 0) {
      return { ...next, phase: "result", winnerSeats: winners };
    }
    return { ...next, phase: "winner" };
  }
  if (isHandComplete(next)) {
    return finishToWinnerOrResult(next);
  }
  return { ...next, phase: "acting" };
}

function applyPlayerAction(state: TableInputState, action: HandAction): TableInputState {
  const streetIndex = state.streets.length - 1;
  let next: TableInputState;
  if (state.editingActionIndex != null) {
    next = {
      ...replaceAction(state, state.editingActionIndex, action, streetIndex),
      editingActionIndex: null,
    };
  } else {
    next = applyAction(state, action, streetIndex);
  }
  return afterBetting(flyFor(next, action));
}

export function tableReducer(state: TableInputState, action: TableInputAction): TableInputState {
  switch (action.type) {
    case "hydrate":
      return {
        ...emptyTableInput(),
        ...action.state,
        occupied: withRequiredOccupied(
          action.state.occupied,
          action.state.tableSize,
          action.state.buttonSeat,
          action.state.heroSeat,
        ),
        blindsManual: action.state.blindsManual ?? inferBlindsManual(action.state.blinds),
        sizing: action.state.sizing ?? null,
        deck: action.state.deck ?? null,
        editingActionIndex: action.state.editingActionIndex ?? null,
        flyingChip: null,
      };
    case "setTableSize": {
      if (action.size === state.tableSize) return state;
      const heroSeat = clampSeat(state.heroSeat, action.size);
      const buttonSeat = clampSeat(state.buttonSeat, action.size);
      const next = applyComposition(state, {
        ...state,
        tableSize: action.size,
        occupied: occupiedAfterResize(state.occupied, action.size, buttonSeat, heroSeat),
        heroSeat,
        buttonSeat,
      });
      return resumeAfterLineup(state, next);
    }
    case "toggleSeat": {
      const required = requiredSeats(
        state.tableSize,
        state.buttonSeat,
        state.heroSeat,
        state.occupied,
      );
      if (required.includes(action.seat)) return state;
      const has = state.occupied.includes(action.seat);
      const occupied = has
        ? state.occupied.filter((seat) => seat !== action.seat)
        : [...state.occupied, action.seat].sort((a, b) => a - b);
      if (occupied.length < 2) return state;
      return resumeAfterLineup(
        state,
        applyComposition(state, {
          ...state,
          occupied,
          seatHintSeen: state.seatHintSeen || !has,
        }),
      );
    }
    case "setHero": {
      const heroSeat = clampSeat(action.seat, state.tableSize);
      if (heroSeat === state.heroSeat) return state;
      return resumeAfterLineup(
        state,
        applyComposition(state, {
          ...state,
          heroSeat,
          occupied: withRequiredOccupied(state.occupied, state.tableSize, state.buttonSeat, heroSeat),
        }),
      );
    }
    case "moveSeat": {
      return resumeAfterLineup(state, moveSeat(state, action.from, action.to));
    }
    case "setBlinds": {
      const { blinds, manual } = applyBlindsAutofill(
        state.blinds,
        action.blinds,
        state.blindsManual ?? inferBlindsManual(state.blinds),
      );
      return applyComposition(state, { ...state, blinds, blindsManual: manual });
    }
    case "setStack":
      return { ...state, stacks: { ...state.stacks, [action.seat]: action.value } };
    case "setSeatName": {
      const names = { ...state.names };
      const committed = commitSeatName(action.name, action.seat, state.heroSeat);
      if (committed) names[action.seat] = committed;
      else delete names[action.seat];
      return { ...state, names };
    }
    case "setLink":
      return {
        ...state,
        eventId: action.eventId,
        seriesId: action.seriesId === undefined ? state.seriesId : action.seriesId,
        liveSessionId: action.liveSessionId,
      };
    case "startHand": {
      if (state.occupied.length < 2) return state;
      return afterBetting({ ...state, phase: "acting" });
    }
    case "chooseAction": {
      const view =
        state.editingActionIndex != null
          ? stateBeforeAction(state, state.editingActionIndex)
          : state;
      const legal = getAvailableActions(view);
      const seat = actorSeat(view);
      if (seat == null) return state;
      if (action.kind === "fold" && !legal.canFold) return state;
      if (action.kind === "check" && !legal.canCheck) return state;
      if (action.kind === "call" && !legal.canCall) return state;
      if (action.kind === "allin" && legal.maxBet <= 0) return state;
      const handAction: HandAction =
        action.kind === "fold" || action.kind === "check"
          ? { seat, action: action.kind }
          : action.kind === "call"
            ? { seat, action: "call", amount: legal.callTarget }
            : { seat, action: "allin", amount: legal.maxBet };
      return applyPlayerAction(state, handAction);
    }
    case "openSizing": {
      const view =
        state.editingActionIndex != null
          ? stateBeforeAction(state, state.editingActionIndex)
          : state;
      const legal = getAvailableActions(view);
      if (action.kind === "bet" && !legal.canBet) return state;
      if (action.kind === "raise" && !legal.canRaise) return state;
      return {
        ...state,
        phase: "sizing",
        sizing: { to: null, preset: null },
      };
    }
    case "setSizing":
      if (state.phase !== "sizing") return state;
      return { ...state, sizing: { to: action.to, preset: action.preset } };
    case "cancelSizing":
      return { ...state, phase: "acting", sizing: null };
    case "confirmSizing": {
      const view =
        state.editingActionIndex != null
          ? stateBeforeAction(state, state.editingActionIndex)
          : state;
      const legal = getAvailableActions(view);
      const seat = actorSeat(view);
      if (seat == null || !state.sizing || state.sizing.to == null) return state;
      const to = state.sizing.to;
      if (to < legal.minBet && to < legal.maxBet) return state;
      const capped = Math.min(to, legal.maxBet);
      let currentBet = 0;
      try {
        currentBet = lastReplayState(view).currentBet;
      } catch {
        currentBet = 0;
      }
      const type: HandActionType =
        capped >= legal.maxBet ? "allin" : currentBet === 0 ? "bet" : "raise";
      return applyPlayerAction(state, { seat, action: type, amount: capped });
    }
    case "openDeck": {
      const selected =
        action.kind === "hero"
          ? [...state.heroCards]
          : action.kind === "showdown" && action.seat != null
            ? [...(state.showdownCards[action.seat] ?? [])]
            : [...(state.streets.at(-1)?.board ?? [])];
      return {
        ...state,
        phase: "cards",
        deck: { kind: action.kind, seat: action.seat, selected },
      };
    }
    case "closeDeck": {
      if (state.phase !== "cards") return state;
      const wasHero = state.deck?.kind === "hero";
      const next = { ...state, deck: null };
      if (wasHero && isStreetComplete(next)) return afterBetting(next);
      return { ...next, phase: phaseAfterCards(next) };
    }
    case "continueWithoutHeroCards": {
      if (state.phase !== "heroPrompt") return state;
      return afterBetting({ ...state, heroCardsPromptSeen: true });
    }
    case "continueShowdown": {
      if (state.phase !== "showdown" && state.phase !== "acting") return state;
      return openNextStreetOrShowdown({ ...state, showdownPromptSeen: true });
    }
    case "skipToResult": {
      if (!isBettingOver(state) && !isHandComplete(state)) return state;
      return finishToWinnerOrResult({ ...state, showdownPromptSeen: true });
    }
    case "toggleCard": {
      const deck = state.deck;
      if (!deck) return state;
      if (deck.kind === "board" && deck.replaceIndex != null) {
        return replaceBoardCard(state, deck, action.card);
      }
      const locked = usedCards({
        ...state,
        heroCards: deck.kind === "hero" ? [] : state.heroCards,
        showdownCards:
          deck.kind === "showdown" && deck.seat != null
            ? { ...state.showdownCards, [deck.seat]: [] }
            : state.showdownCards,
      });
      for (const card of deck.selected) locked.delete(card);
      const has = deck.selected.includes(action.card);
      if (has) {
        return {
          ...state,
          deck: { ...deck, selected: deck.selected.filter((card) => card !== action.card) },
        };
      }
      if (locked.has(action.card)) return state;
      if (deck.kind === "board") {
        const current = state.streets.at(-1);
        const nxt =
          current && isStreetComplete(state) ? nextStreet(current.street) : current?.street;
        const target = nxt && nxt !== "preflop" ? nxt : "flop";
        const size = boardSizeFor(target);
        if (deck.selected.length >= size) return state;
        const selected = [...deck.selected, action.card];
        if (selected.length === size) {
          return afterBetting({
            ...setBoard(state, target, selected),
            deck: null,
            phase: "acting",
          });
        }
        return { ...state, deck: { ...deck, selected } };
      }
      if (deck.kind === "hero") {
        if (deck.selected.length >= 2) return state;
        const selected = [...deck.selected, action.card];
        const next = { ...state, heroCards: selected, deck: { ...deck, selected } };
        return selected.length === 2 ? afterBetting({ ...next, deck: null }) : next;
      }
      if (deck.kind === "showdown" && deck.seat != null) {
        if (deck.selected.length >= 2) return state;
        const selected = [...deck.selected, action.card];
        const next = withMuckedSeats(
          {
            ...state,
            showdownCards: { ...state.showdownCards, [deck.seat]: selected },
            deck: { ...deck, selected },
          },
          state.muckedSeats.filter((seat) => seat !== deck.seat),
        );
        if (selected.length !== 2) return next;
        const closed = { ...next, deck: null };
        if (!isStreetComplete(closed)) {
          return { ...closed, phase: "acting" };
        }
        if (!canBet(closed) && needsRunout(closed)) {
          return { ...clearTableUi(closed), phase: "showdown", showdownPromptSeen: true };
        }
        return finishToWinnerOrResult(closed);
      }
      return state;
    }
    case "tapSeat": {
      if (state.phase === "setup") {
        return tableReducer(state, { type: "toggleSeat", seat: action.seat });
      }
      if (
        state.phase === "winner" ||
        state.phase === "result" ||
        state.phase === "showdown"
      ) {
        return tableReducer(state, { type: "pickWinner", seat: action.seat });
      }
      if (state.phase === "cards") {
        if (action.seat === state.heroSeat) {
          return tableReducer(state, { type: "openDeck", kind: "hero" });
        }
        if (livingSeats(state).includes(action.seat) && canEnterShowdownCards(state)) {
          return tableReducer(state, { type: "openDeck", kind: "showdown", seat: action.seat });
        }
        return state;
      }
      if (state.phase === "acting" || state.phase === "sizing") {
        const street = state.streets.at(-1);
        let index = -1;
        if (street) {
          for (let i = street.actions.length - 1; i >= 0; i -= 1) {
            if (street.actions[i]?.seat === action.seat) {
              index = i;
              break;
            }
          }
        }
        if (index >= 0) {
          return { ...state, editingActionIndex: index, phase: "acting", sizing: null };
        }
        if (action.seat === state.heroSeat && state.heroCards.length < 2) {
          return tableReducer(state, { type: "openDeck", kind: "hero" });
        }
        return state;
      }
      return state;
    }
    case "tapSeatCards": {
      if (state.phase === "setup") return state;
      if (action.seat === state.heroSeat) {
        return tableReducer(state, { type: "openDeck", kind: "hero" });
      }
      if (state.occupied.includes(action.seat) && action.seat !== state.heroSeat) {
        return tableReducer(state, { type: "openDeck", kind: "showdown", seat: action.seat });
      }
      return state;
    }
    case "tapBoardCard": {
      if (state.phase === "setup") return state;
      const board = longestBoard(state);
      if (action.index < 0 || action.index >= board.length) return state;
      return {
        ...state,
        phase: "cards",
        sizing: null,
        editingActionIndex: null,
        deck: { kind: "board", selected: [...board], replaceIndex: action.index },
      };
    }
    case "undo": {
      if (state.phase === "sizing") {
        return { ...state, phase: "acting", sizing: null };
      }
      if (state.phase === "cards" && state.deck) {
        if (state.deck.replaceIndex != null) {
          return { ...state, phase: phaseAfterCards({ ...state, deck: null }), deck: null };
        }
        const locked = state.deck.kind === "board" ? (state.deck.lockedCount ?? 0) : 0;
        if (state.deck.selected.length > locked) {
          return {
            ...state,
            deck: { ...state.deck, selected: state.deck.selected.slice(0, -1) },
          };
        }
        return restorePhaseAfterUndo({ ...state, deck: null });
      }
      if (state.phase === "setup") return state;
      if (state.phase === "showdown") {
        return restorePhaseAfterUndo({ ...state, showdownPromptSeen: false });
      }
      return restorePhaseAfterUndo(engineUndo(state));
    }
    case "pickWinner": {
      const living = livingSeats(state);
      if (!living.includes(action.seat)) return state;
      const mucked = living.filter(
        (seat) => seat !== state.heroSeat && (state.showdownCards[seat]?.length ?? 0) !== 2,
      );
      const next = withMuckedSeats({ ...state, winnerSeats: [action.seat], deck: null }, mucked);
      return phaseAfterShowdown(next);
    }
    case "muckSeat": {
      if (action.seat === state.heroSeat) return state;
      const next = withMuckedSeats(
        {
          ...state,
          showdownCards: { ...state.showdownCards, [action.seat]: [] },
          winnerSeats: state.winnerSeats.filter((seat) => seat !== action.seat),
          deck: null,
        },
        [...state.muckedSeats, action.seat],
      );
      return phaseAfterShowdown(next);
    }
    case "setNote":
      return { ...state, note: action.note };
    case "setPublic":
      return { ...state, isPublic: action.value };
    case "clearFly":
      return { ...state, flyingChip: null };
    default:
      return state;
  }
}

export function tableFollowingCount(state: TableInputState): number {
  if (state.editingActionIndex == null) return 0;
  return followingActionCount(state, state.editingActionIndex);
}

export function tableCanBet(state: TableInputState): boolean {
  return canBet(state);
}

function phaseAfterShowdown(state: TableInputState): TableInputState {
  const next = clearTableUi(withRecomputedWinners(state));
  const resolved = resolveWinners(next);
  if (resolved.length > 0) {
    return { ...next, phase: "result", winnerSeats: resolved };
  }
  if (!isHandComplete(next) && needsRunout(next)) {
    return { ...next, phase: "showdown", showdownPromptSeen: true };
  }
  return { ...next, phase: "winner" };
}

function phaseAfterCards(state: TableInputState): TablePhase {
  if (isHandComplete(state)) {
    return resolveWinners(state).length > 0 ? "result" : "winner";
  }
  if (isBettingOver(state) && needsRunout(state)) return "showdown";
  return "acting";
}

export function nextStreetToDeal(state: HandComposition): string | null {
  const current = state.streets[state.streets.length - 1];
  if (!current || !isStreetComplete(state)) return null;
  if (livingSeats(state).length < 2) return null;
  if (current.street === "river") return current.board.length < 5 ? "ривер" : null;
  const nxt = nextStreet(current.street);
  if (nxt === "flop") return "флоп";
  if (nxt === "turn") return "тёрн";
  if (nxt === "river") return "ривер";
  return null;
}

function longestBoard(state: HandComposition): string[] {
  let longest: string[] = [];
  for (const street of state.streets) {
    if (street.board.length >= longest.length) longest = street.board;
  }
  return longest;
}

function replaceBoardCard(state: TableInputState, deck: TableDeck, card: string): TableInputState {
  const index = deck.replaceIndex;
  if (index == null) return state;
  const currentCard = deck.selected[index];
  if (currentCard == null) {
    return { ...state, phase: phaseAfterCards(state), deck: null };
  }
  if (card === currentCard) {
    return { ...state, phase: phaseAfterCards(state), deck: null };
  }
  const locked = usedCards(state);
  locked.delete(currentCard);
  if (locked.has(card)) return state;
  const slot = boardStreetForIndex(index);
  if (!slot) return state;
  const streetIndex = state.streets.findIndex((street) => street.street === slot.street);
  if (streetIndex < 0) return state;
  const nextBoard = [...deck.selected];
  nextBoard[index] = card;
  const next = withRecomputedWinners({
    ...state,
    streets: applyBoardAtIndex(state.streets, streetIndex, nextBoard),
    deck: null,
  });
  return { ...next, phase: phaseAfterCards(next) };
}

function isTablePhase(value: unknown): value is TablePhase {
  return (
    value === "setup" ||
    value === "acting" ||
    value === "sizing" ||
    value === "cards" ||
    value === "heroPrompt" ||
    value === "showdown" ||
    value === "winner" ||
    value === "result"
  );
}

export function inferTablePhase(state: WizardState): TablePhase {
  if (state.pickingBoard) return "cards";
  const actions = streetActionCountSafe(state);
  const hasBoard = state.streets.some((street) => street.board.length > 0);
  if (actions === 0 && !hasBoard && state.heroCards.length < 2) {
    return "setup";
  }
  if (state.winnerSeats.length > 0) return "result";
  try {
    if (isBettingOver(state)) {
      if (needsManualWinner(state)) return "winner";
      return "showdown";
    }
  } catch {
    /* неполная раздача */
  }
  if (state.step === 2) return "cards";
  return "acting";
}

function streetActionCountSafe(state: WizardState): number {
  return state.streets.reduce((sum, street) => sum + street.actions.length, 0);
}

export function tableFromWizard(state: WizardState): TableInputState {
  const raw = state as WizardState & Partial<TableInputState>;
  return {
    ...emptyTableInput(),
    tableSize: state.tableSize,
    occupied: state.occupied,
    heroSeat: state.heroSeat,
    buttonSeat: state.buttonSeat,
    blinds: state.blinds,
    blindsManual: state.blindsManual ?? inferBlindsManual(state.blinds),
    stacks: state.stacks,
    names: state.names,
    eventId: state.eventId,
    seriesId: state.seriesId ?? null,
    liveSessionId: state.liveSessionId,
    heroCards: state.heroCards,
    streets: state.streets,
    showdownCards: state.showdownCards,
    showdownMucked: state.showdownMucked,
    muckedSeats: state.muckedSeats,
    note: state.note,
    isPublic: state.isPublic,
    winnerSeats: state.winnerSeats,
    phase: isTablePhase(raw.tablePhase)
      ? raw.tablePhase
      : isTablePhase(raw.phase)
        ? raw.phase
        : inferTablePhase(state),
    sizing: null,
    deck: state.pickingBoard
      ? { kind: "board", selected: [...state.boardDraft] }
      : state.step === 2
        ? { kind: "hero", selected: [...state.heroCards] }
        : null,
    editingActionIndex: null,
    flyingChip: null,
    heroCardsPromptSeen: raw.heroCardsPromptSeen === true,
    showdownPromptSeen: raw.showdownPromptSeen === true,
    seatHintSeen: raw.seatHintSeen === true,
  };
}

export function tableToWizard(state: TableInputState): WizardState {
  const step =
    state.phase === "setup"
      ? 1
      : state.phase === "result" || state.phase === "winner" || state.phase === "showdown"
        ? 4
        : 3;
  const furthest = inferFurthestStep({
    step,
    heroCards: state.heroCards,
    streets: state.streets,
    winnerSeats: state.winnerSeats,
  });
  return {
    ...asComposition(state),
    step,
    furthestStep: furthest,
    activeStreetIndex: Math.max(0, state.streets.length - 1),
    pickingBoard: state.phase === "cards" && state.deck?.kind === "board",
    editingBoard: false,
    replaceBoardIndex: null,
    boardDraft: state.deck?.kind === "board" ? [...state.deck.selected] : [],
    pickingShowdownSeat: state.deck?.kind === "showdown" ? (state.deck.seat ?? null) : null,
    heroCardsPromptSeen: state.heroCardsPromptSeen,
    showdownPromptSeen: state.showdownPromptSeen,
    seatHintSeen: state.seatHintSeen,
    tablePhase: state.phase,
  };
}
