import { describe, expect, it } from "vitest";

import type { HandData } from "@/api/types/hands";
import { buildTimeline, getStateAtStep } from "@/features/hands/lib/hand-engine";
import { replayEquityInput, wizardEquityInput } from "@/features/hands/lib/wizardEquity";
import { emptyWizard, wizardReducer, type WizardState } from "@/features/hands/lib/wizardState";

function playing(overrides: Partial<WizardState> = {}): WizardState {
  return {
    ...emptyWizard(),
    step: 3,
    furthestStep: 3,
    occupied: [1, 2, 3],
    heroCards: ["As", "Ah"],
    ...overrides,
  };
}

const PREFLOP_TO_FLOP = [
  { seat: 1, action: "call" as const, amount: 2000 },
  { seat: 2, action: "call" as const, amount: 2000 },
  { seat: 3, action: "check" as const },
];

describe("wizardEquityInput", () => {
  it("hides the block until the hero has two cards", () => {
    expect(wizardEquityInput(playing({ heroCards: [] }))).toBeNull();
    expect(wizardEquityInput(playing({ heroCards: ["As"] }))).toBeNull();
  });

  it("hides the block against unknown opponent hands", () => {
    expect(wizardEquityInput(playing())).toBeNull();
  });

  it("counts living opponents as random when the flag is on", () => {
    const input = wizardEquityInput(playing(), { vsRandom: true });
    expect(input).not.toBeNull();
    expect(input?.randomOpponents).toBe(2);
    expect(input?.vsKnown).toBe(false);
    expect(input?.board).toEqual([]);
    expect(input?.holes).toEqual([["As", "Ah"]]);
  });

  it("drops a folded opponent from the random count when the flag is on", () => {
    let state = playing();
    state = wizardReducer(state, {
      type: "addAction",
      action: { seat: 1, action: "raise", amount: 6000 },
    });
    state = wizardReducer(state, { type: "addAction", action: { seat: 2, action: "fold" } });
    const input = wizardEquityInput(state, { vsRandom: true });
    expect(input?.randomOpponents).toBe(1);
    expect(input?.vsKnown).toBe(false);
  });

  it("hides equity after the hero folds", () => {
    let state = playing();
    state = wizardReducer(state, { type: "addAction", action: { seat: 1, action: "fold" } });
    expect(wizardEquityInput(state)).toBeNull();
  });

  it("uses the current street board, not later streets", () => {
    const flop = playing({
      streets: [
        { street: "preflop", board: [], actions: PREFLOP_TO_FLOP },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
        { street: "turn", board: ["Ks", "9h", "4d", "7d"], actions: [] },
      ],
      activeStreetIndex: 1,
    });
    expect(wizardEquityInput(flop, { vsRandom: true })?.board).toEqual(["Ks", "9h", "4d"]);
    const preflop = { ...flop, activeStreetIndex: 0 };
    expect(wizardEquityInput(preflop, { vsRandom: true })?.board).toEqual([]);
  });

  it("uses the board draft while picking or editing", () => {
    const picking = playing({
      pickingBoard: true,
      boardDraft: ["Ah", "Kh", "2c"],
    });
    expect(wizardEquityInput(picking, { vsRandom: true })?.board).toEqual(["Ah", "Kh", "2c"]);
  });

  it("switches to known-hand equity when opponents are shown", () => {
    const state = playing({
      step: 4,
      furthestStep: 4,
      streets: [
        { street: "preflop", board: [], actions: PREFLOP_TO_FLOP },
        {
          street: "flop",
          board: ["Ad", "2c", "3d"],
          actions: [
            { seat: 2, action: "check" },
            { seat: 3, action: "check" },
            { seat: 1, action: "check" },
          ],
        },
        {
          street: "turn",
          board: ["Ad", "2c", "3d", "9s"],
          actions: [
            { seat: 2, action: "check" },
            { seat: 3, action: "check" },
            { seat: 1, action: "check" },
          ],
        },
        {
          street: "river",
          board: ["Ad", "2c", "3d", "9s", "4h"],
          actions: [
            { seat: 2, action: "check" },
            { seat: 3, action: "check" },
            { seat: 1, action: "check" },
          ],
        },
      ],
      activeStreetIndex: 3,
      showdownCards: { 2: ["Ks", "Kh"], 3: ["7c", "8d"] },
    });
    const input = wizardEquityInput(state);
    expect(input?.vsKnown).toBe(true);
    expect(input?.randomOpponents).toBe(0);
    expect(input?.holes).toEqual([
      ["As", "Ah"],
      ["Ks", "Kh"],
      ["7c", "8d"],
    ]);
    expect(input?.board).toHaveLength(5);
  });
});

