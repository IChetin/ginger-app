import { describe, expect, it } from "vitest";

import type { HandData } from "@/api/types/hands";
import { step1Schema } from "@/features/hands/lib/handSchema";
import { requiredSeats } from "@/features/hands/lib/positions";
import { chipsFromBb } from "@/features/hands/lib/stackDisplay";
import {
  buildHandData,
  buildSeats,
  canUndo,
  currentStreet,
  emptyWizard,
  followingActionCount,
  formatChipInput,
  heroProfit,
  highlightedBoardIndexes,
  inferFurthestStep,
  invalidStartingStackNames,
  parseChipInput,
  resolveWinners,
  STACK_MUST_BE_POSITIVE,
  stackFieldFontSize,
  stackFieldValue,
  startingStackHint,
  streetActionCount,
  streetClosed,
  streetTabLockedHint,
  streetTabs,
  wizardBoardCards,
  wizardLegal,
  wizardPot,
  wizardReducer,
  wizardFromHand,
  type WizardState,
} from "@/features/hands/lib/wizardState";

describe("wizard occupied seats", () => {
  it("starts with hero, SB and BB seated", () => {
    const state = emptyWizard();
    expect(state.tableSize).toBe(6);
    expect(state.occupied).toEqual([1, 2, 3]);
    expect(requiredSeats(6, 1, 1)).toEqual([1, 3]);
  });

  it("tap adds a participant, tap again removes", () => {
    let state = emptyWizard();
    state = wizardReducer(state, { type: "toggleSeat", seat: 5 });
    expect(state.occupied).toEqual([1, 2, 3, 5]);
    state = wizardReducer(state, { type: "toggleSeat", seat: 5 });
    expect(state.occupied).toEqual([1, 2, 3]);
  });

  it("cannot unmark the hero or BB; SB can be unmarked", () => {
    let state = emptyWizard();
    state = wizardReducer(state, { type: "toggleSeat", seat: 1 });
    expect(state.occupied).toEqual([1, 2, 3]);
    state = wizardReducer(state, { type: "toggleSeat", seat: 3 });
    expect(state.occupied).toEqual([1, 2, 3]);
    state = wizardReducer(state, { type: "toggleSeat", seat: 2 });
    expect(state.occupied).toEqual([1, 3]);
  });

  it("changing table size keeps seated players that still fit", () => {
    let state = emptyWizard();
    state = wizardReducer(state, { type: "toggleSeat", seat: 2 });
    state = wizardReducer(state, { type: "toggleSeat", seat: 5 });
    expect(state.occupied).toEqual([1, 3, 5]);
    state = wizardReducer(state, { type: "setTableSize", size: 9 });
    expect(state.occupied).toEqual([1, 3, 5]);
    state = wizardReducer(state, { type: "setTableSize", size: 4 });
    expect(state.occupied).toEqual([1, 3]);
  });

  it("clamps hero and button when shrinking the table", () => {
    let state = emptyWizard();
    state = wizardReducer(state, { type: "setTableSize", size: 9 });
    state = wizardReducer(state, { type: "setHero", seat: 8 });
    expect(state.heroSeat).toBe(8);
    state = wizardReducer(state, { type: "setTableSize", size: 6 });
    expect(state.heroSeat).toBe(1);
    expect(state.buttonSeat).toBe(1);
    expect(state.occupied).toEqual([1, 2, 3]);
  });

  it("heads-up table shows BTN/SB and BB only", () => {
    let state = emptyWizard();
    state = wizardReducer(state, { type: "setTableSize", size: 2 });
    expect(state.occupied).toEqual([1, 2]);
    expect(requiredSeats(2, 1, 1)).toEqual([1, 2]);
    state = wizardReducer(state, { type: "toggleSeat", seat: 1 });
    state = wizardReducer(state, { type: "toggleSeat", seat: 2 });
    expect(state.occupied).toEqual([1, 2]);
  });

  it("moving the hero adds that seat without dropping blinds", () => {
    let state = emptyWizard();
    state = wizardReducer(state, { type: "toggleSeat", seat: 5 });
    expect(state.occupied).toEqual([1, 2, 3, 5]);
    state = wizardReducer(state, { type: "setHero", seat: 5 });
    expect(state.heroSeat).toBe(5);
    expect(state.occupied).toEqual([1, 2, 3, 5]);
  });

  it("assigns 3-max and 5-max positions from the button", () => {
    let three = emptyWizard();
    three = wizardReducer(three, { type: "setTableSize", size: 3 });
    expect(buildSeats(three).map((seat) => [seat.seat, seat.position])).toEqual([
      [1, "BTN"],
      [2, "SB"],
      [3, "BB"],
    ]);
    let five = emptyWizard();
    five = wizardReducer(five, { type: "setTableSize", size: 5 });
    five = wizardReducer(five, { type: "toggleSeat", seat: 4 });
    five = wizardReducer(five, { type: "toggleSeat", seat: 5 });
    expect(buildSeats(five).map((seat) => [seat.seat, seat.position])).toEqual([
      [1, "BTN"],
      [2, "SB"],
      [3, "BB"],
      [4, "UTG"],
      [5, "CO"],
    ]);
  });

  it("step1 schema requires BB and at least two players", () => {
    const blinds = { sb: 1000, bb: 2000, ante: 2000 };
    expect(
      step1Schema.safeParse({
        occupied: [4, 8, 9],
        heroSeat: 1,
        tableSize: 9,
        buttonSeat: 1,
        blinds,
      }).success,
    ).toBe(false);
    expect(
      step1Schema.safeParse({
        occupied: [1, 3],
        heroSeat: 1,
        tableSize: 9,
        buttonSeat: 1,
        blinds,
      }).success,
    ).toBe(true);
    expect(
      step1Schema.safeParse({
        occupied: [1, 2, 3],
        heroSeat: 1,
        tableSize: 3,
        buttonSeat: 1,
        blinds,
      }).success,
    ).toBe(true);
  });
});

