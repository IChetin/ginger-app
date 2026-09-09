import { describe, expect, it } from "vitest";

import {
  countdownLabel,
  effectiveSeriesPhase,
  isSeriesOver,
  organizerAbbrev,
  seriesCardDataParts,
  seriesMetaLine,
  seriesStatsLine,
} from "@/components/series/seriesDisplay";
import { seriesItemFixture } from "@/test/fixtures";

describe("seriesCardDataParts", () => {
  it("shows today count for running even when zero", () => {
    expect(
      seriesCardDataParts({
        ...seriesItemFixture,
        status: "schedule_published",
        starts_on: "2026-07-20",
        ends_on: "2026-08-10",
        today_events_count: 0,
        highlight: null,
        min_buyins: [],
        venue: { ...seriesItemFixture.venue, timezone: "UTC" },
      }),
    ).toEqual([{ text: "Сегодня 0 турниров", emphasis: true }]);
  });

  it("adds highlight for date-running series", () => {
    expect(
      seriesCardDataParts({
        ...seriesItemFixture,
        status: "running",
        starts_on: "2026-07-20",
        ends_on: "2026-08-10",
        today_events_count: 4,
        highlight: { name: "Main Event", date: "2026-08-08" },
        venue: { ...seriesItemFixture.venue, timezone: "UTC" },
      }),
    ).toEqual([
      { text: "Сегодня 4 турнира", emphasis: true },
      { text: "Main Event 8 авг" },
    ]);
  });

  it("shows announce copy for future announced", () => {
    expect(
      seriesCardDataParts({
        ...seriesItemFixture,
        status: "announced",
        starts_on: "2026-11-01",
        ends_on: "2026-11-10",
        events_count: 0,
        min_buyins: [],
        venue: { ...seriesItemFixture.venue, timezone: "UTC" },
      }),
    ).toEqual([{ text: "Сетка ещё не опубликована" }]);
  });
});

describe("countdownLabel", () => {
  it("never returns Скоро", () => {
    expect(countdownLabel("2026-08-06", "2026-08-05")).toBe("завтра");
    expect(countdownLabel("2026-08-08", "2026-08-05")).toBe("через 3 дня");
    expect(countdownLabel("2026-10-15", "2026-08-05")).toBe("в октябре");
    expect(countdownLabel("2026-07-01", "2026-08-05")).toBe("в июле");
  });
});

describe("effectiveSeriesPhase", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  it("treats date overlap as running even if DB says schedule_published", () => {
    expect(
      effectiveSeriesPhase(
        {
          ...seriesItemFixture,
          status: "schedule_published",
          starts_on: "2026-07-20",
          ends_on: "2026-08-05",
          venue: { ...seriesItemFixture.venue, timezone: "UTC" },
        },
        { now },
      ),
    ).toBe("running");
  });

  it("marks past ends_on as past", () => {
    expect(
      effectiveSeriesPhase(
        {
          ...seriesItemFixture,
          status: "schedule_published",
          starts_on: "2026-07-01",
          ends_on: "2026-07-14",
          venue: { ...seriesItemFixture.venue, timezone: "UTC" },
        },
        { now },
      ),
    ).toBe("past");
  });
});

describe("organizerAbbrev", () => {
  it("prefers slug", () => {
    expect(organizerAbbrev(seriesItemFixture)).toBe("RPT");
  });

  it("falls back to series name initials when slug empty", () => {
    expect(
      organizerAbbrev({
        ...seriesItemFixture,
        name: "Sochi Poker Festival",
        organizer: { ...seriesItemFixture.organizer, slug: "" },
      }),
    ).toBe("SPF");
  });
});

describe("seriesStatsLine", () => {
  it("hides zero tournament count", () => {
    expect(
      seriesStatsLine({
        ...seriesItemFixture,
        events_count: 0,
        min_buyins: [],
        status: "schedule_published",
      }),
    ).toBe("сетка опубликована");
  });

  it("omits buy-in when min_buyins is empty (no dangling separators)", () => {
    expect(
      seriesStatsLine({
        ...seriesItemFixture,
        events_count: 2,
        min_buyins: [],
        status: "schedule_published",
      }),
    ).toBe("2 турнира · сетка опубликована");
  });

  it("joins buy-in and schedule status without dangling separators", () => {
    const line = seriesStatsLine({
      ...seriesItemFixture,
      events_count: 0,
      status: "schedule_published",
      min_buyins: [{ amount: "5000.00", currency: { code: "RUB", symbol: "₽" } }],
    });
    expect(line).toMatch(/^от 5[\s\u00a0\u202f]000 ₽ · сетка опубликована$/);
  });

  it("shows tournament count when non-zero", () => {
    const line = seriesStatsLine(seriesItemFixture);
    expect(line).toContain("3 турнира");
    expect(line).toContain("сетка опубликована");
    expect(line).toMatch(/от 11[\s\u00a0\u202f]000 ₽/);
  });
});

describe("seriesMetaLine", () => {
  it("does not duplicate city when venue name equals city", () => {
    expect(
      seriesMetaLine({
        ...seriesItemFixture,
        starts_on: "2026-08-17",
        ends_on: "2026-08-30",
        venue: {
          ...seriesItemFixture.venue,
          name: "Калининград",
          city: "Калининград",
        },
        country: { code: "RU", name_ru: "Россия" },
      }),
    ).toBe("17–30 августа · 🇷🇺 Калининград");
  });

  it("keeps distinct venue name and city", () => {
    expect(
      seriesMetaLine({
        ...seriesItemFixture,
        starts_on: "2026-08-01",
        ends_on: "2026-08-11",
        venue: {
          ...seriesItemFixture.venue,
          name: "Sobranie Casino",
          city: "Калининград",
        },
      }),
    ).toBe("1–11 августа · Sobranie Casino · 🇷🇺 Калининград");
  });
});

// BUG-3: a past series could still be bookmarked.
describe("isSeriesOver", () => {
  const options = { now: new Date("2026-08-05T12:00:00.000Z"), userTimezone: "UTC" };

  it("is true for finished and cancelled", () => {
    expect(isSeriesOver({ status: "finished", ends_on: "2026-09-01" }, options)).toBe(true);
    expect(isSeriesOver({ status: "cancelled", ends_on: "2026-09-01" }, options)).toBe(true);
  });

  it("is true when the last day is behind us", () => {
    expect(isSeriesOver({ status: "running", ends_on: "2026-08-04" }, options)).toBe(true);
  });

  it("is false on the last day and for future series", () => {
    expect(isSeriesOver({ status: "running", ends_on: "2026-08-05" }, options)).toBe(false);
    expect(isSeriesOver({ status: "announced", ends_on: "2026-11-10" }, options)).toBe(false);
  });
});
