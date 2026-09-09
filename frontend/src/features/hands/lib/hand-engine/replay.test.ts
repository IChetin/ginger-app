import { describe, expect, it } from "vitest";

import {
  buildTimeline,
  getStateAtStep,
  actionOrder,
  legalActions,
} from "@/features/hands/lib/hand-engine";
import { evalHand, parseCard, bestFive } from "@/features/hands/lib/handRank";
import type { AnteMode, HandData } from "@/api/types/hands";

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
      actions: [
        { seat: 7, action: "check" },
        { seat: 1, action: "bet", amount: 22500 },
        { seat: 7, action: "call", amount: 22500 },
      ],
    },
    {
      street: "river",
      board: ["Ks", "9h", "4d", "7d", "2c"],
      actions: [
        { seat: 7, action: "check" },
        { seat: 1, action: "check" },
      ],
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

describe("getStateAtStep", () => {
  it("replays the sample hand to the known pot", () => {
    const timeline = buildTimeline(SAMPLE);
    expect(timeline[0]?.kind).toBe("post");
    const final = getStateAtStep(SAMPLE, timeline.length - 1);
    expect(final.pot).toBe(114000);
    expect(final.heroInvested).toBe(48500);
    expect(final.board).toEqual(["Ks", "9h", "4d", "7d", "2c"]);
    expect(final.actorSeat).toBeNull();
  });

  it("starting pot includes antes for the whole table plus blinds", () => {
    const posted = getStateAtStep(SAMPLE, 0);
    expect(posted.pot).toBe(9 * 2000 + 1000 + 2000);
  });

  it("BB-ante posts one ante from BB; occupied posts from sitting players", () => {
    const threeHanded = (ante_mode: AnteMode): HandData => ({
      schema_version: 1,
      table_size: 6,
      blinds: { sb: 1000, bb: 2000, ante: 2000, ante_mode },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 100000, is_hero: true, cards: ["As", "Kd"] },
        { seat: 2, position: "SB", name: "SB", stack: 100000 },
        { seat: 3, position: "BB", name: "BB", stack: 100000 },
      ],
      streets: [{ street: "preflop", board: [], actions: [] }],
      result: { winner_seats: [3], pot: 0, hero_invested: 0, hero_profit: 0, side_pots: null },
    });
    expect(getStateAtStep(threeHanded("bb"), 0).pot).toBe(5000);
    expect(getStateAtStep(threeHanded("occupied"), 0).pot).toBe(9000);
    const noAnte: HandData = {
      ...threeHanded("bb"),
      blinds: { sb: 1000, bb: 2000, ante: 0, ante_mode: "bb" },
    };
    expect(getStateAtStep(noAnte, 0).pot).toBe(3000);
  });

  it("adds the raise remainder after BB-ante posts", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 6,
      blinds: { sb: 1000, bb: 2000, ante: 2000, ante_mode: "bb" },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 100000, is_hero: true, cards: ["As", "Kd"] },
        { seat: 2, position: "SB", name: "SB", stack: 100000 },
        { seat: 3, position: "BB", name: "BB", stack: 100000 },
      ],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "raise", amount: 6000 },
            { seat: 2, action: "fold" },
            { seat: 3, action: "call", amount: 6000 },
          ],
        },
      ],
      result: { winner_seats: [1], pot: 0, hero_invested: 0, hero_profit: 0, side_pots: null },
    };
    const timeline = buildTimeline(data);
    expect(getStateAtStep(data, timeline.length - 1).pot).toBe(15_000);
  });

  it("does not put unmarked SB into the pot (dead button)", () => {
    const data: HandData = {
      ...SAMPLE,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 100000, is_hero: true, cards: ["As", "Kd"] },
        { seat: 3, position: "BB", name: "Игрок 3", stack: 100000 },
        { seat: 7, position: "MP", name: "Villain", stack: 100000 },
      ],
      streets: [{ street: "preflop", board: [], actions: [] }],
      result: { winner_seats: [1], pot: 0, hero_invested: 0, hero_profit: 0, side_pots: null },
    };
    const posted = getStateAtStep(data, 0);
    // (SB если есть) + BB + ante × table_size = 0 + 2000 + 9×2000
    expect(posted.pot).toBe(20_000);
    expect(posted.currentBet).toBe(2000);
    expect(posted.actorSeat).toBe(7);
  });

  it("heads-up: BTN posts the small blind", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 2,
      blinds: { sb: 500, bb: 1000, ante: 0 },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 50000, is_hero: true, cards: ["As", "Kd"] },
        { seat: 2, position: "BB", name: "Villain", stack: 50000 },
      ],
      streets: [{ street: "preflop", board: [], actions: [] }],
      result: { winner_seats: [1], pot: 0, hero_invested: 0, hero_profit: 0, side_pots: null },
    };
    const posted = getStateAtStep(data, 0);
    expect(posted.pot).toBe(1500);
    expect(posted.seats.find((seat) => seat.seat === 1)?.committed).toBe(500);
    expect(posted.seats.find((seat) => seat.seat === 2)?.committed).toBe(1000);
    expect(posted.actorSeat).toBe(1);
  });

  it("preflop queue is UTG-clockwise with blinds last", () => {
    const posted = getStateAtStep(SAMPLE, 0);
    expect(actionOrder(posted.seats, "preflop")).toEqual([7, 1, 2, 3]);
    expect(posted.actorSeat).toBe(7);
  });

  it("postflop queue is SB-clockwise with the button last", () => {
    const timeline = buildTimeline(SAMPLE);
    const flopDeal = timeline.findIndex((item) => item.kind === "deal" && item.street === "flop");
    const flop = getStateAtStep(SAMPLE, flopDeal);
    expect(actionOrder(flop.seats, "flop")).toEqual([2, 3, 7, 1]);
    expect(flop.actorSeat).toBe(7);
  });

  it("is deterministic when rewound", () => {
    const mid = getStateAtStep(SAMPLE, 3);
    const later = getStateAtStep(SAMPLE, 8);
    const again = getStateAtStep(SAMPLE, 3);
    expect(again.pot).toBe(mid.pot);
    expect(later.pot).toBeGreaterThanOrEqual(mid.pot);
  });

  it("call amount is the remainder to the current bet", () => {
    const posted = getStateAtStep(SAMPLE, 0);
    expect(posted.lastRaise).toBe(2000);
    const open = legalActions(posted);
    expect(open.callAmount).toBe(2000);
    expect(open.callTarget).toBe(2000);
    expect(open.minBet).toBe(4000);
    expect(open.minBet).toBe(posted.currentBet + posted.lastRaise);

    const threeHanded: HandData = {
      ...SAMPLE,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 100000, is_hero: true, cards: ["As", "Kd"] },
        { seat: 2, position: "SB", name: "SB", stack: 100000 },
        { seat: 3, position: "BB", name: "BB", stack: 100000 },
      ],
      streets: [
        { street: "preflop", board: [], actions: [{ seat: 1, action: "raise", amount: 6000 }] },
      ],
    };
    const timeline = buildTimeline(threeHanded);
    const afterRaise = getStateAtStep(threeHanded, timeline.length - 1);
    expect(afterRaise.actorSeat).toBe(2);
    const legal = legalActions(afterRaise);
    expect(legal.callAmount).toBe(5000);
    expect(legal.callTarget).toBe(6000);
    expect(legal.minBet).toBe(10_000);
  });

  it.each([
    { sb: 100, bb: 200, open: 200, minRaise: 400 },
    { sb: 1000, bb: 2000, open: 2000, minRaise: 4000 },
  ])("min bet is BB $bb and min raise is current + last raise", ({ sb, bb, open, minRaise }) => {
    const hand: HandData = {
      ...SAMPLE,
      blinds: { sb, bb, ante: 0 },
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 100_000, is_hero: true, cards: ["As", "Kd"] },
        { seat: 2, position: "SB", name: "SB", stack: 100_000 },
        { seat: 3, position: "BB", name: "BB", stack: 100_000 },
      ],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: bb },
            { seat: 2, action: "call", amount: bb },
            { seat: 3, action: "check" },
          ],
        },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
      ],
    };
    const posted = getStateAtStep(hand, 0);
    expect(legalActions(posted).minBet).toBe(minRaise);
    const flopDeal = buildTimeline(hand).findIndex(
      (item) => item.kind === "deal" && item.street === "flop",
    );
    const flop = getStateAtStep(hand, flopDeal);
    expect(flop.currentBet).toBe(0);
    expect(legalActions(flop).minBet).toBe(open);
    expect(legalActions(flop).minBet).not.toBe(1);
    expect(legalActions(flop).minBet).not.toBe(2);
  });

  it("keeps opponent holes hidden until the showdown step", () => {
    const timeline = buildTimeline(SAMPLE);
    expect(timeline.at(-1)?.kind).toBe("showdown");
    const preflop = getStateAtStep(SAMPLE, 0);
    expect(preflop.isShowdown).toBe(false);
    expect(preflop.seats.find((seat) => seat.isHero)?.cards).toEqual(["As", "Kc"]);
    expect(preflop.seats.find((seat) => seat.seat === 7)?.cards).toEqual([]);
    const beforeShowdown = getStateAtStep(SAMPLE, timeline.length - 2);
    expect(beforeShowdown.isShowdown).toBe(false);
    expect(beforeShowdown.seats.find((seat) => seat.seat === 7)?.cards).toEqual([]);
    const showdown = getStateAtStep(SAMPLE, timeline.length - 1);
    expect(showdown.isShowdown).toBe(true);
    expect(showdown.log).toBe("Вскрытие");
    expect(showdown.seats.find((seat) => seat.seat === 7)?.cards).toEqual(["Qh", "Jh"]);
    expect(showdown.seats.find((seat) => seat.seat === 2)?.cards).toEqual([]);
  });

  it("rewinds opponent holes when stepping back from showdown", () => {
    const timeline = buildTimeline(SAMPLE);
    const shown = getStateAtStep(SAMPLE, timeline.length - 1);
    expect(shown.seats.find((seat) => seat.seat === 7)?.cards).toEqual(["Qh", "Jh"]);
    const earlier = getStateAtStep(SAMPLE, 3);
    expect(earlier.isShowdown).toBe(false);
    expect(earlier.seats.find((seat) => seat.seat === 7)?.cards).toEqual([]);
  });

  it("does not add a showdown step after a fold-win", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 2,
      blinds: { sb: 500, bb: 1000, ante: 0 },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 5000, is_hero: true, cards: ["As", "Kc"] },
        { seat: 2, position: "BB", name: "Вилл", stack: 5000, cards: ["Qh", "Jh"] },
      ],
      streets: [{ street: "preflop", board: [], actions: [{ seat: 1, action: "fold" }] }],
      result: {
        winner_seats: [2],
        pot: 1500,
        hero_invested: 500,
        hero_profit: -500,
        side_pots: null,
      },
    };
    const timeline = buildTimeline(data);
    expect(timeline.some((item) => item.kind === "showdown")).toBe(false);
    const last = getStateAtStep(data, timeline.length - 1);
    expect(last.isShowdown).toBe(false);
    expect(last.seats.find((seat) => seat.seat === 2)?.cards).toEqual([]);
  });

  it("reveals known opponent holes from step 0 when hiding is off", () => {
    const first = getStateAtStep(SAMPLE, 0, { hideUntilShowdown: false });
    expect(first.isShowdown).toBe(false);
    expect(first.seats.find((seat) => seat.seat === 7)?.cards).toEqual(["Qh", "Jh"]);
    expect(first.seats.find((seat) => seat.isHero)?.cards).toEqual(["As", "Kc"]);
  });

  it("keeps a living muck face-down through showdown", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 6,
      blinds: { sb: 500, bb: 1000, ante: 0 },
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
            { seat: 1, action: "call", amount: 1000 },
            { seat: 2, action: "call", amount: 1000 },
            { seat: 3, action: "check" },
          ],
        },
        {
          street: "flop",
          board: ["Kd", "9h", "2c"],
          actions: [
            { seat: 2, action: "check" },
            { seat: 3, action: "check" },
            { seat: 1, action: "check" },
          ],
        },
      ],
      result: {
        winner_seats: [1],
        pot: 3000,
        hero_invested: 1000,
        hero_profit: 2000,
        side_pots: null,
      },
    };
    const timeline = buildTimeline(data);
    expect(timeline.at(-1)?.kind).toBe("showdown");
    const showdown = getStateAtStep(data, timeline.length - 1);
    expect(showdown.seats.find((seat) => seat.seat === 2)?.folded).toBe(false);
    expect(showdown.seats.find((seat) => seat.seat === 2)?.cards).toEqual([]);
    expect(showdown.seats.find((seat) => seat.seat === 3)?.cards).toEqual(["Qh", "Jh"]);
  });
});