describe("wizard seat names", () => {
  it("stores a custom opponent name and reverts empty to Игрок N", () => {
    let state = emptyWizard();
    state = wizardReducer(state, { type: "setSeatName", seat: 2, name: "  Рег из Минска  " });
    expect(buildSeats(state).find((seat) => seat.seat === 2)?.name).toBe("Рег из Минска");
    state = wizardReducer(state, { type: "setSeatName", seat: 2, name: "   " });
    expect(state.names[2]).toBeUndefined();
    expect(buildSeats(state).find((seat) => seat.seat === 2)?.name).toBe("Игрок 2");
  });

  it("does not rename the hero", () => {
    let state = emptyWizard();
    state = wizardReducer(state, { type: "setSeatName", seat: 1, name: "Не я" });
    expect(buildSeats(state).find((seat) => seat.seat === 1)?.name).toBe("Вы");
    expect(state.names[1]).toBeUndefined();
  });

  it("loads custom names from a published hand", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 9,
      blinds: { sb: 1000, bb: 2000, ante: 0, ante_mode: "bb" },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 100000, is_hero: true, cards: ["As", "Kd"] },
        { seat: 2, position: "SB", name: "Дед в кепке", stack: 100000 },
        { seat: 3, position: "BB", name: "Игрок 3", stack: 100000 },
      ],
      streets: [{ street: "preflop", board: [], actions: [] }],
      result: { winner_seats: [3], pot: 0, hero_invested: 0, hero_profit: 0, side_pots: null },
    };
    const state = wizardFromHand(data, {
      eventId: null,
      liveSessionId: null,
      note: null,
      isPublic: true,
    });
    expect(state.names[2]).toBe("Дед в кепке");
    expect(state.names[3]).toBeUndefined();
    expect(buildSeats(state).map((seat) => seat.name)).toEqual(["Вы", "Дед в кепке", "Игрок 3"]);
  });
});

describe("wizard ante modes", () => {
  it("defaults to BB-ante and can switch to occupied or no ante", () => {
    let state = emptyWizard();
    expect(state.blinds.ante_mode).toBe("bb");
    expect(wizardLegal(state).state.pot).toBe(5_000);
    state = wizardReducer(state, { type: "setBlinds", blinds: { ante_mode: "occupied" } });
    expect(state.blinds.ante_mode).toBe("occupied");
    expect(wizardLegal(state).state.pot).toBe(9_000);
    state = wizardReducer(state, { type: "setBlinds", blinds: { ante: 0 } });
    expect(state.blinds).toMatchObject({ sb: 0, bb: 0, ante: 0 });
    expect(wizardPot(state)).toBe(0);
  });

  it("hydrates a draft without ante_mode as BB-ante", () => {
    const draft = {
      ...emptyWizard(),
      blinds: { sb: 1000, bb: 2000, ante: 2000 },
    };
    const next = wizardReducer(emptyWizard(), { type: "hydrate", state: draft });
    expect(next.blinds.ante_mode).toBe("bb");
    expect(wizardLegal(next).state.pot).toBe(5_000);
  });

  it("loads an old published hand without ante_mode as occupied", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 9,
      blinds: { sb: 1000, bb: 2000, ante: 2000 },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 100000, is_hero: true, cards: ["As", "Kd"] },
        { seat: 2, position: "SB", name: "SB", stack: 100000 },
        { seat: 3, position: "BB", name: "BB", stack: 100000 },
      ],
      streets: [{ street: "preflop", board: [], actions: [] }],
      result: { winner_seats: [3], pot: 0, hero_invested: 0, hero_profit: 0, side_pots: null },
    };
    const state = wizardFromHand(data, {
      eventId: null,
      liveSessionId: null,
      note: null,
      isPublic: true,
    });
    expect(state.blinds.ante_mode).toBe("occupied");
    expect(wizardLegal(state).state.pot).toBe(9_000);
  });

  it("changing ante mode keeps later actions and recalculates the pot", () => {
    let state = playing({
      streets: [{ street: "preflop", board: [], actions: [{ seat: 1, action: "fold" }] }],
    });
    expect(currentStreet(state).actions).toHaveLength(1);
    const potBefore = wizardLegal(state).state.pot;
    state = wizardReducer(state, { type: "setBlinds", blinds: { ante_mode: "occupied" } });
    expect(currentStreet(state).actions).toEqual([{ seat: 1, action: "fold" }]);
    expect(wizardLegal(state).state.pot).not.toBe(potBefore);
  });
});

