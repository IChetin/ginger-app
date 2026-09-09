import type { HandAction, HandBlinds, HandData, HandStreet, StreetName } from "@/api/types/hands";
import { wizardAnteMode } from "@/features/hands/lib/anteMode";
import {
  boardSizeFor,
  boardSlot,
  boardStreetForIndex,
  nextStreet,
  STREET_ORDER,
} from "@/features/hands/lib/handSchema";
import {
  applyAction as engineApplyAction,
  applyBlindsAutofill,
  applyBoardAtIndex,
  blindsFromBb,
  buildHandData as engineBuildHandData,
  buildPartialData as engineBuildPartialData,
  buildSeats,
  clampSeat,
  clearFollowingActions,
  compositionFromHand,
  lineupChanged,
  emptyComposition,
  followingActionCount as engineFollowingActionCount,
  formatChipInput,
  heroProfit,
  inferBlindsManual,
  invalidStartingStackNames,
  isSeatMucked,
  isStreetComplete,
  lastReplayState,
  legalActions,
  livingSeats as engineLivingSeats,
  moveSeat,
  needsManualWinner,
  normalizeMuckedSeats,
  parseChipInput,
  pruneSeatNames,
  replaceAction as engineReplaceAction,
  resolveWinners,
  STACK_MUST_BE_POSITIVE,
  startingStackHint,
  stateBeforeAction as engineStateBeforeAction,
  streetActionCount,
  withMuckedSeats,
  withRecomputedWinners,
  type HandComposition,
  type TableSize,
} from "@/features/hands/lib/hand-engine";
import {
  defaultLineupSeats,
  occupiedAfterResize,
  withRequiredOccupied,
} from "@/features/hands/lib/positions";
import { commitSeatName } from "@/features/hands/lib/playerNames";

export type { TableSize };
export type { HandComposition };

export {
  blindsFromBb,
  buildSeats,
  formatChipInput,
  heroProfit,
  invalidStartingStackNames,
  isSeatMucked,
  needsManualWinner,
  normalizeMuckedSeats,
  parseChipInput,
  resolveWinners,
  STACK_MUST_BE_POSITIVE,
  startingStackHint,
  streetActionCount,
};

export type WizardStep = 1 | 2 | 3 | 4;

export interface WizardUi {
  step: WizardStep;
  /** Максимальный шаг, до которого доходили через «Дальше» (или при правке). */
  furthestStep: WizardStep;
  /** Which street the wizard is editing. Later streets keep their boards. */
  activeStreetIndex: number;
  pickingBoard: boolean;
  /** Правка борда текущей улицы (не выбор карт следующей). */
  editingBoard: boolean;
  /** Слот для замены одной карты; null — правка всего борда. */
  replaceBoardIndex: number | null;
  boardDraft: string[];
  pickingShowdownSeat: number | null;
  heroCardsPromptSeen?: boolean;
  showdownPromptSeen?: boolean;
  seatHintSeen?: boolean;
  tablePhase?: string;
}

export type WizardState = HandComposition & WizardUi;

export type WizardAction =
  | { type: "hydrate"; state: WizardState }
  | { type: "setStep"; step: WizardStep }
  | { type: "setTableSize"; size: TableSize }
  | { type: "toggleSeat"; seat: number }
  | { type: "setHero"; seat: number }
  | { type: "moveSeat"; from: number; to: number }
  | { type: "setBlinds"; blinds: Partial<HandBlinds> }
  | { type: "setStack"; seat: number; value: string }
  | { type: "setSeatName"; seat: number; name: string }
  | {
      type: "setLink";
      eventId: string | null;
      seriesId?: string | null;
      liveSessionId: string | null;
    }
  | { type: "toggleHeroCard"; card: string }
  | { type: "clearHeroCards" }
  | { type: "toggleBoardCard"; card: string }
  | { type: "confirmBoard" }
  | { type: "startEditBoard" }
  | { type: "startReplaceBoardCard"; index: number }
  | { type: "openBoardSlot"; index: number }
  | { type: "replaceBoardCard"; card: string }
  | { type: "commitBoardEdit" }
  | { type: "cancelBoardEdit" }
  | { type: "addAction"; action: HandAction }
  | { type: "replaceAction"; index: number; action: HandAction }
  | { type: "undo" }
  | { type: "goBack" }
  | { type: "advanceStreet" }
  | { type: "goToStreet"; street: StreetName }
  | { type: "setShowdownCards"; seat: number; cards: string[] }
  | { type: "pickingShowdown"; seat: number | null }
  | { type: "toggleShowdownCard"; card: string }
  | { type: "muckShowdown" }
  | { type: "muckSeat"; seat: number }
  | { type: "takePot"; seat: number }
  | { type: "toggleWinner"; seat: number }
  | { type: "setNote"; note: string }
  | { type: "setPublic"; value: boolean };

