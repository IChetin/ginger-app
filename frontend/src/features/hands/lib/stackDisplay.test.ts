import { describe, expect, it } from "vitest";

import type { HandData } from "@/api/types/hands";
import { formatChips } from "@/features/hands/components/PlayingCard";
import { buildTimeline, getStateAtStep } from "@/features/hands/lib/hand-engine";
import {
  canUseBb,
  chipsFromBb,
  displayReplayStack,
  formatAmountInput,
  formatBlindLevel,
  formatBlindsSummary,
  formatReplayBlindsCaption,
  formatReplayLog,
  formatReplayProfit,
  formatStackAmount,
  inputToChips,
  potShare,
} from "@/features/hands/lib/stackDisplay";

const SAMPLE: HandData = {
  schema_version: 1,
  table_size: 9,
  blinds: { sb: 1000, bb: 2000, ante: 2000 },
  hero_seat: 1,
  button_seat: 1,
  seats: [
    { seat: 1, position: "BTN", name: "Вы", stack: 86000, is_hero: true, cards: ["As", "Kc"] },
    { seat: 2, position: "SB", name: "Игрок 2", stack: 42000 },
    { seat: 3, position: "BB", name: "Игрок 3", stack: 31000 },
    { seat: 7, position: "CO", name: "Игрок 7", stack: 128000, cards: ["Qh", "Jh"] },
  ],
  streets: [
    {
      street: "preflop",
      board: [],
      actions: [
        { seat: 7, action: "raise", amount: 6000 },
        { seat: 1, action: "call", amount: 6000 },
        { seat: 2, action: "fold" },
        { seat: 3, action: "fold" },
      ],
    },
    {
      street: "flop",
      board: ["Ks", "9h", "4d"],
      actions: [
        { seat: 7, action: "bet", amount: 18000 },
        { seat: 1, action: "call", amount: 18000 },
      ],
    },
    {
      street: "turn",
      board: ["Ks", "9h", "4d", "7d"],
      actions: [],
    },
    {
      street: "river",
      board: ["Ks", "9h", "4d", "7d", "2c"],
      actions: [],
    },
  ],
  result: {
    winner_seats: [1],
    pot: 114000,
    hero_invested: 48500,
    hero_profit: 65500,
    side_pots: null,
  },
};

describe("formatStackAmount", () => {
  it("keeps chips in chips mode", () => {
    expect(formatStackAmount(4500, "chips", 1000)).toBe(formatChips(4500));
  });

  it("formats short stacks with one decimal", () => {
    expect(formatStackAmount(4500, "bb", 1000)).toBe("4,5\u00a0BB");
    expect(formatStackAmount(9800, "bb", 1000)).toBe("9,8\u00a0BB");
  });

  it("formats 10+ BB as integers", () => {
    expect(formatStackAmount(147000, "bb", 1000)).toBe("147\u00a0BB");
    expect(formatStackAmount(10000, "bb", 1000)).toBe("10\u00a0BB");
  });

  it("omits trailing zero under 10 BB", () => {
    expect(formatStackAmount(4000, "bb", 1000)).toBe("4\u00a0BB");
  });

  it("falls back to chips when BB is missing", () => {
    expect(canUseBb(0)).toBe(false);
    expect(canUseBb(undefined)).toBe(false);
    expect(formatStackAmount(4500, "bb", 0)).toBe("4\u00a0500");
  });
});

describe("BB input conversion", () => {
  it("converts BB to chips with integer rounding", () => {
    expect(chipsFromBb(100, 2000)).toBe(200_000);
    expect(chipsFromBb(8.5, 2000)).toBe(17_000);
    expect(chipsFromBb(8.54, 2000)).toBe(17_000);
    expect(inputToChips("8,5", "bb", 2000)).toBe(17_000);
    expect(inputToChips("100", "bb", 2000)).toBe(200_000);
    expect(inputToChips("200000", "chips", 2000)).toBe(200_000);
    expect(inputToChips("0", "chips", 2000)).toBe(0);
    expect(inputToChips("-1", "bb", 2000)).toBe(-2_000);
    expect(inputToChips("", "chips", 2000)).toBeNull();
  });

  it("formats the field from stored chips", () => {
    expect(formatAmountInput(200_000, "bb", 2000)).toBe("100");
    expect(formatAmountInput(17_000, "bb", 2000)).toBe("8,5");
    expect(formatAmountInput(200_000, "chips", 2000)).toBe(formatChips(200_000));
  });
});