describe("stack field", () => {
  it("formats seven-digit stacks with separators", () => {
    expect(stackFieldValue("2000000")).toBe(formatChipInput(2_000_000));
    expect(stackFieldFontSize(formatChipInput(2_000_000))).toBeLessThan(13);
  });

  it("shrinks font for 6–7 digit stacks instead of overflowing", () => {
    expect(stackFieldFontSize(formatChipInput(200_000))).toBeLessThanOrEqual(12);
    expect(stackFieldFontSize(formatChipInput(2_000_000))).toBeLessThanOrEqual(11);
    expect(stackFieldFontSize(formatChipInput(20_000_000))).toBeLessThanOrEqual(10);
  });

  it("keeps stacks in chips when the BB changes", () => {
    let state = emptyWizard();
    state = wizardReducer(state, {
      type: "setStack",
      seat: 1,
      value: formatChipInput(chipsFromBb(25, state.blinds.bb)),
    });
    expect(buildHandData(state).seats.find((seat) => seat.seat === 1)?.stack).toBe(50_000);
    state = wizardReducer(state, { type: "setBlinds", blinds: { bb: 4000 } });
    expect(buildHandData(state).seats.find((seat) => seat.seat === 1)?.stack).toBe(50_000);
  });

  it("keeps SB, BB and ante linked no matter which field was edited last", () => {
    let state = emptyWizard();
    expect(state.blinds).toMatchObject({ sb: 1000, bb: 2000, ante: 2000 });
    state = wizardReducer(state, { type: "setBlinds", blinds: { bb: 3000 } });
    expect(state.blinds).toMatchObject({ sb: 1500, bb: 3000, ante: 3000 });
    state = wizardReducer(state, { type: "setBlinds", blinds: { bb: 2500 } });
    expect(state.blinds).toMatchObject({ sb: 1250, bb: 2500, ante: 2500 });
    state = wizardReducer(state, { type: "setBlinds", blinds: { bb: 25 } });
    expect(state.blinds).toMatchObject({ sb: 13, bb: 25, ante: 25 });
    state = wizardReducer(state, { type: "setBlinds", blinds: { sb: 1000 } });
    expect(state.blinds).toMatchObject({ sb: 1000, bb: 2000, ante: 2000 });
    state = wizardReducer(state, { type: "setBlinds", blinds: { ante: 0 } });
    expect(state.blinds).toMatchObject({ sb: 0, bb: 0, ante: 0 });
    state = wizardReducer(state, { type: "setBlinds", blinds: { bb: 0 } });
    expect(state.blinds).toMatchObject({ sb: 0, bb: 0, ante: 0 });

    state = emptyWizard();
    state = wizardReducer(state, { type: "setBlinds", blinds: { sb: 400 } });
    expect(state.blinds).toMatchObject({ sb: 400, bb: 800, ante: 800 });
  });

  it("recalculates SB and BB from ante, then the others from BB", () => {
    let state = emptyWizard();
    state = wizardReducer(state, { type: "setBlinds", blinds: { bb: 200 } });
    expect(state.blinds).toMatchObject({ sb: 100, bb: 200, ante: 200 });
    state = wizardReducer(state, { type: "setBlinds", blinds: { ante: 300 } });
    expect(state.blinds).toMatchObject({ sb: 150, bb: 300, ante: 300 });
    state = wizardReducer(state, { type: "setBlinds", blinds: { bb: 400 } });
    expect(state.blinds).toMatchObject({ sb: 200, bb: 400, ante: 400 });
    expect(state.blindsManual).toMatchObject({ sb: false, bb: true, ante: false });
  });

  it("treats empty stacks as 100 BB and zero as invalid", () => {
    const empty = emptyWizard();
    expect(invalidStartingStackNames(empty)).toEqual([]);
    expect(startingStackHint([])).toBeNull();
    expect(parseChipInput("")).toBeNull();
    expect(parseChipInput("0")).toBe(0);
    expect(parseChipInput("-1000")).toBe(-1000);
    expect(buildHandData(empty).seats.every((seat) => seat.stack === 200_000)).toBe(true);

    let state = wizardReducer(empty, { type: "setStack", seat: 2, value: "0" });
    expect(invalidStartingStackNames(state)).toEqual(["Игрок 2"]);
    expect(startingStackHint(invalidStartingStackNames(state))).toBe(
      `${STACK_MUST_BE_POSITIVE}: Игрок 2`,
    );

    state = wizardReducer(state, { type: "setStack", seat: 1, value: formatChipInput(1_000) });
    expect(invalidStartingStackNames(state)).toEqual(["Игрок 2"]);
    expect(buildHandData(state).seats.find((seat) => seat.seat === 1)?.stack).toBe(1_000);

    state = wizardReducer(empty, { type: "setStack", seat: 3, value: formatChipInput(-500) });
    expect(invalidStartingStackNames(state)).toEqual(["Игрок 3"]);
  });
});

