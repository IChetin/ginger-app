import { describe, expect, it } from "vitest";

import { buildMonthGrid, shiftMonth, WEEKDAY_LABELS } from "@/features/schedule/lib/calendarGrid";

describe("buildMonthGrid", () => {
  it("starts weeks on Monday", () => {
    expect(WEEKDAY_LABELS[0]).toBe("Пн");
    // 2026-08-01 is Saturday → first cell should be Monday 2026-07-27
    const grid = buildMonthGrid(2026, 8);
    expect(grid[0]?.isoDate).toBe("2026-07-27");
    expect(grid.find((cell) => cell.isoDate === "2026-08-01")?.inMonth).toBe(true);
  });
});

describe("shiftMonth", () => {
  it("rolls year boundaries", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
});