describe("formatBlindsSummary", () => {
  it("formats chips with spaced slashes and ante", () => {
    expect(formatBlindsSummary({ sb: 100, bb: 200, ante: 200 }, "chips")).toBe(
      "100 / 200 · анте 200",
    );
    expect(formatBlindsSummary({ sb: 100, bb: 200, ante: 0 }, "chips")).toBe("100 / 200");
  });

  it("formats BB with a tenth under 10 and a suffix", () => {
    expect(formatBlindsSummary({ sb: 100, bb: 200, ante: 200 }, "bb")).toBe(
      "0,5 / 1\u00a0BB · анте 1\u00a0BB",
    );
    expect(formatBlindsSummary({ sb: 2300, bb: 8000, ante: 8600 }, "bb")).toBe(
      "0,3 / 1\u00a0BB · анте 1,1\u00a0BB",
    );
  });
});

describe("formatBlindLevel", () => {
  it("shows SB/BB as a compact BB pair", () => {
    expect(formatBlindLevel(500, 1000, "bb")).toBe("0,5/1\u00a0BB");
    expect(formatBlindLevel(1000, 2000, "chips")).toBe(`${formatChips(1000)}/${formatChips(2000)}`);
  });

  it("drops the BB suffix in the compact replay caption", () => {
    expect(formatReplayBlindsCaption("0,5/1\u00a0BB", " · анте 1\u00a0BB", false)).toBe(
      "0,5/1\u00a0BB · анте 1\u00a0BB",
    );
    expect(formatReplayBlindsCaption("0,5/1\u00a0BB", " · анте 1\u00a0BB", true)).toBe(
      "0,5/1 · анте 1",
    );
  });
});

describe("replay result amounts", () => {
  it("formats hero profit in chips and BB", () => {
    expect(formatReplayProfit(118500, "chips", 1000)).toBe("+118\u00a0500");
    expect(formatReplayProfit(-39500, "chips", 1000)).toBe("−39\u00a0500");
    expect(formatReplayProfit(0, "chips", 1000)).toBe("0");
    expect(formatReplayProfit(-80000, "bb", 1000)).toBe("−80\u00a0BB");
  });

  it("awards the pot to winners only on the last step", () => {
    expect(potShare(1500, 1)).toBe(1500);
    expect(potShare(160000, 2)).toBe(80000);
    expect(displayReplayStack(147000, 2, [2], 1500, true)).toBe(148500);
    expect(displayReplayStack(147000, 2, [2], 1500, false)).toBe(147000);
    expect(displayReplayStack(4500, 1, [2], 1500, true)).toBe(4500);
  });
});

describe("formatReplayLog", () => {
  it("rewrites bet sizes in BB without leftover chip amounts", () => {
    const timeline = buildTimeline(SAMPLE);
    const raiseStep = timeline.findIndex(
      (item) => item.kind === "action" && item.street === "preflop" && item.actionIndex === 0,
    );
    const state = getStateAtStep(SAMPLE, raiseStep);
    const bb = SAMPLE.blinds.bb;
    const log = formatReplayLog(state, (value) => formatStackAmount(value, "bb", bb));
    expect(log).toContain("рейз до 3\u00a0BB");
    expect(log).not.toMatch(/\d[\d\s\u00a0]*000/);

    const betStep = timeline.findIndex(
      (item) => item.kind === "action" && item.street === "flop" && item.actionIndex === 0,
    );
    const betState = getStateAtStep(SAMPLE, betStep);
    const betLog = formatReplayLog(betState, (value) => formatStackAmount(value, "bb", bb));
    expect(betLog).toContain("бет 9\u00a0BB");
  });
});