function playing(overrides: Partial<WizardState> = {}): WizardState {
  return {
    ...emptyWizard(),
    step: 3,
    furthestStep: 3,
    occupied: [1, 2, 3],
    heroCards: ["As", "Kd"],
    ...overrides,
  };
}

describe("wizard action undo and edit", () => {
  it("undoes the last action and recalculates pot and actor", () => {
    let state = playing();
    expect(canUndo(state)).toBe(false);
    expect(wizardLegal(state).state.pot).toBe(5_000);
    expect(wizardLegal(state).state.actorSeat).toBe(1);
    state = wizardReducer(state, {
      type: "addAction",
      action: { seat: 1, action: "raise", amount: 6000 },
    });
    expect(canUndo(state)).toBe(true);
    expect(wizardLegal(state).state.pot).toBe(11_000);
    expect(wizardLegal(state).state.actorSeat).toBe(2);
    state = wizardReducer(state, { type: "undo" });
    expect(currentStreet(state).actions).toEqual([]);
    expect(wizardLegal(state).state.pot).toBe(5_000);
    expect(wizardLegal(state).state.actorSeat).toBe(1);
  });

  it("replaceAction drops later actions and keeps later boards", () => {
    let state = playing({
      tableSize: 9,
      occupied: [1, 2, 3, 7],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 7, action: "call", amount: 2000 },
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        {
          street: "flop",
          board: ["Ks", "9h", "4d"],
          actions: [
            { seat: 2, action: "check" },
            { seat: 3, action: "bet", amount: 4000 },
          ],
        },
      ],
      activeStreetIndex: 0,
    });
    expect(followingActionCount(state, 0)).toBe(5);
    state = wizardReducer(state, {
      type: "replaceAction",
      index: 0,
      action: { seat: 7, action: "fold" },
    });
    expect(state.streets[0]?.actions).toEqual([{ seat: 7, action: "fold" }]);
    expect(state.streets[1]?.board).toEqual(["Ks", "9h", "4d"]);
    expect(state.streets[1]?.actions).toEqual([]);
    expect(wizardLegal(state).state.actorSeat).toBe(1);
  });

  it("goBack from flop returns to preflop actions and keeps the board", () => {
    const flop = playing({
      occupied: [1, 2, 3],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [{ seat: 2, action: "check" }] },
      ],
      activeStreetIndex: 1,
    });
    const back = wizardReducer(flop, { type: "goBack" });
    expect(currentStreet(back).street).toBe("preflop");
    expect(currentStreet(back).actions).toHaveLength(3);
    expect(back.streets[1]?.board).toEqual(["Ks", "9h", "4d"]);
    expect(back.streets[1]?.actions).toHaveLength(1);
  });

  it("undo at the start of a street steps back to the previous street", () => {
    const state = playing({
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
      ],
      activeStreetIndex: 1,
    });
    const next = wizardReducer(state, { type: "undo" });
    expect(currentStreet(next).street).toBe("preflop");
    expect(next.streets[1]?.board).toEqual(["Ks", "9h", "4d"]);
  });

  it("advanceStreet reuses a stored flop board", () => {
    const state = playing({
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
      ],
      activeStreetIndex: 0,
    });
    const next = wizardReducer(state, { type: "advanceStreet" });
    expect(next.pickingBoard).toBe(false);
    expect(currentStreet(next).street).toBe("flop");
    expect(currentStreet(next).board).toEqual(["Ks", "9h", "4d"]);
  });
});

const CLOSED_PREFLOP = {
  street: "preflop" as const,
  board: [] as string[],
  actions: [
    { seat: 1, action: "call" as const, amount: 2000 },
    { seat: 2, action: "call" as const, amount: 2000 },
    { seat: 3, action: "check" as const },
  ],
};

