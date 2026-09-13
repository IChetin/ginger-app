import { describe, expect, it } from "vitest";

import type { AccountClub } from "@/api/types/chips";
import {
  amountPresets,
  computeTotals,
  formatMoney,
  formatRemaining,
  isOpen,
  parseAmount,
  statusLabel,
} from "@/features/chips/lib/format";

const ginger: AccountClub = {
  id: "g",
  name: "Ginger",
  slug: "ginger",
  app: "pppoker",
  chip_value: "1.0000",
  chip_currency_code: "USDT",
  currency_symbol: "$",
};
const ginger21: AccountClub = {
  ...ginger,
  id: "g21",
  name: "Ginger21",
  chip_currency_code: "RUB",
  currency_symbol: "₽",
};
const privateG: AccountClub = { ...ginger21, id: "pg", name: "Private.G", chip_value: "100" };

describe("chips format", () => {
  it("кнопки сумм по клубам (11.10)", () => {
    expect(amountPresets(ginger)).toEqual([10, 25, 50, 100]);
    expect(amountPresets(ginger21)).toEqual([1000, 3000, 5000, 10000]);
    expect(amountPresets(privateG)).toEqual([10, 30, 50, 100]);
  });

  it("итог в деньгах по валютам", () => {
    const totals = computeTotals([
      { club: ginger, amount: 100 },
      { club: ginger21, amount: 5000 },
      { club: privateG, amount: 10 },
    ]);
    expect(totals).toEqual([
      { code: "USDT", symbol: "$", amount: 100 },
      { code: "RUB", symbol: "₽", amount: 6000 },
    ]);
    expect(formatMoney(6000, "₽", "RUB").replace(/\s/g, " ")).toBe("₽6 000");
  });

  it("статусы", () => {
    expect(statusLabel("completed", "topup")).toBe("Выдана");
    expect(statusLabel("completed", "withdrawal")).toBe("Выведено");
    expect(isOpen("paid")).toBe(true);
    expect(isOpen("expired")).toBe(false);
  });

  it("ввод суммы и таймер", () => {
    expect(parseAmount("1 000,5")).toBe(1000.5);
    expect(parseAmount("abc")).toBe(0);
    expect(formatRemaining(18 * 60_000 + 42_000)).toBe("18:42");
    expect(formatRemaining(-5)).toBe("00:00");
  });
});
