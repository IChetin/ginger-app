import type { HandAction, StreetName } from "@/api/types/hands";
import { boardSizeFor, nextStreet } from "@/features/hands/lib/handSchema";
import {
  applyBoardAtIndex,
  buildPartialData,
  clearFollowingActions,
  currentStreetOf,
  followingActionCountAt,
  isStreetComplete,
  lastReplayState,
  livingSeats,
  stateBeforeActionAt,
  withRecomputedWinners,
} from "@/features/hands/lib/hand-engine/composition";
import { bettingPossible, legalActions } from "@/features/hands/lib/hand-engine/replay";
import type { HandComposition, LegalActions } from "@/features/hands/lib/hand-engine/types";

export { isStreetComplete };

export function getAvailableActions(state: HandComposition): LegalActions {
  try {
    return legalActions(lastReplayState(state));
  } catch {
    return {
      canFold: false,
      canCheck: false,
      canCall: false,
      canBet: false,
      canRaise: false,
      callAmount: 0,
      callTarget: 0,
      minBet: 1,
      maxBet: 0,
    };
  }
}

/** Торговля возможна, если ≥2 игроков со стеком > 0. */
export function canBet(state: HandComposition): boolean {
  try {
    return bettingPossible(lastReplayState(state).seats);
  } catch {
    return false;
  }
}

export function isHandComplete(state: HandComposition): boolean {
  if (!isStreetComplete(state)) return false;
  const living = livingSeats(state);
  if (living.length < 2) return true;
  const current = currentStreetOf(state);
  return current.street === "river";
}

export function applyAction<T extends HandComposition>(
  state: T,
  action: HandAction,
  streetIndex = state.streets.length - 1,
): T {
  const index = Math.max(0, Math.min(streetIndex, state.streets.length - 1));
  const streets = clearFollowingActions(
    state.streets.map((street, i) =>
      i === index ? { ...street, actions: [...street.actions, action] } : street,
    ),
    index,
  );
  return { ...state, streets };
}

export function replaceAction<T extends HandComposition>(
  state: T,
  actionIndex: number,
  action: HandAction,
  streetIndex = state.streets.length - 1,
): T {
  const street = state.streets[streetIndex];
  if (!street) return state;
  if (actionIndex < 0 || actionIndex >= street.actions.length) return state;
  const original = street.actions[actionIndex];
  if (original?.seat !== action.seat) return state;
  const streets = clearFollowingActions(
    state.streets.map((item, i) =>
      i === streetIndex
        ? { ...item, actions: [...item.actions.slice(0, actionIndex), action] }
        : item,
    ),
    streetIndex,
  );
  return { ...state, streets };
}

export function undo<T extends HandComposition>(state: T): T {
  const lastIndex = state.streets.length - 1;
  const current = state.streets[lastIndex];
  if (current && current.actions.length > 0) {
    const streets = clearFollowingActions(
      state.streets.map((street, i) =>
        i === lastIndex ? { ...street, actions: street.actions.slice(0, -1) } : street,
      ),
      lastIndex,
    );
    return { ...state, streets };
  }
  if (lastIndex > 0) {
    return { ...state, streets: state.streets.slice(0, lastIndex) };
  }
  return state;
}

export function followingActionCount(
  state: HandComposition,
  actionIndex: number,
  streetIndex = state.streets.length - 1,
): number {
  return followingActionCountAt(state, streetIndex, actionIndex);
}

export function stateBeforeAction<T extends HandComposition>(
  state: T,
  actionIndex: number,
  streetIndex = state.streets.length - 1,
): T {
  return stateBeforeActionAt(state, streetIndex, actionIndex);
}

export function setBoard<T extends HandComposition>(
  state: T,
  street: StreetName,
  cards: string[],
): T {
  if (street === "preflop") return state;
  const existingIndex = state.streets.findIndex((item) => item.street === street);
  if (existingIndex >= 0) {
    return withRecomputedWinners({
      ...state,
      streets: applyBoardAtIndex(state.streets, existingIndex, cards),
    });
  }
  const need = boardSizeFor(street);
  if (cards.length !== need) return state;
  return withRecomputedWinners({
    ...state,
    streets: [...state.streets, { street, board: cards, actions: [] }],
  });
}

export function advanceStreet<T extends HandComposition>(state: T): T {
  if (!isStreetComplete(state)) return state;
  const living = livingSeats(state);
  const current = currentStreetOf(state);
  if (living.length < 2 || current.street === "river") {
    return withRecomputedWinners(state);
  }
  const nxt = nextStreet(current.street);
  if (!nxt) return withRecomputedWinners(state);
  const existingIndex = state.streets.findIndex((item) => item.street === nxt);
  if (existingIndex >= 0) return state;
  return {
    ...state,
    streets: [...state.streets, { street: nxt, board: [], actions: [] }],
  };
}

export function compositionLegal(state: HandComposition) {
  const last = lastReplayState(state);
  return { state: last, legal: legalActions(last), data: buildPartialData(state) };
}
