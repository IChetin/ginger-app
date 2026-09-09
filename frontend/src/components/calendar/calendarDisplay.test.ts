import { describe, expect, it } from "vitest";

import type { CalendarSeriesItem } from "@/api/types/schedule";
import {
  applyRangeTap,
  filterSeriesByDay,
  formatCalendarRangeChip,
  formatPeriodBarLabel,
  getDayDots,
  parseMonthKey,
  rangeCellRole,
  readDayFromSearchParams,
  readMonthFromSearchParams,
  sortCalendarSeries,
} from "@/components/calendar/calendarDisplay";
import { buildMonthGrid } from "@/features/schedule/lib/calendarGrid";
import { seriesItemFixture } from "@/test/fixtures";

function series(overrides: Partial<CalendarSeriesItem>): CalendarSeriesItem {
  return { ...seriesItemFixture, is_bookmarked: false, ...overrides };
}

describe("parseMonthKey", () => {
  it("parses valid month keys", () => {
    expect(parseMonthKey("2026-08")).toEqual({
      year: 2026,
      month: 8,
      monthKey: "2026-08",
    });
  });

  it("rejects invalid month keys", () => {
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("bad")).toBeNull();
  });
});

describe("readMonthFromSearchParams", () => {
  it("falls back to current month", () => {
    const now = new Date(2026, 7, 2);
    const result = readMonthFromSearchParams(new URLSearchParams(), now);
    expect(result.monthKey).toBe("2026-08");
  });
});

describe("readDayFromSearchParams", () => {
  it("keeps only day inside selected month", () => {
    const month = { year: 2026, month: 8, monthKey: "2026-08" };
    expect(readDayFromSearchParams(new URLSearchParams("day=2026-08-02"), month)).toBe(
      "2026-08-02",
    );
    expect(readDayFromSearchParams(new URLSearchParams("day=2026-07-31"), month)).toBeNull();
  });
});

describe("applyRangeTap", () => {
  it("starts, completes, swaps, and clears edges", () => {
    expect(applyRangeTap({ from: null, to: null }, "2026-08-10")).toEqual({
      kind: "state",
      from: "2026-08-10",
      to: null,
    });
    expect(applyRangeTap({ from: "2026-08-24", to: null }, "2026-08-10")).toEqual({
      kind: "state",
      from: "2026-08-10",
      to: "2026-08-24",
    });
    expect(applyRangeTap({ from: "2026-08-10", to: null }, "2026-08-10")).toEqual({
      kind: "state",
      from: null,
      to: null,
    });
    expect(applyRangeTap({ from: "2026-08-10", to: "2026-08-24" }, "2026-08-10")).toEqual({
      kind: "state",
      from: "2026-08-24",
      to: null,
    });
    expect(applyRangeTap({ from: "2026-08-10", to: "2026-08-10" }, "2026-08-10")).toEqual({
      kind: "state",
      from: null,
      to: null,
    });
  });

  it("rejects periods longer than 6 months", () => {
    expect(applyRangeTap({ from: "2026-08-10", to: null }, "2027-02-11")).toEqual({
      kind: "too_long",
      from: "2026-08-10",
    });
    expect(applyRangeTap({ from: "2026-08-10", to: null }, "2027-02-10")).toEqual({
      kind: "state",
      from: "2026-08-10",
      to: "2027-02-10",
    });
  });
});

describe("rangeCellRole", () => {
  it("marks start/end/in/only cells", () => {
    expect(rangeCellRole("2026-08-10", { from: "2026-08-10", to: null })).toBe("only");
    expect(rangeCellRole("2026-08-10", { from: "2026-08-10", to: "2026-08-24" })).toBe("start");
    expect(rangeCellRole("2026-08-24", { from: "2026-08-10", to: "2026-08-24" })).toBe("end");
    expect(rangeCellRole("2026-08-15", { from: "2026-08-10", to: "2026-08-24" })).toBe("in");
    expect(rangeCellRole("2026-08-09", { from: "2026-08-10", to: "2026-08-24" })).toBe("none");
  });
});

describe("formatPeriodBarLabel", () => {
  it("formats picking and complete labels", () => {
    expect(formatPeriodBarLabel("2026-08-10", null)).toBe("10 авг — выберите конец");
    expect(formatPeriodBarLabel("2026-08-10", "2026-08-24")).toBe("10 — 24 августа · 15 дней");
  });
});