const FLOP_STREET = {
  street: "flop" as const,
  board: ["Ks", "9h", "4d"],
  actions: [
    { seat: 2, action: "check" as const },
    { seat: 3, action: "bet" as const, amount: 4000 },
  ],
};

describe("wizard street tabs", () => {
  it("marks later streets locked until betting on the current street is closed", () => {
    const state = playing();
    expect(streetTabs(state)).toEqual([
      { street: "preflop", state: "current" },
      { street: "flop", state: "locked" },
      { street: "turn", state: "locked" },
      { street: "river", state: "locked" },
    ]);
    expect(streetTabLockedHint(state)).toBe("Сначала завершите ставки на этой улице");
  });

  it("opens the flop tab as next when preflop betting is closed", () => {
    const state = playing({ streets: [CLOSED_PREFLOP] });
    expect(streetTabs(state)).toEqual([
      { street: "preflop", state: "current" },
      { street: "flop", state: "next" },
      { street: "turn", state: "locked" },
      { street: "river", state: "locked" },
    ]);
  });

  it("keeps a stored flop reachable after going back to preflop", () => {
    const state = playing({
      streets: [CLOSED_PREFLOP, FLOP_STREET],
      activeStreetIndex: 0,
    });
    expect(streetTabs(state)).toEqual([
      { street: "preflop", state: "current" },
      { street: "flop", state: "done" },
      { street: "turn", state: "locked" },
      { street: "river", state: "locked" },
    ]);
  });

  it("locks later streets when the hand already ended", () => {
    const state = playing({
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "fold" },
            { seat: 2, action: "fold" },
          ],
        },
      ],
    });
    expect(streetTabs(state).map((tab) => tab.state)).toEqual([
      "current",
      "locked",
      "locked",
      "locked",
    ]);
    expect(streetTabLockedHint(state)).toBe("Раздача закончилась раньше");
  });

  it("treats the street being picked as current", () => {
    const state = playing({ streets: [CLOSED_PREFLOP], pickingBoard: true });
    expect(streetTabs(state)).toEqual([
      { street: "preflop", state: "done" },
      { street: "flop", state: "current" },
      { street: "turn", state: "locked" },
      { street: "river", state: "locked" },
    ]);
  });

  it("goToStreet back to preflop keeps later boards and actions", () => {
    const flop = playing({
      streets: [CLOSED_PREFLOP, FLOP_STREET],
      activeStreetIndex: 1,
    });
    const back = wizardReducer(flop, { type: "goToStreet", street: "preflop" });
    expect(currentStreet(back).street).toBe("preflop");
    expect(back.streets[1]?.board).toEqual(["Ks", "9h", "4d"]);
    expect(back.streets[1]?.actions).toHaveLength(2);
    expect(back.pickingBoard).toBe(false);
  });

  it("goToStreet to a missing flop opens the board picker", () => {
    const state = playing({ streets: [CLOSED_PREFLOP] });
    const next = wizardReducer(state, { type: "goToStreet", street: "flop" });
    expect(next.pickingBoard).toBe(true);
    expect(currentStreet(next).street).toBe("preflop");
  });

  it("goToStreet reuses a stored flop board", () => {
    const state = playing({
      streets: [CLOSED_PREFLOP, { street: "flop", board: ["Ks", "9h", "4d"], actions: [] }],
      activeStreetIndex: 0,
    });
    const next = wizardReducer(state, { type: "goToStreet", street: "flop" });
    expect(next.pickingBoard).toBe(false);
    expect(currentStreet(next).street).toBe("flop");
    expect(currentStreet(next).board).toEqual(["Ks", "9h", "4d"]);
  });

  it("goToStreet to an unreachable street is a no-op", () => {
    const state = playing();
    expect(wizardReducer(state, { type: "goToStreet", street: "flop" })).toBe(state);
    expect(wizardReducer(state, { type: "goToStreet", street: "turn" })).toBe(state);
    const folded = playing({
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "fold" },
            { seat: 2, action: "fold" },
          ],
        },
      ],
    });
    expect(wizardReducer(folded, { type: "goToStreet", street: "flop" })).toBe(folded);
  });
});

