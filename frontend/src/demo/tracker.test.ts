import { describe, expect, it } from "vitest";

import fixture from "@/demo/tracker.json";
import {
  computeDemoChart,
  computeDemoStats,
  convertAmount,
  listDemoFilters,
  listDemoResults,
  selectDemoConverted,
  shiftedDemoResults,
} from "@/demo/tracker";
import type { DemoResultRow } from "@/demo/tracker";

const NOW = new Date(Date.UTC(2026, 8, 1));

function independentTotals(rows: DemoResultRow[], base: string) {
  let invested = 0;
  let won = 0;
  let entries = 0;
  let itm = 0;
  for (const row of rows) {
    const buyin = convertAmount(row.buyin, row.currency_code, base);
    invested += Math.round(buyin * row.entries_count * 100) / 100;
    const payout = convertAmount(row.payout, row.currency_code, base);
    won += payout;
    entries += row.entries_count;
    if (payout > 0) itm += 1;
  }
  invested = Math.round(invested * 100) / 100;
  won = Math.round(won * 100) / 100;
  const profit = Math.round((won - invested) * 100) / 100;
  return {
    tournaments: rows.length,
    entries,
    invested,
    won,
    profit,
    roi: Math.round((profit / invested) * 10000) / 100,
    abi: Math.round((invested / entries) * 100) / 100,
    itm: Math.round((itm / rows.length) * 10000) / 100,
  };
}

describe("demo tracker fixtures", () => {
  it("has 18–25 results spanning about six months with mixed currencies and re-entries", () => {
    const rows = fixture.results as DemoResultRow[];
    expect(rows.length).toBeGreaterThanOrEqual(18);
    expect(rows.length).toBeLessThanOrEqual(25);

    const dates = rows.map((row) => row.played_on).sort();
    const first = new Date(`${dates[0]}T00:00:00Z`);
    const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
    const months = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth();
    expect(months).toBeGreaterThanOrEqual(5);
    expect(months).toBeLessThanOrEqual(7);

    expect(rows.some((row) => row.currency_code === "BYN")).toBe(true);
    expect(rows.some((row) => row.currency_code === "USD")).toBe(true);
    expect(rows.filter((row) => row.entries_count >= 2).length).toBeGreaterThanOrEqual(3);
    expect(rows.some((row) => row.series_text === "RPT Kaliningrad")).toBe(true);
    expect(rows.some((row) => row.series_text === "EAPT Minsk")).toBe(true);
  });

  it("computes ROI ~20–30%, ITM ~25–30% and ABI from entries (manual check)", () => {
    const stats = computeDemoStats({}, "RUB", NOW);
    const rows = shiftedDemoResults(NOW);
    const expected = independentTotals(rows, "RUB");

    expect(Number(stats.invested)).toBeCloseTo(expected.invested, 1);
    expect(Number(stats.won)).toBeCloseTo(expected.won, 1);
    expect(Number(stats.profit)).toBeCloseTo(expected.profit, 1);
    expect(Number(stats.roi)).toBeCloseTo(expected.roi, 1);
    expect(Number(stats.abi)).toBeCloseTo(expected.abi, 1);
    expect(Number(stats.itm)).toBeCloseTo(expected.itm, 1);
    expect(stats.entries).toBe(expected.entries);
    expect(stats.tournaments).toBe(expected.tournaments);

    // ABI = invested / entries, not / tournaments (re-entries matter).
    expect(stats.entries).toBeGreaterThan(stats.tournaments);
    expect(Number(stats.abi)).toBeCloseTo(expected.invested / expected.entries, 1);

    const roi = Number(stats.roi);
    const itm = Number(stats.itm);
    expect(roi).toBeGreaterThanOrEqual(20);
    expect(roi).toBeLessThanOrEqual(30);
    expect(itm).toBeGreaterThanOrEqual(25);
    expect(itm).toBeLessThanOrEqual(30);
    expect(Number(stats.profit)).toBeGreaterThan(0);
  });

  it("builds a cumulative chart with dips and recoveries", () => {
    const chart = computeDemoChart({}, "RUB", NOW);
    expect(chart.points.length).toBe(22);
    const values = chart.points.map((point) => Number(point.cumulative_profit));
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(0);
    expect(values[values.length - 1]).toBeGreaterThan(0);
    const hasDrop = values.some((value, index) => index > 0 && value < values[index - 1]);
    const hasRise = values.some((value, index) => index > 0 && value > values[index - 1]);
    expect(hasDrop).toBe(true);
    expect(hasRise).toBe(true);
  });

  it("converts BYN/USD into the selected base currency", () => {
    const rub = convertAmount("550.00", "USD", "RUB");
    expect(rub).toBe(49500);
    const bynToUsd = convertAmount("400.00", "BYN", "USD");
    expect(bynToUsd).toBeCloseTo((400 * 28) / 90, 2);

    const usdStats = computeDemoStats({}, "USD", NOW);
    const expected = independentTotals(shiftedDemoResults(NOW), "USD");
    expect(Number(usdStats.profit)).toBeCloseTo(expected.profit, 1);
    expect(usdStats.base_currency).toBe("USD");
  });

  it("filters by series slug and period without touching linked IDs", () => {
    const minsk = selectDemoConverted({ series: "eapt-minsk" }, "RUB", NOW);
    expect(minsk.length).toBe(4);
    expect(minsk.every((item) => item.row.series_text === "EAPT Minsk")).toBe(true);

    const unlinked = selectDemoConverted({ series: "none" }, "RUB", NOW);
    expect(unlinked.length).toBe(3);
    expect(unlinked.every((item) => item.row.series_id == null)).toBe(true);

    const month = selectDemoConverted({ date_from: "2026-09-01", date_to: "2026-09-01" }, "RUB", NOW);
    expect(month).toHaveLength(1);
    expect(month[0]?.row.name).toBe("Sunday Special");

    const options = listDemoFilters(NOW);
    expect(options.series.map((item) => item.name)).toEqual([
      "EAPT Cyprus",
      "EAPT Minsk",
      "RPT Kaliningrad",
    ]);
    expect(options.unlinked_count).toBe(3);
  });

  it("paginates results newest-first", () => {
    const page = listDemoResults({ limit: 5, offset: 0 }, "RUB", NOW);
    expect(page.total).toBe(22);
    expect(page.items).toHaveLength(5);
    expect(page.items[0]?.name).toBe("Sunday Special");
    expect(page.items[0]?.played_on).toBe("2026-09-01");
  });
});