const SHOWDOWN_HAND: HandData = {
  schema_version: 1,
  table_size: 9,
  blinds: { sb: 1000, bb: 2000, ante: 0 },
  hero_seat: 1,
  button_seat: 1,
  seats: [
    { seat: 1, position: "BTN", name: "Вы", stack: 100000, is_hero: true, cards: ["As", "Kc"] },
    { seat: 2, position: "SB", name: "SB", stack: 100000 },
    { seat: 3, position: "BB", name: "BB", stack: 100000, cards: ["Qh", "Jh"] },
  ],
  streets: [
    {
      street: "preflop",
      board: [],
      actions: [
        { seat: 1, action: "call", amount: 2000 },
        { seat: 2, action: "fold" },
        { seat: 3, action: "check" },
      ],
    },
    {
      street: "flop",
      board: ["Kd", "9h", "2c"],
      actions: [
        { seat: 3, action: "check" },
        { seat: 1, action: "check" },
      ],
    },
  ],
  result: {
    winner_seats: [1],
    pot: 5000,
    hero_invested: 2000,
    hero_profit: 3000,
    side_pots: null,
  },
};

describe("replayEquityInput", () => {
  it("hides equity until an opponent hand is known", () => {
    const preflop = getStateAtStep(SHOWDOWN_HAND, 0);
    expect(replayEquityInput(preflop)).toBeNull();
  });

  it("counts living opponents as random when the flag is on", () => {
    const preflop = getStateAtStep(SHOWDOWN_HAND, 0);
    const input = replayEquityInput(preflop, { vsRandom: true });
    expect(input?.vsKnown).toBe(false);
    expect(input?.randomOpponents).toBe(2);
    expect(input?.holes).toEqual([["As", "Kc"]]);
  });

  it("drops a folded opponent from the random count when the flag is on", () => {
    const afterFold = getStateAtStep(SHOWDOWN_HAND, 2);
    const input = replayEquityInput(afterFold, { vsRandom: true });
    expect(input?.randomOpponents).toBe(1);
    expect(input?.vsKnown).toBe(false);
  });

  it("uses known-hand equity when opponent holes are already visible", () => {
    const preflop = getStateAtStep(SHOWDOWN_HAND, 0, { hideUntilShowdown: false });
    expect(preflop.seats.find((seat) => seat.seat === 3)?.cards).toEqual(["Qh", "Jh"]);
    const input = replayEquityInput(preflop);
    expect(input?.vsKnown).toBe(true);
    expect(input?.randomOpponents).toBe(0);
    expect(input?.holes).toEqual([
      ["As", "Kc"],
      ["Qh", "Jh"],
    ]);
  });

  it("switches to known-hand equity on the showdown step", () => {
    const timeline = buildTimeline(SHOWDOWN_HAND);
    expect(timeline.at(-1)?.kind).toBe("showdown");
    const showdown = getStateAtStep(SHOWDOWN_HAND, timeline.length - 1);
    const input = replayEquityInput(showdown);
    expect(input?.vsKnown).toBe(true);
    expect(input?.randomOpponents).toBe(0);
    expect(input?.holes).toEqual([
      ["As", "Kc"],
      ["Qh", "Jh"],
    ]);
    expect(input?.board).toEqual(["Kd", "9h", "2c"]);
  });

  it("hides equity after the hero folds", () => {
    const foldWin: HandData = {
      ...SHOWDOWN_HAND,
      streets: [{ street: "preflop", board: [], actions: [{ seat: 1, action: "fold" }] }],
    };
    const last = getStateAtStep(foldWin, buildTimeline(foldWin).length - 1);
    expect(replayEquityInput(last)).toBeNull();
  });
});