describe("wizard step navigation progress", () => {
  it("setStep raises furthestStep but going back does not lower it", () => {
    let state = emptyWizard();
    expect(state.furthestStep).toBe(1);
    state = wizardReducer(state, { type: "setStep", step: 2 });
    state = wizardReducer(state, { type: "setStep", step: 3 });
    expect(state.furthestStep).toBe(3);
    state = wizardReducer(state, { type: "setStep", step: 1 });
    expect(state.step).toBe(1);
    expect(state.furthestStep).toBe(3);
  });

  it("changing the lineup wipes actions and drops furthestStep", () => {
    let state = playing({
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "fold" },
            { seat: 2, action: "fold" },
          ],
        },
      ],
    });
    expect(streetActionCount(state)).toBe(2);
    state = wizardReducer(state, { type: "toggleSeat", seat: 5 });
    expect(state.occupied).toContain(5);
    expect(streetActionCount(state)).toBe(0);
    expect(state.streets).toEqual([{ street: "preflop", board: [], actions: [] }]);
    expect(state.furthestStep).toBe(2);
  });

  it("changing stacks does not wipe actions", () => {
    let state = playing({
      streets: [{ street: "preflop", board: [], actions: [{ seat: 1, action: "fold" }] }],
    });
    state = wizardReducer(state, { type: "setStack", seat: 1, value: "200000" });
    expect(streetActionCount(state)).toBe(1);
    expect(state.furthestStep).toBe(3);
  });

  it("hydrate infers furthestStep for old drafts without the field", () => {
    const draft = playing({
      step: 1,
      streets: [{ street: "preflop", board: [], actions: [{ seat: 1, action: "fold" }] }],
    });
    const { furthestStep: _drop, ...rest } = draft;
    void _drop;
    expect(inferFurthestStep(rest)).toBe(3);
    const next = wizardReducer(emptyWizard(), {
      type: "hydrate",
      state: rest as WizardState,
    });
    expect(next.furthestStep).toBe(3);
    expect(streetActionCount(next)).toBe(1);
  });
});

describe("wizard board card edits", () => {
  function riverShowdown(): WizardState {
    const checks = (seats: number[]) => seats.map((seat) => ({ seat, action: "check" as const }));
    return {
      ...emptyWizard(),
      step: 3,
      furthestStep: 4,
      occupied: [1, 2, 3],
      heroCards: ["As", "Ah"],
      showdownCards: { 2: ["Ks", "Kh"], 3: ["7c", "8d"] },
      winnerSeats: [1],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        { street: "flop", board: ["Ad", "2c", "3d"], actions: checks([2, 3, 1]) },
        { street: "turn", board: ["Ad", "2c", "3d", "9s"], actions: checks([2, 3, 1]) },
        { street: "river", board: ["Ad", "2c", "3d", "9s", "4h"], actions: checks([2, 3, 1]) },
      ],
      activeStreetIndex: 3,
    };
  }

  it("replaces a board card, keeps actions, and flips the winner", () => {
    let state = riverShowdown();
    expect(buildHandData(state).result.winner_seats).toEqual([1]);
    const flopActions = state.streets[1]?.actions.length;
    state = wizardReducer(state, { type: "startReplaceBoardCard", index: 0 });
    state = wizardReducer(state, { type: "replaceBoardCard", card: "Kd" });
    expect(state.editingBoard).toBe(false);
    expect(state.streets[3]?.board).toEqual(["Kd", "2c", "3d", "9s", "4h"]);
    expect(state.streets[1]?.board).toEqual(["Kd", "2c", "3d"]);
    expect(state.streets[1]?.actions).toHaveLength(flopActions ?? 0);
    expect(state.streets[3]?.actions).toHaveLength(3);
    expect(buildHandData(state).result.winner_seats).toEqual([2]);
  });

  it("does not commit an incomplete flop", () => {
    let state = playing({
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        {
          street: "flop",
          board: ["Ks", "9h", "4d"],
          actions: [{ seat: 2, action: "check" }],
        },
      ],
      activeStreetIndex: 1,
    });
    state = wizardReducer(state, { type: "startEditBoard" });
    state = wizardReducer(state, { type: "toggleBoardCard", card: "4d" });
    expect(state.boardDraft).toEqual(["Ks", "9h"]);
    const next = wizardReducer(state, { type: "commitBoardEdit" });
    expect(next.boardDraft).toEqual(["Ks", "9h"]);
    expect(next.streets[1]?.board).toEqual(["Ks", "9h", "4d"]);
    expect(next.streets[1]?.actions).toHaveLength(1);
  });

  it("keeps street actions when changing hero cards", () => {
    let state = playing({
      streets: [{ street: "preflop", board: [], actions: [{ seat: 1, action: "fold" }] }],
    });
    state = wizardReducer(state, { type: "toggleHeroCard", card: "As" });
    state = wizardReducer(state, { type: "toggleHeroCard", card: "Qs" });
    expect(state.heroCards).toEqual(["Kd", "Qs"]);
    expect(currentStreet(state).actions).toEqual([{ seat: 1, action: "fold" }]);
  });

  it("replaces a previous board card while picking the next street", () => {
    let state = playing({
      pickingBoard: true,
      boardDraft: ["Ks", "9h", "4d"],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        {
          street: "flop",
          board: ["Ks", "9h", "4d"],
          actions: [
            { seat: 2, action: "check" },
            { seat: 3, action: "check" },
            { seat: 1, action: "check" },
          ],
        },
      ],
      activeStreetIndex: 1,
    });
    state = wizardReducer(state, { type: "startReplaceBoardCard", index: 1 });
    expect(state.pickingBoard).toBe(true);
    expect(state.replaceBoardIndex).toBe(1);
    state = wizardReducer(state, { type: "replaceBoardCard", card: "Qs" });
    expect(state.pickingBoard).toBe(true);
    expect(state.replaceBoardIndex).toBeNull();
    expect(state.boardDraft).toEqual(["Ks", "Qs", "4d"]);
  });

  it("opens a flop card from the result step", () => {
    let state: WizardState = { ...riverShowdown(), step: 4, furthestStep: 4 };
    expect(highlightedBoardIndexes(state)).toEqual([]);
    state = wizardReducer(state, { type: "openBoardSlot", index: 0 });
    expect(state.step).toBe(3);
    expect(currentStreet(state).street).toBe("flop");
    expect(state.editingBoard).toBe(true);
    expect(state.replaceBoardIndex).toBe(0);
    expect(state.boardDraft).toEqual(["Ad", "2c", "3d"]);
    expect(highlightedBoardIndexes(state)).toEqual([0, 1, 2]);
  });

  it("does not highlight the board strip on preflop", () => {
    expect(highlightedBoardIndexes(playing())).toEqual([]);
  });

  it("highlights flop slots while picking the flop", () => {
    const state = playing({
      pickingBoard: true,
      boardDraft: ["Ad", "2c"],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
      ],
    });
    expect(highlightedBoardIndexes(state)).toEqual([0, 1, 2]);
  });

  it("highlights turn and lists empty river in the strip", () => {
    const checks = (seats: number[]) => seats.map((seat) => ({ seat, action: "check" as const }));
    const state = playing({
      step: 3,
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        { street: "flop", board: ["Ad", "2c", "3d"], actions: checks([2, 3, 1]) },
        { street: "turn", board: ["Ad", "2c", "3d", "9s"], actions: [] },
      ],
      activeStreetIndex: 2,
    });
    expect(wizardBoardCards(state)).toEqual(["Ad", "2c", "3d", "9s"]);
    expect(highlightedBoardIndexes(state)).toEqual([3]);
    expect(wizardPot(state)).toBeGreaterThan(0);
  });

  it("highlights the river slot", () => {
    expect(highlightedBoardIndexes(riverShowdown())).toEqual([4]);
  });
});