const emptyUi = (): WizardUi => ({
  step: 1,
  furthestStep: 1,
  activeStreetIndex: 0,
  pickingBoard: false,
  editingBoard: false,
  replaceBoardIndex: null,
  boardDraft: [],
  pickingShowdownSeat: null,
});

export function emptyWizard(): WizardState {
  const composition = emptyComposition();
  return {
    ...composition,
    occupied: defaultLineupSeats(
      composition.tableSize,
      composition.buttonSeat,
      composition.heroSeat,
    ),
    ...emptyUi(),
  };
}

function asPlayable(state: WizardState): WizardState {
  return { ...state, streets: playableStreets(state) };
}

export function buildPartialData(state: WizardState): HandData {
  return engineBuildPartialData(asPlayable(state));
}

export function livingSeats(state: WizardState): number[] {
  return engineLivingSeats(asPlayable(state));
}

export function streetClosed(state: WizardState): boolean {
  return isStreetComplete(asPlayable(state));
}

export function buildHandData(state: WizardState): HandData {
  return engineBuildHandData(state);
}

export function stackFieldValue(raw: string | undefined): string {
  if (!raw) return "";
  const parsed = parseChipInput(raw);
  return parsed != null ? formatChipInput(parsed) : raw;
}

export function stackFieldFontSize(value: string): number {
  const digits = value.replace(/\s/g, "").length;
  if (digits >= 8) return 10;
  if (digits >= 7) return 11;
  if (digits >= 6) return 12;
  return 13;
}

export function usedCards(state: WizardState): Set<string> {
  const used = new Set<string>();
  for (const card of state.heroCards) used.add(card);
  const currentIndex = currentStreetIndex(state);
  const pickingNext = state.pickingBoard ? nextStreet(currentStreet(state).street) : null;
  const editingIndex = state.editingBoard ? currentIndex : -1;
  const prefixLen = editingIndex >= 0 ? boardSizeFor(currentStreet(state).street) : 0;
  for (let index = 0; index < state.streets.length; index += 1) {
    const street = state.streets[index];
    if (!street) continue;
    if (pickingNext && street.street === pickingNext) continue;
    if (index === editingIndex) continue;
    const cards =
      editingIndex >= 0 && index > editingIndex ? street.board.slice(prefixLen) : street.board;
    for (const card of cards) used.add(card);
  }
  for (const card of state.boardDraft) used.add(card);
  for (const cards of Object.values(state.showdownCards)) {
    for (const card of cards) used.add(card);
  }
  return used;
}

function clampStreetIndex(index: number | undefined, length: number): number {
  const max = Math.max(0, length - 1);
  if (index == null || !Number.isInteger(index)) return max;
  return Math.min(Math.max(0, index), max);
}

export function currentStreetIndex(state: WizardState): number {
  return clampStreetIndex(state.activeStreetIndex, state.streets.length);
}

export function currentStreet(state: WizardState): HandStreet {
  return state.streets[currentStreetIndex(state)] ?? { street: "preflop", board: [], actions: [] };
}

export function playableStreets(state: WizardState): HandStreet[] {
  return state.streets.slice(0, currentStreetIndex(state) + 1);
}

function atStreetIndex(state: WizardState, index: number): WizardState {
  return {
    ...state,
    activeStreetIndex: index,
    pickingBoard: false,
    editingBoard: false,
    replaceBoardIndex: null,
  };
}

/** Дальняя улица, до которой можно дойти вперёд, не пропуская незакрытые торги. */
function forwardReachableIndex(state: WizardState): number {
  let index = currentStreetIndex(state);
  while (index < state.streets.length - 1) {
    const here = atStreetIndex(state, index);
    if (!streetClosed(here) || livingSeats(here).length < 2) break;
    const following = state.streets[index + 1];
    if (!following || following.board.length !== boardSizeFor(following.street)) break;
    index += 1;
  }
  return index;
}

