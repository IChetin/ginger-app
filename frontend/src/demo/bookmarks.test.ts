import { describe, expect, it } from "vitest";

import fixture from "@/demo/bookmarks.json";
import { listDemoBookmarks, venueLocalToUtc } from "@/demo/bookmarks";
import {
  formatCountdownChip,
  seriesShowsSchedulePending,
} from "@/features/bookmarks/lib/bookmarkDisplay";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const LATER = new Date("2026-10-15T09:30:00.000Z");

describe("demo bookmark fixtures", () => {
  it("has 3–4 tournament bookmarks and 2 series bookmarks", () => {
    expect(fixture.flights.length).toBeGreaterThanOrEqual(3);
    expect(fixture.flights.length).toBeLessThanOrEqual(4);
    expect(fixture.series).toHaveLength(2);
    expect(fixture.series.some((row) => row.series_status === "running")).toBe(true);
    expect(fixture.series.some((row) => row.series_status === "announced")).toBe(true);
  });

  it("uses distinct reminder offsets and public series/event urls", () => {
    const signatures = fixture.flights.map((row) => [...row.reminder_offsets].sort().join(","));
    expect(new Set(signatures).size).toBe(fixture.flights.length);
    for (const row of [...fixture.flights, ...fixture.series]) {
      expect(row.url.startsWith("/events/") || row.url.startsWith("/series/")).toBe(true);
    }
  });

  it("keeps the 5-hour countdown after the calendar moves", () => {
    for (const now of [NOW, LATER]) {
      const items = listDemoBookmarks(now);
      const today = items.find((item) => item.target_id === "demo-bk-flt-today");
      expect(today?.nearest_start_at).toBeTruthy();
      const chip = formatCountdownChip(
        today!.nearest_start_at!.utc,
        today!.nearest_start_at!.venue_timezone,
        now,
      );
      expect(chip).toEqual({ kind: "hours", primary: "5 ч", soon: true });
    }
  });

  it("places one flight tomorrow and two on the following week", () => {
    const items = listDemoBookmarks(NOW);
    const flights = items.filter((item) => item.target_type === "flight");
    expect(flights).toHaveLength(4);

    const tomorrow = flights.find((item) => item.target_id === "demo-bk-flt-tomorrow");
    const weekA = flights.find((item) => item.target_id === "demo-bk-flt-week-a");
    const weekB = flights.find((item) => item.target_id === "demo-bk-flt-week-b");
    expect(tomorrow?.nearest_start_at?.utc).toBe(
      venueLocalToUtc("2026-09-02", 19, 0, "Europe/Minsk").toISOString(),
    );
    expect(weekA?.nearest_start_at?.utc).toBe(
      venueLocalToUtc("2026-09-08", 14, 0, "Europe/Kaliningrad").toISOString(),
    );
    expect(weekB?.nearest_start_at?.utc).toBe(
      venueLocalToUtc("2026-09-11", 16, 0, "Europe/Moscow").toISOString(),
    );
  });

  it("keeps the announced series pending note and relative series dates", () => {
    const items = listDemoBookmarks(NOW);
    const running = items.find((item) => item.target_id === "demo-bk-series-running");
    const announced = items.find((item) => item.target_id === "demo-bk-series-announced");
    expect(running?.series_status).toBe("running");
    expect(running?.series_starts_on).toBe("2026-08-30");
    expect(running?.series_ends_on).toBe("2026-09-12");
    expect(announced?.series_status).toBe("announced");
    expect(seriesShowsSchedulePending(announced!.series_status)).toBe(true);
    expect(announced?.series_starts_on).toBe("2026-10-16");

    const later = listDemoBookmarks(LATER);
    const laterRunning = later.find((item) => item.target_id === "demo-bk-series-running");
    expect(laterRunning?.series_starts_on).toBe("2026-10-13");
    expect(laterRunning?.series_ends_on).toBe("2026-10-26");
  });

  it("names real catalog series and points at public slugs", () => {
    const items = listDemoBookmarks(NOW);
    expect(items.some((item) => item.series_name === "EAPT Georgia")).toBe(true);
    expect(items.some((item) => item.series_name === "Russian Poker Tour Минск")).toBe(true);
    expect(items.some((item) => item.url === "/series/rpt-minsk-2026-09")).toBe(true);
    expect(items.some((item) => item.url === "/events/eapt-batumi-2026-10-5-main-event")).toBe(true);
  });
});