describe("showdown winners and hero profit", () => {
  function checks(seats: number[]) {
    return seats.map((seat) => ({ seat, action: "check" as const }));
  }

  function riverState(overrides: Partial<WizardState> = {}): WizardState {
    return {
      ...emptyWizard(),
      step: 4,
      furthestStep: 4,
      occupied: [1, 2, 3],
      heroCards: ["As", "Ah"],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        { street: "flop", board: ["Ad", "2c", "3d"], actions: checks([2, 3, 1]) },
        { street: "turn", board: ["Ad", "2c", "3d", "9s"], actions: checks([2, 3, 1]) },
        { street: "river", board: ["Ad", "2c", "3d", "9s", "4h"], actions: checks([2, 3, 1]) },
      ],
      activeStreetIndex: 3,
      ...overrides,
    };
  }

  it("hero profit is the won share minus invested (control: 282000 − 2000; 36000 − 8000)", () => {
    expect(heroProfit(282_000, 2_000, [1], 1)).toBe(280_000);
    expect(heroProfit(282_000, 2_000, [1, 2], 1)).toBe(139_000);
    expect(heroProfit(282_000, 2_000, [2], 1)).toBe(-2_000);
    expect(heroProfit(282_000, 2_000, [], 1)).toBe(0);
    expect(heroProfit(36_000, 8_000, [1], 1)).toBe(28_000);
  });

  it("does not treat living players as winners before holes are known", () => {
    const state = riverState({
      winnerSeats: [1, 2, 3],
      showdownCards: {},
    });
    expect(resolveWinners(state)).toEqual([]);
    const result = buildHandData(state).result;
    expect(result.winner_seats).toEqual([]);
    expect(result.hero_profit).toBe(0);
  });

  it("does not use leftover winner seats when hero cards are missing and nobody mucked", () => {
    const state = riverState({
      heroCards: [],
      winnerSeats: [1, 2, 3],
      showdownCards: {},
    });
    expect(resolveWinners(state)).toEqual([]);
  });

  it("uses the manual winner when hero cards are missing and opponents mucked", () => {
    const state = riverState({
      heroCards: [],
      winnerSeats: [1],
      muckedSeats: [2, 3],
      showdownMucked: true,
    });
    expect(resolveWinners(state)).toEqual([1]);
    expect(buildHandData(state).result.winner_seats).toEqual([1]);
  });

  it("picks the winner from shown hands", () => {
    const state = riverState({
      showdownCards: { 2: ["Ks", "Kh"], 3: ["7c", "8d"] },
    });
    const result = buildHandData(state).result;
    expect(result.winner_seats).toEqual([1]);
    expect(result.hero_profit).toBe(result.pot - result.hero_invested);
  });

  it("marks a chop when shown hands tie", () => {
    const state = riverState({
      heroCards: ["3c", "4d"],
      showdownCards: { 2: ["5h", "6c"], 3: ["7c", "8d"] },
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "check" },
          ],
        },
        { street: "flop", board: ["Ts", "Js", "Qs"], actions: checks([2, 3, 1]) },
        { street: "turn", board: ["Ts", "Js", "Qs", "Ks"], actions: checks([2, 3, 1]) },
        { street: "river", board: ["Ts", "Js", "Qs", "Ks", "9s"], actions: checks([2, 3, 1]) },
      ],
    });
    expect(resolveWinners(state)).toEqual([1, 2, 3]);
    const result = buildHandData(state).result;
    expect(result.hero_profit).toBe(Math.floor(result.pot / 3) - result.hero_invested);
  });

  it("uses the manual winner when opponents muck", () => {
    let state = riverState();
    state = wizardReducer(state, { type: "muckShowdown" });
    expect(resolveWinners(state)).toEqual([]);
    expect(state.muckedSeats).toEqual([2, 3]);
    state = wizardReducer(state, { type: "takePot", seat: 1 });
    const result = buildHandData(state).result;
    expect(result.winner_seats).toEqual([1]);
    expect(result.hero_profit).toBe(result.pot - result.hero_invested);
  });

  it("does not auto-pick a winner when only one of two opponents showed", () => {
    let state = riverState({ showdownCards: { 2: ["Ks", "Kh"] } });
    expect(resolveWinners(state)).toEqual([]);
    state = wizardReducer(state, { type: "muckSeat", seat: 3 });
    expect(resolveWinners(state)).toEqual([]);
    state = wizardReducer(state, { type: "takePot", seat: 1 });
    expect(resolveWinners(state)).toEqual([1]);
  });

  it("advanceStreet does not preset all living seats as winners", () => {
    let state = riverState({ step: 3, winnerSeats: [] });
    state = wizardReducer(state, { type: "advanceStreet" });
    expect(state.step).toBe(4);
    expect(resolveWinners(state)).toEqual([]);
    expect(state.winnerSeats).toEqual([]);
  });

  it("uncontested pot goes to the last remaining player", () => {
    let state = playing({
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "fold" },
            { seat: 2, action: "fold" },
          ],
        },
      ],
    });
    state = wizardReducer(state, { type: "advanceStreet" });
    expect(state.step).toBe(4);
    expect(resolveWinners(state)).toEqual([3]);
    const result = buildHandData(state).result;
    expect(result.winner_seats).toEqual([3]);
    expect(result.hero_profit + result.hero_invested).toBe(0);
  });
});