function viewedStreet(state: WizardState): StreetName {
  if (state.pickingBoard) {
    return nextStreet(currentStreet(state).street) ?? currentStreet(state).street;
  }
  return currentStreet(state).street;
}

export type StreetTabState = "current" | "done" | "next" | "locked";

export interface StreetTab {
  street: StreetName;
  state: StreetTabState;
}

export function streetTabLockedHint(state: WizardState): string {
  const here = atStreetIndex(state, forwardReachableIndex(state));
  if (livingSeats(here).length < 2) return "Раздача закончилась раньше";
  return "Сначала завершите ставки на этой улице";
}

export function streetTabs(state: WizardState): StreetTab[] {
  const currentName = viewedStreet(state);
  const frontier = forwardReachableIndex(state);
  const frontierStreet = state.streets[frontier]?.street ?? "preflop";
  const here = atStreetIndex(state, frontier);
  const nextOpen =
    streetClosed(here) && livingSeats(here).length >= 2 ? nextStreet(frontierStreet) : null;
  return STREET_ORDER.map((street) => {
    if (street === currentName) return { street, state: "current" as const };
    const existing = state.streets.findIndex((item) => item.street === street);
    if (existing >= 0 && existing <= frontier) return { street, state: "done" as const };
    if (street === nextOpen) return { street, state: "next" as const };
    return { street, state: "locked" as const };
  });
}

export function canUndo(state: WizardState): boolean {
  if (state.pickingBoard || state.editingBoard) return true;
  if (currentStreet(state).actions.length > 0) return true;
  return currentStreetIndex(state) > 0;
}

export function isEditingAllBoard(state: WizardState): boolean {
  return state.editingBoard && state.replaceBoardIndex == null;
}

export function boardPickerNeed(state: WizardState): number {
  if (state.pickingBoard) {
    return boardSizeFor((nextStreet(currentStreet(state).street) ?? "flop") as StreetName);
  }
  if (state.editingBoard) return boardSizeFor(currentStreet(state).street);
  const current = currentStreet(state);
  if (current.street === "preflop") return 0;
  return boardSizeFor(current.street);
}

export function boardPickerIncomplete(state: WizardState): boolean {
  if (state.pickingBoard || isEditingAllBoard(state)) {
    return state.boardDraft.length !== boardPickerNeed(state);
  }
  const current = currentStreet(state);
  if (current.street === "preflop") return false;
  return current.board.length !== boardSizeFor(current.street);
}

export function followingActionCount(state: WizardState, actionIndex: number): number {
  return engineFollowingActionCount(state, actionIndex, currentStreetIndex(state));
}

export function stateBeforeAction(state: WizardState, actionIndex: number): WizardState {
  return engineStateBeforeAction(state, actionIndex, currentStreetIndex(state));
}

export function inferFurthestStep(state: {
  step: WizardStep;
  heroCards: string[];
  streets: HandStreet[];
  winnerSeats?: number[];
}): WizardStep {
  let furthest: WizardStep = state.step;
  if (state.heroCards.length === 2) furthest = Math.max(furthest, 2) as WizardStep;
  const progressed =
    state.streets.length > 1 ||
    state.streets.some((street) => street.actions.length > 0 || street.board.length > 0);
  if (progressed || state.step >= 3) furthest = Math.max(furthest, 3) as WizardStep;
  if (state.step === 4 || (progressed && (state.winnerSeats?.length ?? 0) > 0)) {
    furthest = 4;
  }
  return furthest;
}

function bumpFurthest(state: WizardState, step: WizardStep): WizardStep {
  return Math.max(state.furthestStep, step) as WizardStep;
}

function withStep(state: WizardState, step: WizardStep): WizardState {
  return { ...state, step, furthestStep: bumpFurthest(state, step) };
}

function hasWizardProgress(state: WizardState): boolean {
  return (
    state.streets.length > 1 ||
    state.pickingBoard ||
    state.editingBoard ||
    state.winnerSeats.length > 0 ||
    state.showdownMucked ||
    state.muckedSeats.length > 0 ||
    state.streets.some((street) => street.actions.length > 0 || street.board.length > 0) ||
    Object.values(state.showdownCards).some((cards) => cards.length > 0)
  );
}

