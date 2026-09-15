import { describe, expect, it } from "vitest";

import type { CashTable } from "@/api/types/cash";
import {
  applyCashFilters,
  buyinInBigBlinds,
  formatBlinds,
  groupByGame,
  stakeTier,
} from "@/features/cash/lib";

const dollarClub = {
  id: "c1",
  name: "Ginger",
  slug: "ginger",
  app: "pppoker" as const,
  chip_value: "1",
  chip_currency_code: "USDT",
  currency_symbol: "$",
};

function table(overrides: Partial<CashTable>): CashTable {
  return {
    id: "t1",
    club: dollarClub,
    name: "Micro Rush",
    game_type: "nlh",
    small_blind: "0.1",
    big_blind: "0.2",
    ante: null,
    table_size: 6,
    seated: 4,
    waiting: 0,
    min_buyin: "10",
    max_buyin: "40",
    app_link: null,
    seen_at: "2026-09-15T18:00:00Z",
    big_blind_rub: "19",
    ...overrides,
  };
}

describe("cash lib", () => {
  it("блайнды — символ один раз, по курсу клуба", () => {
    expect(formatBlinds(table({}))).toBe("$0,1/0,2");
    const rubClub = { ...dollarClub, chip_value: "100", currency_symbol: "₽" };
    expect(formatBlinds(table({ club: rubClub, small_blind: "0.5", big_blind: "1" }))).toBe(
      "₽50/100",
    );
    const noRate = { ...dollarClub, chip_value: null, currency_symbol: null };
    expect(formatBlinds(table({ club: noRate, small_blind: "0.5", big_blind: "1" }))).toBe(
      "0,5/1 фиш.",
    );
  });

  it("ступени ставок по ББ в рублях, фильтр игры и ставок", () => {
    expect(stakeTier("25")).toBe("low");
    expect(stakeTier("100")).toBe("mid");
    expect(stakeTier("190")).toBe("high");
    expect(stakeTier(null)).toBeNull();

    const tables = [
      table({ id: "a" }),
      table({ id: "b", game_type: "plo", big_blind_rub: "95" }),
      table({ id: "c", big_blind_rub: null }),
    ];
    expect(applyCashFilters(tables, { games: ["plo"], stakes: [] }).map((t) => t.id)).toEqual([
      "b",
    ]);
    // Без курса ставка неизвестна — при фильтре ставок стол не показываем.
    expect(applyCashFilters(tables, { games: [], stakes: ["low"] }).map((t) => t.id)).toEqual([
      "a",
    ]);
  });

  it("группы по игре: от младших ставок, при равных — где больше игроков", () => {
    const groups = groupByGame([
      table({ id: "plo", game_type: "plo" }),
      table({ id: "high", big_blind_rub: "190" }),
      table({ id: "quiet", seated: 1 }),
      table({ id: "busy", seated: 6 }),
    ]);
    expect(groups.map(([game, items]) => [game, items.map((t) => t.id)])).toEqual([
      ["nlh", ["busy", "quiet", "high"]],
      ["plo", ["plo"]],
    ]);
  });

  it("вход в больших блайндах", () => {
    expect(buyinInBigBlinds("40", "0.2")).toBe("200 ББ");
    expect(buyinInBigBlinds(null, "0.2")).toBeNull();
  });
});