describe("streetClosed when betting is impossible", () => {
  it("closes the flop when only leftover chips remain after all-in", () => {
    const state = playing({
      tableSize: 2,
      occupied: [1, 2],
      blinds: { sb: 500, bb: 1000, ante: 0 },
      stacks: { 1: "100000", 2: "80000" },
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "allin", amount: 100000 },
            { seat: 2, action: "allin", amount: 80000 },
          ],
        },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
      ],
      activeStreetIndex: 1,
    });
    expect(streetClosed(state)).toBe(true);
    expect(wizardLegal(state).state.actorSeat).toBeNull();
    expect(wizardPot(state)).toBe(160_000);
    expect(wizardLegal(state).state.heroInvested).toBe(80_000);
    expect(heroProfit(160_000, 80_000, [2], 1)).toBe(-80_000);
  });

  it("stays open when two players still have chips", () => {
    const state = playing({
      tableSize: 2,
      occupied: [1, 2],
      blinds: { sb: 500, bb: 1000, ante: 0 },
      stacks: { 1: "100000", 2: "100000" },
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 1000 },
            { seat: 2, action: "check" },
          ],
        },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
      ],
      activeStreetIndex: 1,
    });
    expect(streetClosed(state)).toBe(false);
    expect(wizardLegal(state).state.actorSeat).toBe(2);
  });

  it("is closed after everyone folds to one player", () => {
    const state = playing({
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "fold" },
            { seat: 2, action: "fold" },
          ],
        },
      ],
    });
    expect(streetClosed(state)).toBe(true);
    const next = wizardReducer(state, { type: "advanceStreet" });
    expect(next.step).toBe(4);
    expect(next.streets).toHaveLength(1);
  });
});