function resetLaterProgress(state: WizardState): WizardState {
  if (!hasWizardProgress(state)) return state;
  return {
    ...state,
    streets: [{ street: "preflop", board: [], actions: [] }],
    activeStreetIndex: 0,
    pickingBoard: false,
    editingBoard: false,
    replaceBoardIndex: null,
    boardDraft: [],
    showdownCards: {},
    pickingShowdownSeat: null,
    showdownMucked: false,
    muckedSeats: [],
    winnerSeats: [],
    furthestStep: state.heroCards.length === 2 ? 2 : 1,
  };
}

function applyComposition(previous: WizardState, next: WizardState): WizardState {
  const names = pruneSeatNames(next.names, next.tableSize, next.heroSeat);
  if (lineupChanged(previous, next)) {
    return resetLaterProgress({ ...next, names });
  }
  return { ...next, names };
}

function clearBoardEdit(state: WizardState): WizardState {
  return {
    ...state,
    pickingBoard: false,
    editingBoard: false,
    replaceBoardIndex: null,
    boardDraft: [],
  };
}

function openBoardSlot(state: WizardState, index: number): WizardState {
  const slot = boardStreetForIndex(index);
  if (!slot || state.step < 3) return state;
  const next: WizardState = {
    ...state,
    step: 3,
    furthestStep: bumpFurthest(state, 3),
  };
  const existingIndex = next.streets.findIndex((street) => street.street === slot.street);
  const existing = existingIndex >= 0 ? next.streets[existingIndex] : undefined;
  if (existing && existing.board[index]) {
    return {
      ...next,
      activeStreetIndex: existingIndex,
      pickingBoard: false,
      editingBoard: true,
      replaceBoardIndex: index,
      boardDraft: [...existing.board],
    };
  }
  const current = currentStreet(next);
  const target = next.pickingBoard
    ? (nextStreet(current.street) ?? current.street)
    : nextStreet(current.street);
  if (target !== slot.street) return next;
  if (!next.pickingBoard && !streetClosed(next)) return next;
  const draft = next.pickingBoard
    ? next.boardDraft
    : existing && existing.board.length > 0
      ? [...existing.board]
      : [...current.board];
  return {
    ...next,
    pickingBoard: true,
    editingBoard: false,
    boardDraft: draft,
    replaceBoardIndex: draft[index] ? index : null,
  };
}

