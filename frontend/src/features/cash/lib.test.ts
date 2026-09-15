import { describe, expect, it } from "vitest";

import type { CashGame } from "@/api/types/cash";
import {
  applyCashFilters,
  formatBlinds,
  groupByGame,
  stakeTier,
  totalTables,
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

function game(overrides: Partial<CashGame>): CashGame {
  return {
    id: "g1",
    club: dollarClub,
    game_type: "nlh",
    small_blind: "0.1",
    big_blind: "0.2",
    tables: 3,
    app_link: null,
    seen_at: "2026-09-15T18:00:00Z",
    big_blind_rub: "19",
    is_editor_pick: false,
    editor_pick_note: null,
    ...overrides,
  };
}

describe("cash lib", () => {
  it("блайнды — символ один раз, по курсу клуба", () => {
    expect(formatBlinds(game({}))).toBe("$0,1/0,2");
    const rubClub = { ...dollarClub, chip_value: "100", currency_symbol: "₽" };
    expect(formatBlinds(game({ club: rubClub, small_blind: "0.5", big_blind: "1" }))).toBe(
      "₽50/100",
    );
    const noRate = { ...dollarClub, chip_value: null, currency_symbol: null };
    expect(formatBlinds(game({ club: noRate, small_blind: "0.5", big_blind: "1" }))).toBe(
      "0,5/1 фиш.",
    );
  });

  it("фильтры: игра, ставки по ББ в рублях, Editor's Pick", () => {
    expect(stakeTier("25")).toBe("low");
    expect(stakeTier("100")).toBe("mid");
    expect(stakeTier("190")).toBe("high");

    const games = [
      game({ id: "a" }),
      game({ id: "b", game_type: "plo", big_blind_rub: "95", is_editor_pick: true }),
      game({ id: "c", big_blind_rub: null }),
    ];
    const ids = (filters: Parameters<typeof applyCashFilters>[1]) =>
      applyCashFilters(games, filters).map((item) => item.id);
    expect(ids({ games: ["plo"], stakes: [], picked: false })).toEqual(["b"]);
    // Без курса ставка неизвестна — при фильтре ставок лимит не показываем.
    expect(ids({ games: [], stakes: ["low"], picked: false })).toEqual(["a"]);
    expect(ids({ games: [], stakes: [], picked: true })).toEqual(["b"]);
  });

  it("группы по игре: от младших ставок, при равных — где больше столов", () => {
    const games = [
      game({ id: "plo", game_type: "plo" }),
      game({ id: "high", big_blind_rub: "190" }),
      game({ id: "narrow", tables: 1 }),
      game({ id: "wide", tables: 6 }),
    ];
    expect(groupByGame(games).map(([type, items]) => [type, items.map((g) => g.id)])).toEqual([
      ["nlh", ["wide", "narrow", "high"]],
      ["plo", ["plo"]],
    ]);
    expect(totalTables(games)).toBe(13);
  });
});
