import { describe, expect, it } from "vitest";

import {
  applyAction,
  canBet,
  emptyComposition,
  followingActionCount,
  getAvailableActions,
  isHandComplete,
  isStreetComplete,
  lastReplayState,
  livingSeats,
  replaceAction,
  setBoard,
  stateBeforeAction,
  undo,
  type HandComposition,
} from "@/features/hands/lib/hand-engine";

function hu(): HandComposition {
  return {
    ...emptyComposition(),
    tableSize: 2,
    occupied: [1, 2],
    heroSeat: 1,
    buttonSeat: 1,
    blinds: { sb: 500, bb: 1000, ante: 0 },
    streets: [{ street: "preflop", board: [], actions: [] }],
  };
}

function sixMaxDeadButton(): HandComposition {
  return {
    ...emptyComposition(),
    tableSize: 6,
    occupied: [1, 3, 4],
    heroSeat: 1,
    buttonSeat: 1,
    blinds: { sb: 1000, bb: 2000, ante: 2000, ante_mode: "bb" },
    streets: [{ street: "preflop", board: [], actions: [] }],
  };
}

describe("getAvailableActions", () => {
  it("offers fold/call/raise when facing a bet", () => {
    let state = hu();
    const open = getAvailableActions(state);
    expect(open.canFold).toBe(true);
    expect(open.canCall).toBe(true);
    expect(open.callAmount).toBe(500);
    expect(open.canRaise).toBe(true);
    expect(open.canCheck).toBe(false);
    expect(open.canBet).toBe(false);

    state = applyAction(state, { seat: 1, action: "call", amount: 1000 });
    const bb = getAvailableActions(state);
    expect(bb.canCheck).toBe(true);
    expect(bb.canRaise).toBe(true);
    expect(bb.canBet).toBe(false);
    expect(bb.canCall).toBe(false);
  });

  it("offers only fold/all-in when the stack cannot cover the call", () => {
    let state = hu();
    state = { ...state, stacks: { 1: "700" } };
    const legal = getAvailableActions(state);
    expect(legal.canCall).toBe(true);
    expect(legal.callAmount).toBe(200);
    expect(legal.maxBet).toBe(700);
    expect(legal.canRaise).toBe(false);
  });
});

describe("street and hand completion", () => {
  it("closes preflop after everyone acts and opens the next street via setBoard", () => {
    let state = hu();
    expect(isStreetComplete(state)).toBe(false);
    state = applyAction(state, { seat: 1, action: "call", amount: 1000 });
    expect(isStreetComplete(state)).toBe(false);
    state = applyAction(state, { seat: 2, action: "check" });
    expect(isStreetComplete(state)).toBe(true);
    expect(isHandComplete(state)).toBe(false);

    state = setBoard(state, "flop", ["Ks", "9h", "4d"]);
    expect(isStreetComplete(state)).toBe(false);
    expect(lastReplayState(state).street).toBe("flop");
    expect(lastReplayState(state).actorSeat).toBe(2);
  });

  it("completes the hand when only one player remains", () => {
    let state = hu();
    state = applyAction(state, { seat: 1, action: "fold" });
    expect(isStreetComplete(state)).toBe(true);
    expect(isHandComplete(state)).toBe(true);
    expect(livingSeats(state)).toEqual([2]);
  });
});

describe("pot with short-handed blinds and ante", () => {
  it("assigns SB/BB from occupied seats and posts BB-ante once", () => {
    const state = sixMaxDeadButton();
    const posted = lastReplayState(state);
    expect(posted.seats.map((seat) => seat.position)).toEqual(["BTN", "SB", "BB"]);
    expect(posted.pot).toBe(5000);
    expect(posted.currentBet).toBe(2000);
    expect(posted.seats.find((seat) => seat.position === "BB")?.invested).toBe(4000);
  });

  it("occupied ante posts from every sitting player", () => {
    const state: HandComposition = {
      ...sixMaxDeadButton(),
      blinds: { sb: 1000, bb: 2000, ante: 2000, ante_mode: "occupied" },
    };
    expect(lastReplayState(state).pot).toBe(9000);
  });
});

describe("all-in and canBet", () => {
  it("blocks betting when fewer than two players still have chips", () => {
    let state = hu();
    state = applyAction(state, { seat: 1, action: "allin", amount: 200_000 });
    state = applyAction(state, { seat: 2, action: "allin", amount: 200_000 });
    expect(canBet(state)).toBe(false);
    expect(getAvailableActions(state).canBet).toBe(false);
    expect(isStreetComplete(state)).toBe(true);
  });
});

describe("undo and cascade replace", () => {
  it("undoes the last action then the last street", () => {
    let state = hu();
    state = applyAction(state, { seat: 1, action: "call", amount: 1000 });
    state = applyAction(state, { seat: 2, action: "check" });
    state = setBoard(state, "flop", ["Ks", "9h", "4d"]);
    expect(state.streets).toHaveLength(2);

    state = undo(state);
    expect(state.streets).toHaveLength(1);
    expect(state.streets[0]?.actions).toHaveLength(2);

    state = undo(state);
    expect(state.streets[0]?.actions).toHaveLength(1);
    expect(state.streets[0]?.actions[0]?.action).toBe("call");
  });

  it("replaceAction drops later actions and followingActionCount reports them", () => {
    let state = hu();
    state = applyAction(state, { seat: 1, action: "raise", amount: 3000 });
    state = applyAction(state, { seat: 2, action: "call", amount: 3000 });
    expect(followingActionCount(state, 0)).toBe(1);

    const before = stateBeforeAction(state, 0);
    expect(before.streets[0]?.actions).toEqual([]);

    state = replaceAction(state, 0, { seat: 1, action: "fold" });
    expect(state.streets[0]?.actions).toEqual([{ seat: 1, action: "fold" }]);
  });
});