function focusCurrentStreetSlot(state: WizardState): number | null {
  if (!state.pickingBoard) return null;
  const target = nextStreet(currentStreet(state).street);
  if (!target || target === "flop") return null;
  const slot = boardSlot(target);
  if (!slot) return null;
  return state.boardDraft[slot.start] ? slot.start : null;
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "hydrate": {
      const next = action.state;
      const furthestStep = Math.max(
        typeof next.furthestStep === "number" ? next.furthestStep : 0,
        inferFurthestStep(next),
        next.step,
      ) as WizardStep;
      const muckedSeats = normalizeMuckedSeats(next);
      return {
        ...next,
        activeStreetIndex: clampStreetIndex(next.activeStreetIndex, next.streets.length),
        occupied: withRequiredOccupied(
          next.occupied,
          next.tableSize,
          next.buttonSeat,
          next.heroSeat,
        ),
        blindsManual: next.blindsManual ?? inferBlindsManual(next.blinds),
        blinds: { ...next.blinds, ante_mode: wizardAnteMode(next.blinds) },
        furthestStep,
        editingBoard: next.editingBoard ?? false,
        replaceBoardIndex: next.replaceBoardIndex ?? null,
        names: pruneSeatNames(next.names, next.tableSize, next.heroSeat),
        muckedSeats,
        showdownMucked: muckedSeats.length > 0,
      };
    }
    case "setStep":
      return withStep(state, action.step);
    case "setTableSize": {
      if (action.size === state.tableSize) return state;
      const heroSeat = clampSeat(state.heroSeat, action.size);
      const buttonSeat = clampSeat(state.buttonSeat, action.size);
      return applyComposition(state, {
        ...state,
        tableSize: action.size,
        occupied: occupiedAfterResize(state.occupied, action.size, buttonSeat, heroSeat),
        heroSeat,
        buttonSeat,
      });
    }
    case "toggleSeat": {
      const required = withRequiredOccupied([], state.tableSize, state.buttonSeat, state.heroSeat);
      if (required.includes(action.seat)) return state;
      const has = state.occupied.includes(action.seat);
      const occupied = has
        ? state.occupied.filter((seat) => seat !== action.seat)
        : [...state.occupied, action.seat].sort((a, b) => a - b);
      if (occupied.length < 2) return state;
      return applyComposition(state, { ...state, occupied });
    }
    case "setHero": {
      const heroSeat = clampSeat(action.seat, state.tableSize);
      if (heroSeat === state.heroSeat) return state;
      return applyComposition(state, {
        ...state,
        heroSeat,
        occupied: withRequiredOccupied(state.occupied, state.tableSize, state.buttonSeat, heroSeat),
      });
    }
    case "moveSeat":
      return moveSeat(state, action.from, action.to);
    case "setBlinds": {
      const { blinds, manual } = applyBlindsAutofill(
        state.blinds,
        action.blinds,
        state.blindsManual ?? inferBlindsManual(state.blinds),
      );
      if (
        blinds.sb === state.blinds.sb &&
        blinds.bb === state.blinds.bb &&
        blinds.ante === state.blinds.ante &&
        wizardAnteMode(blinds) === wizardAnteMode(state.blinds)
      ) {
        return state;
      }
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
    case "toggleHeroCard": {
      const has = state.heroCards.includes(action.card);
      if (has) {
        return withRecomputedWinners({
          ...state,
          heroCards: state.heroCards.filter((card) => card !== action.card),
        });
      }
      if (state.heroCards.length >= 2) return state;
      if (usedCards(state).has(action.card)) return state;
      return withRecomputedWinners({ ...state, heroCards: [...state.heroCards, action.card] });
    }
    case "clearHeroCards":
      return withRecomputedWinners({ ...state, heroCards: [] });
    case "toggleBoardCard": {
      if (state.replaceBoardIndex != null) return state;
      const need = boardPickerNeed(state);
      const has = state.boardDraft.includes(action.card);
      if (has) {
        return { ...state, boardDraft: state.boardDraft.filter((card) => card !== action.card) };
      }
      if (state.boardDraft.length >= need) return state;
      const locked = usedCards({ ...state, boardDraft: [] });
      if (locked.has(action.card)) return state;
      return { ...state, boardDraft: [...state.boardDraft, action.card] };
    }
    case "startEditBoard": {
      const current = currentStreet(state);
      if (current.street === "preflop") return state;
      return {
        ...state,
        pickingBoard: false,
        editingBoard: true,
        replaceBoardIndex: null,
        boardDraft: [...current.board],
      };
    }
    case "startReplaceBoardCard": {
      if (state.pickingBoard) {
        const need = boardPickerNeed(state);
        if (action.index < 0 || action.index >= need) return state;
        if (!state.boardDraft[action.index]) {
          return { ...state, replaceBoardIndex: null };
        }
        return { ...state, replaceBoardIndex: action.index };
      }
      const current = currentStreet(state);
      if (current.street === "preflop") return state;
      if (action.index < 0 || action.index >= current.board.length) return state;
      return {
        ...state,
        pickingBoard: false,
        editingBoard: true,
        replaceBoardIndex: action.index,
        boardDraft: [...current.board],
      };
    }
    case "openBoardSlot":
      return openBoardSlot(state, action.index);
    case "replaceBoardCard": {
      if (state.pickingBoard && state.replaceBoardIndex != null) {
        const index = state.replaceBoardIndex;
        const currentCard = state.boardDraft[index];
        if (currentCard == null) return { ...state, replaceBoardIndex: null };
        if (action.card === currentCard) {
          return { ...state, replaceBoardIndex: focusCurrentStreetSlot(state) };
        }
        const locked = usedCards({
          ...state,
          boardDraft: state.boardDraft.filter((_, cardIndex) => cardIndex !== index),
        });
        if (locked.has(action.card)) return state;
        const nextDraft = [...state.boardDraft];
        nextDraft[index] = action.card;
        return {
          ...state,
          boardDraft: nextDraft,
          replaceBoardIndex: focusCurrentStreetSlot({ ...state, boardDraft: nextDraft }),
        };
      }
      const index = state.replaceBoardIndex;
      const current = currentStreet(state);
      if (!state.editingBoard || index == null) return state;
      if (index < 0 || index >= current.board.length) return state;
      if (action.card === current.board[index]) return clearBoardEdit(state);
      const locked = usedCards({
        ...state,
        boardDraft: current.board.filter((_, cardIndex) => cardIndex !== index),
      });
      if (locked.has(action.card)) return state;
      const nextBoard = [...current.board];
      nextBoard[index] = action.card;
      return withRecomputedWinners({
        ...clearBoardEdit(state),
        streets: applyBoardAtIndex(state.streets, currentStreetIndex(state), nextBoard),
      });
    }
    case "commitBoardEdit": {
      if (!isEditingAllBoard(state)) return state;
      const need = boardPickerNeed(state);
      if (state.boardDraft.length !== need) return state;
      return withRecomputedWinners({
        ...clearBoardEdit(state),
        streets: applyBoardAtIndex(state.streets, currentStreetIndex(state), state.boardDraft),
      });
    }
    case "cancelBoardEdit":
      return clearBoardEdit(state);
    case "confirmBoard": {
      const from = currentStreet(state);
      const nxt = nextStreet(from.street);
      if (!nxt) return state;
      const need = boardSizeFor(nxt);
      if (state.boardDraft.length !== need) return state;
      const existingIndex = state.streets.findIndex((street) => street.street === nxt);
      if (existingIndex >= 0) {
        return withRecomputedWinners({
          ...clearBoardEdit(state),
          streets: applyBoardAtIndex(state.streets, existingIndex, state.boardDraft),
          activeStreetIndex: existingIndex,
        });
      }
      return withRecomputedWinners({
        ...clearBoardEdit(state),
        streets: [...state.streets, { street: nxt, board: state.boardDraft, actions: [] }],
        activeStreetIndex: state.streets.length,
      });
    }
    case "addAction":
      return engineApplyAction(state, action.action, currentStreetIndex(state));
    case "replaceAction":
      return engineReplaceAction(state, action.index, action.action, currentStreetIndex(state));
    case "undo": {
      if (state.editingBoard) {
        if (state.replaceBoardIndex != null) return clearBoardEdit(state);
        if (state.boardDraft.length > 0) {
          return { ...state, boardDraft: state.boardDraft.slice(0, -1) };
        }
        return clearBoardEdit(state);
      }
      if (state.pickingBoard) {
        if (state.replaceBoardIndex != null) {
          return { ...state, replaceBoardIndex: null };
        }
        if (state.boardDraft.length > currentStreet(state).board.length) {
          return { ...state, boardDraft: state.boardDraft.slice(0, -1) };
        }
        return { ...state, pickingBoard: false, boardDraft: [] };
      }
      const index = currentStreetIndex(state);
      const current = state.streets[index];
      if (current && current.actions.length > 0) {
        const streets = clearFollowingActions(
          state.streets.map((street, streetIndex) =>
            streetIndex === index ? { ...street, actions: street.actions.slice(0, -1) } : street,
          ),
          index,
        );
        return { ...state, streets };
      }
      if (index > 0) return { ...state, activeStreetIndex: index - 1 };
      return state;
    }
    case "goBack": {
      if (state.step !== 3) {
        const prev = (state.step - 1) as 1 | 2 | 3;
        return withStep(state, prev < 1 ? 1 : prev);
      }
      if (state.editingBoard) return clearBoardEdit(state);
      if (state.pickingBoard) {
        return { ...state, pickingBoard: false, boardDraft: [] };
      }
      const index = currentStreetIndex(state);
      if (index > 0) return { ...state, activeStreetIndex: index - 1 };
      return withStep(state, 2);
    }
    case "advanceStreet": {
      if (!streetClosed(state)) return state;
      const living = livingSeats(state);
      const current = currentStreet(state);
      if (living.length < 2 || current.street === "river") {
        return withRecomputedWinners(withStep(state, 4));
      }
      const nxt = nextStreet(current.street);
      if (!nxt) {
        return withRecomputedWinners(withStep(state, 4));
      }
      const existingIndex = state.streets.findIndex((street) => street.street === nxt);
      const existing = existingIndex >= 0 ? state.streets[existingIndex] : undefined;
      if (existing && existing.board.length === boardSizeFor(nxt)) {
        return { ...state, pickingBoard: false, activeStreetIndex: existingIndex };
      }
      return {
        ...state,
        pickingBoard: true,
        editingBoard: false,
        replaceBoardIndex: null,
        boardDraft:
          existing && existing.board.length > 0 ? [...existing.board] : [...current.board],
      };
    }
    case "goToStreet": {
      if (action.street === viewedStreet(state)) return state;
      const existing = state.streets.findIndex((street) => street.street === action.street);
      const frontier = forwardReachableIndex(state);
      if (existing >= 0 && existing <= frontier) {
        return { ...clearBoardEdit(state), activeStreetIndex: existing };
      }
      const from = state.streets[frontier];
      if (!from || nextStreet(from.street) !== action.street) return state;
      const origin = atStreetIndex(clearBoardEdit(state), frontier);
      if (!streetClosed(origin) || livingSeats(origin).length < 2) return state;
      return wizardReducer(origin, { type: "advanceStreet" });
    }
    case "setShowdownCards":
      return withRecomputedWinners(
        withMuckedSeats(
          {
            ...state,
            showdownCards: { ...state.showdownCards, [action.seat]: action.cards },
          },
          state.muckedSeats.filter((seat) => seat !== action.seat),
        ),
      );
    case "pickingShowdown":
      return { ...state, pickingShowdownSeat: action.seat };
    case "toggleShowdownCard": {
      const seat = state.pickingShowdownSeat;
      if (seat === null) return state;
      const current = state.showdownCards[seat] ?? [];
      const has = current.includes(action.card);
      const nextCards = has
        ? current.filter((card) => card !== action.card)
        : current.length >= 2
          ? current
          : [...current, action.card];
      if (!has && current.length >= 2) return state;
      if (!has) {
        const locked = new Set(usedCards(state));
        for (const card of current) locked.delete(card);
        if (locked.has(action.card)) return state;
      }
      return withRecomputedWinners(
        withMuckedSeats(
          {
            ...state,
            showdownCards: { ...state.showdownCards, [seat]: nextCards },
          },
          state.muckedSeats.filter((item) => item !== seat),
        ),
      );
    }
    case "muckShowdown": {
      const living = livingSeats(state);
      const mucked = living.filter(
        (seat) => seat !== state.heroSeat && (state.showdownCards[seat]?.length ?? 0) !== 2,
      );
      return withMuckedSeats({ ...state, pickingShowdownSeat: null, winnerSeats: [] }, mucked);
    }
    case "muckSeat": {
      if (action.seat === state.heroSeat) return state;
      return withMuckedSeats(
        {
          ...state,
          showdownCards: { ...state.showdownCards, [action.seat]: [] },
          pickingShowdownSeat:
            state.pickingShowdownSeat === action.seat ? null : state.pickingShowdownSeat,
          winnerSeats: [],
        },
        [...state.muckedSeats, action.seat],
      );
    }
    case "takePot":
      return {
        ...state,
        pickingShowdownSeat: null,
        winnerSeats: [action.seat],
      };
    case "toggleWinner": {
      const has = state.winnerSeats.includes(action.seat);
      const winnerSeats = has
        ? state.winnerSeats.filter((seat) => seat !== action.seat)
        : [...state.winnerSeats, action.seat];
      return {
        ...state,
        winnerSeats: winnerSeats.length ? winnerSeats : [action.seat],
      };
    }
    case "setNote":
      return { ...state, note: action.note };
    case "setPublic":
      return { ...state, isPublic: action.value };
    default:
      return state;
  }
}