function huAllIn(overrides: Partial<HandData> = {}): HandData {
  return {
    schema_version: 1,
    table_size: 2,
    blinds: { sb: 500, bb: 1000, ante: 0 },
    hero_seat: 1,
    button_seat: 1,
    seats: [
      { seat: 1, position: "BTN", name: "Вы", stack: 100_000, is_hero: true, cards: ["As", "Kc"] },
      { seat: 2, position: "BB", name: "Villain", stack: 80_000, cards: ["Qh", "Jh"] },
    ],
    streets: [
      {
        street: "preflop",
        board: [],
        actions: [
          { seat: 1, action: "allin", amount: 100_000 },
          { seat: 2, action: "allin", amount: 80_000 },
        ],
      },
      { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
      { street: "turn", board: ["Ks", "9h", "4d", "7d"], actions: [] },
      { street: "river", board: ["Ks", "9h", "4d", "7d", "2c"], actions: [] },
    ],
    result: {
      winner_seats: [2],
      pot: 160_000,
      hero_invested: 80_000,
      hero_profit: -80_000,
      side_pots: null,
    },
    ...overrides,
  };
}

describe("all-in runout and uncalled chips", () => {
  it("returns extra chips: 100 BB vs 80 BB puts 80+80 in the pot, not 100+80", () => {
    const data = huAllIn();
    const timeline = buildTimeline(data);
    const flop = timeline.findIndex((item) => item.kind === "deal" && item.street === "flop");
    const after = getStateAtStep(data, flop);
    expect(after.pot).toBe(160_000);
    expect(after.heroInvested).toBe(80_000);
    expect(after.hasSidePotWarning).toBe(false);
    expect(after.seats.find((seat) => seat.seat === 1)?.stack).toBe(20_000);
    expect(after.seats.find((seat) => seat.seat === 1)?.allIn).toBe(false);
    expect(after.seats.find((seat) => seat.seat === 2)?.stack).toBe(0);
    expect(after.actorSeat).toBeNull();
  });

  it("does not open betting on later streets when fewer than two players can act", () => {
    const data = huAllIn();
    const timeline = buildTimeline(data);
    expect(timeline.filter((item) => item.kind === "action").map((item) => item.street)).toEqual([
      "preflop",
      "preflop",
    ]);
    expect(timeline.filter((item) => item.kind === "deal").map((item) => item.street)).toEqual([
      "flop",
      "turn",
      "river",
    ]);
    const flop = timeline.findIndex((item) => item.kind === "deal" && item.street === "flop");
    const state = getStateAtStep(data, flop);
    expect(state.actorSeat).toBeNull();
    expect(state.log).toBe("Флоп");
    expect(legalActions(state).canBet).toBe(false);
  });

  it("drops leftover betting actions after everyone is all-in", () => {
    const data = huAllIn({
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "allin", amount: 100_000 },
            { seat: 2, action: "allin", amount: 80_000 },
          ],
        },
        {
          street: "flop",
          board: ["Ks", "9h", "4d"],
          actions: [{ seat: 1, action: "bet", amount: 20_000 }],
        },
        { street: "turn", board: ["Ks", "9h", "4d", "7d"], actions: [] },
        { street: "river", board: ["Ks", "9h", "4d", "7d", "2c"], actions: [] },
      ],
    });
    const timeline = buildTimeline(data);
    expect(timeline.some((item) => item.kind === "action" && item.street === "flop")).toBe(false);
    const flop = timeline.findIndex((item) => item.kind === "deal" && item.street === "flop");
    expect(getStateAtStep(data, flop).pot).toBe(160_000);
  });

  it("does not return the big blind when everyone folds to BB", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 2,
      blinds: { sb: 500, bb: 1000, ante: 0 },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 5000, is_hero: true, cards: ["As", "Kc"] },
        { seat: 2, position: "BB", name: "Villain", stack: 5000, cards: ["Qh", "Jh"] },
      ],
      streets: [{ street: "preflop", board: [], actions: [{ seat: 1, action: "fold" }] }],
      result: {
        winner_seats: [2],
        pot: 1500,
        hero_invested: 500,
        hero_profit: -500,
        side_pots: null,
      },
    };
    const last = getStateAtStep(data, buildTimeline(data).length - 1);
    expect(last.pot).toBe(1500);
    expect(last.heroInvested).toBe(500);
    expect(last.seats.find((seat) => seat.seat === 2)?.stack).toBe(4000);
  });

  it("returns an uncalled raise after everyone folds", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 2,
      blinds: { sb: 500, bb: 1000, ante: 0 },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        { seat: 1, position: "BTN", name: "Вы", stack: 50_000, is_hero: true, cards: ["As", "Kc"] },
        { seat: 2, position: "BB", name: "Villain", stack: 50_000 },
      ],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "raise", amount: 3000 },
            { seat: 2, action: "fold" },
          ],
        },
      ],
      result: {
        winner_seats: [1],
        pot: 2000,
        hero_invested: 1000,
        hero_profit: 1000,
        side_pots: null,
      },
    };
    const last = getStateAtStep(data, buildTimeline(data).length - 1);
    expect(last.pot).toBe(2000);
    expect(last.heroInvested).toBe(1000);
    expect(last.seats.find((seat) => seat.seat === 1)?.stack).toBe(49_000);
  });

  it("skips betting when two are all-in and the third folded with chips", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 6,
      blinds: { sb: 1000, bb: 2000, ante: 0 },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        {
          seat: 1,
          position: "BTN",
          name: "Вы",
          stack: 100_000,
          is_hero: true,
          cards: ["As", "Kc"],
        },
        { seat: 2, position: "SB", name: "SB", stack: 80_000, cards: ["Qh", "Jh"] },
        { seat: 3, position: "BB", name: "BB", stack: 200_000 },
      ],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "allin", amount: 100_000 },
            { seat: 2, action: "allin", amount: 80_000 },
            { seat: 3, action: "fold" },
          ],
        },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
      ],
      result: {
        winner_seats: [1],
        pot: 163_000,
        hero_invested: 80_000,
        hero_profit: 83_000,
        side_pots: null,
      },
    };
    const flop = buildTimeline(data).findIndex(
      (item) => item.kind === "deal" && item.street === "flop",
    );
    const state = getStateAtStep(data, flop);
    expect(state.actorSeat).toBeNull();
    expect(
      state.seats.filter((seat) => !seat.folded && seat.stack > 0).map((seat) => seat.seat),
    ).toEqual([1]);
    // BB folded; 100 vs 80 all-in → pot 80+80 + BB's 2 BB that stayed.
    expect(state.pot).toBe(162_000);
  });

  it("keeps betting between two stacks when the third is all-in", () => {
    const data: HandData = {
      schema_version: 1,
      table_size: 6,
      blinds: { sb: 1000, bb: 2000, ante: 0 },
      hero_seat: 1,
      button_seat: 1,
      seats: [
        {
          seat: 1,
          position: "BTN",
          name: "Вы",
          stack: 100_000,
          is_hero: true,
          cards: ["As", "Kc"],
        },
        { seat: 2, position: "SB", name: "SB", stack: 100_000 },
        { seat: 3, position: "BB", name: "BB", stack: 5_000, cards: ["Qh", "Jh"] },
      ],
      streets: [
        {
          street: "preflop",
          board: [],
          actions: [
            { seat: 1, action: "call", amount: 2000 },
            { seat: 2, action: "call", amount: 2000 },
            { seat: 3, action: "allin", amount: 5000 },
            { seat: 1, action: "call", amount: 5000 },
            { seat: 2, action: "call", amount: 5000 },
          ],
        },
        { street: "flop", board: ["Ks", "9h", "4d"], actions: [] },
      ],
      result: {
        winner_seats: [1],
        pot: 15_000,
        hero_invested: 5_000,
        hero_profit: 10_000,
        side_pots: null,
      },
    };
    const flop = buildTimeline(data).findIndex(
      (item) => item.kind === "deal" && item.street === "flop",
    );
    const state = getStateAtStep(data, flop);
    expect(state.actorSeat).toBe(2);
    expect(legalActions(state).canCheck).toBe(true);
    expect(legalActions(state).canBet).toBe(true);
  });
});

describe("handRank", () => {
  it("ranks quads over full house", () => {
    const quads = evalHand(
      ["As", "Ah", "Ad", "Ac", "2s"].map(parseCard),
      ["3h", "4d"].map(parseCard),
    );
    const boat = evalHand(
      ["Ks", "Kh", "Kd", "Qc", "Qs"].map(parseCard),
      ["2h", "3d"].map(parseCard),
    );
    expect(quads).toBeGreaterThan(boat);
  });

  it("set of kings beats pair of aces", () => {
    const kings = bestFive(["Ks", "Kh"], ["Kd", "2c", "7d", "9s", "4h"]);
    const aces = bestFive(["As", "Ah"], ["Kd", "2c", "7d", "9s", "4h"]);
    expect(kings).toBeGreaterThan(aces);
  });

  it("pair of aces beats pair of kings on a dry board", () => {
    const aces = bestFive(["As", "Ah"], ["2c", "7d", "9s", "4h", "8d"]);
    const kings = bestFive(["Ks", "Kh"], ["2c", "7d", "9s", "4h", "8d"]);
    expect(aces).toBeGreaterThan(kings);
  });
});
