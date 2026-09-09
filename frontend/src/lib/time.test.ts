import { describe, expect, it } from "vitest";

import {
  defaultSeriesDay,
  eachIsoDate,
  formatDayListTitle,
  formatDualTime,
  formatEventStartMeta,
  formatShortDayMonth,
  getBrowserTimezone,
  getUserTimezone,
  hasFutureFlights,
  lastFlightByStart,
  nearestFutureFlight,
  seriesDayIndex,
  setPreferredUserTimezone,
  todayInTimezone,
  venueLocalDate,
  weekdayShort,
  type FlightLike,
} from "@/lib/time";

function flight(
  id: string,
  utc: string,
  label: string | null = null,
  venueTimezone = "Europe/Kaliningrad",
): FlightLike {
  return { id, label, start_at: { utc, venue_timezone: venueTimezone } };
}

describe("eachIsoDate / seriesDayIndex", () => {
  it("builds inclusive range and day index", () => {
    expect(eachIsoDate("2026-08-01", "2026-08-03")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
    expect(seriesDayIndex("2026-08-01", "2026-08-11", "2026-08-03")).toEqual({
      day: 3,
      total: 11,
    });
  });
});

describe("formatDualTime", () => {
  it("shows Kaliningrad venue time and Moscow user time", () => {
    // 19:00 Europe/Kaliningrad (UTC+2 in Aug) = 17:00 UTC = 20:00 Europe/Moscow
    const dual = formatDualTime("2026-08-02T17:00:00.000Z", "Europe/Kaliningrad", "Europe/Moscow");
    expect(dual.venue).toBe("19:00");
    expect(dual.user).toBe("20:00 у вас");
  });

  it("hides user line when timezones match", () => {
    const dual = formatDualTime(
      "2026-08-02T17:00:00.000Z",
      "Europe/Kaliningrad",
      "Europe/Kaliningrad",
    );
    expect(dual.venue).toBe("19:00");
    expect(dual.user).toBeNull();
  });

  it("crosses midnight: venue still previous day, user already next day", () => {
    // 23:30 Europe/Moscow = 20:30 UTC; in Asia/Vladivostok (UTC+10) = 06:30 next day
    const dual = formatDualTime("2026-08-02T20:30:00.000Z", "Europe/Moscow", "Asia/Vladivostok");
    expect(dual.venue).toBe("23:30");
    expect(dual.user).toBe("06:30 у вас");

    expect(venueLocalDate("2026-08-02T20:30:00.000Z", "Europe/Moscow")).toBe("2026-08-02");
    expect(venueLocalDate("2026-08-02T20:30:00.000Z", "Asia/Vladivostok")).toBe("2026-08-03");
  });
});

describe("labels and defaults", () => {
  it("formats weekday titles", () => {
    expect(weekdayShort("2026-08-02")).toBe("вс");
    expect(formatDayListTitle("2026-08-02")).toBe("Воскресенье, 2 августа");
    expect(formatShortDayMonth("2026-08-03")).toBe("3 авг");
  });

  it("defaults running series to venue-local today", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    expect(defaultSeriesDay("2026-08-01", "2026-08-11", "running", "Europe/Kaliningrad", now)).toBe(
      todayInTimezone("Europe/Kaliningrad", now),
    );
  });

  it("defaults published series to starts_on", () => {
    expect(
      defaultSeriesDay("2026-08-01", "2026-08-11", "schedule_published", "Europe/Kaliningrad"),
    ).toBe("2026-08-01");
  });

  it("computes venue-local date from UTC", () => {
    expect(venueLocalDate("2026-09-01T23:30:00.000Z", "Europe/Moscow")).toBe("2026-09-02");
  });
});

describe("nearest / last flight helpers", () => {
  const pastA = flight("a", "2026-08-01T10:00:00.000Z", "1A");
  const pastB = flight("b", "2026-08-02T10:00:00.000Z", "1B");
  const futureC = flight("c", "2026-08-04T17:00:00.000Z", "Day 1C");
  const futureD = flight("d", "2026-08-05T11:00:00.000Z", "Day 2");
  const now = new Date("2026-08-03T12:00:00.000Z");

  it("returns null nearest when all past; last is latest", () => {
    const flights = [pastA, pastB];
    expect(nearestFutureFlight(flights, now)).toBeNull();
    expect(hasFutureFlights(flights, now)).toBe(false);
    expect(lastFlightByStart(flights)?.id).toBe("b");
    const meta = formatEventStartMeta(pastB, {
      kind: "last",
      userTimezone: "Europe/Moscow",
    });
    expect(meta.startsWith("Последний старт: 1B ·")).toBe(true);
  });

  it("picks earliest future among mixed flights", () => {
    const flights = [pastA, futureD, futureC];
    expect(nearestFutureFlight(flights, now)?.id).toBe("c");
    expect(hasFutureFlights(flights, now)).toBe(true);
    const meta = formatEventStartMeta(futureC, {
      kind: "nearest",
      userTimezone: "Europe/Moscow",
    });
    expect(meta).toContain("Ближайший старт: Day 1C ·");
    expect(meta).toContain("19:00");
    expect(meta).toContain("20:00 у вас");
  });

  it("handles all-future and single unlabeled flight", () => {
    const unlabeled = flight("u", "2026-08-04T17:00:00.000Z", null);
    expect(nearestFutureFlight([futureD, futureC], now)?.id).toBe("c");
    const meta = formatEventStartMeta(unlabeled, {
      kind: "nearest",
      userTimezone: "Europe/Kaliningrad",
      singleUnlabeled: true,
    });
    expect(meta).toBe("Ближайший старт: вт, 4 августа · 19:00");
    expect(meta).not.toContain("null");
  });
});

describe("getUserTimezone preference", () => {
  it("falls back to browser and accepts a manual override", () => {
    setPreferredUserTimezone(null);
    expect(getUserTimezone()).toBe(getBrowserTimezone());
    setPreferredUserTimezone("Asia/Nicosia");
    expect(getUserTimezone()).toBe("Asia/Nicosia");
    setPreferredUserTimezone(null);
    expect(getUserTimezone()).toBe(getBrowserTimezone());
  });
});