export function wizardLegal(state: WizardState) {
  const last = lastReplayState(asPlayable(state));
  return { state: last, legal: legalActions(last) };
}

export function wizardPot(state: WizardState): number {
  try {
    return wizardLegal(state).state.pot;
  } catch {
    return 0;
  }
}

export function wizardBoardCards(state: WizardState): string[] {
  if (state.editingBoard || state.pickingBoard) return state.boardDraft;
  let longest: string[] = [];
  for (const street of state.streets) {
    if (street.board.length > longest.length) longest = street.board;
  }
  return longest;
}

export function highlightedBoardIndexes(state: WizardState): number[] {
  if (state.step !== 3) return [];
  const current = currentStreet(state);
  const street = state.pickingBoard
    ? (nextStreet(current.street) ?? current.street)
    : current.street;
  const slot = boardSlot(street);
  if (!slot) return [];
  return Array.from({ length: slot.count }, (_, offset) => slot.start + offset);
}

export function wizardFromHand(
  data: HandData,
  meta: {
    eventId: string | null;
    seriesId?: string | null;
    liveSessionId: string | null;
    note: string | null;
    isPublic: boolean;
  },
): WizardState {
  const composition = compositionFromHand(data, meta);
  return {
    ...composition,
    step: 1,
    furthestStep: 4,
    activeStreetIndex: Math.max(0, data.streets.length - 1),
    pickingBoard: false,
    editingBoard: false,
    replaceBoardIndex: null,
    boardDraft: [],
    pickingShowdownSeat: null,
  };
}