describe("buildMonthGrid edge months", () => {
  it("builds February 2027 starting on Monday without padding before first day", () => {
    const grid = buildMonthGrid(2027, 2);
    expect(grid[0]?.isoDate).toBe("2027-02-01");
    expect(grid[0]?.inMonth).toBe(true);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(28);
  });

  it("builds month that starts on Monday with only in-month cells in first row", () => {
    const grid = buildMonthGrid(2026, 6);
    expect(grid[0]?.isoDate).toBe("2026-06-01");
    expect(grid[0]?.inMonth).toBe(true);
  });
});

describe("getDayDots", () => {
  it("prioritizes gold dots and limits to three", () => {
    const items = [
      series({ id: "1", starts_on: "2026-08-01", ends_on: "2026-08-10" }),
      series({ id: "2", starts_on: "2026-08-01", ends_on: "2026-08-10", is_bookmarked: true }),
      series({ id: "3", starts_on: "2026-08-01", ends_on: "2026-08-10", is_bookmarked: true }),
      series({ id: "4", starts_on: "2026-08-01", ends_on: "2026-08-10" }),
      series({ id: "5", starts_on: "2026-08-01", ends_on: "2026-08-10" }),
    ];
    expect(getDayDots(items, "2026-08-01", true)).toEqual(["gold", "gold", "gray"]);
  });

  it("shows only gray dots for guest mode", () => {
    const items = [
      series({ id: "1", starts_on: "2026-08-01", ends_on: "2026-08-10", is_bookmarked: true }),
    ];
    expect(getDayDots(items, "2026-08-01", false)).toEqual(["gray"]);
  });

  it("does not paint gold dots for past bookmarked series", () => {
    const items = [
      series({
        id: "past",
        starts_on: "2026-06-01",
        ends_on: "2026-06-10",
        status: "finished",
        is_bookmarked: true,
      }),
    ];
    expect(getDayDots(items, "2026-06-05", true)).toEqual(["gray"]);
  });
});

describe("formatCalendarRangeChip", () => {
  it("formats same-month range", () => {
    expect(
      formatCalendarRangeChip(series({ starts_on: "2026-08-01", ends_on: "2026-08-11" }), 2026, 8),
    ).toEqual({ main: "1–11", monthLabel: "авг" });
  });

  it("formats cross-month range ending in viewed month", () => {
    expect(
      formatCalendarRangeChip(series({ starts_on: "2026-07-30", ends_on: "2026-08-10" }), 2026, 8),
    ).toEqual({ main: "30.07–10", monthLabel: "авг" });
  });

  it("formats announced approximate date", () => {
    expect(
      formatCalendarRangeChip(
        series({ starts_on: "2026-08-25", ends_on: "2026-08-25", status: "announced" }),
        2026,
        8,
      ),
    ).toEqual({ main: "~25", monthLabel: "авг" });
  });
});

describe("sortCalendarSeries", () => {
  it("puts announced series last", () => {
    const items = sortCalendarSeries([
      series({ id: "ann", status: "announced", starts_on: "2026-08-01", ends_on: "2026-08-01" }),
      series({ id: "live", status: "running", starts_on: "2026-08-05", ends_on: "2026-08-07" }),
    ]);
    expect(items.map((item) => item.id)).toEqual(["live", "ann"]);
  });
});

describe("filterSeriesByDay", () => {
  it("filters active series for selected day", () => {
    const items = [
      series({ id: "a", starts_on: "2026-08-01", ends_on: "2026-08-03" }),
      series({ id: "b", starts_on: "2026-08-05", ends_on: "2026-08-07" }),
    ];
    expect(filterSeriesByDay(items, "2026-08-02").map((item) => item.id)).toEqual(["a"]);
  });
});

describe("cross-month dots", () => {
  it("marks trailing days from previous month in August grid", () => {
    const items = [series({ id: "span", starts_on: "2026-07-30", ends_on: "2026-08-10" })];
    expect(getDayDots(items, "2026-07-30", false)).toEqual(["gray"]);
    expect(getDayDots(items, "2026-08-01", false)).toEqual(["gray"]);
  });
});
