import { describe, expect, it } from "vitest";

import type { BookmarkDisplayFields, BookmarkListItem } from "@/api/types/bookmarks";
import {
  formatCountdownChip,
  formatFlightBookmarkMeta,
  formatFlightBookmarkTitle,
  groupHistoryByLocalDay,
  isPastBookmarkItem,
  sortPastBookmarkListItems,
} from "@/features/bookmarks/lib/bookmarkDisplay";

const baseDisplay: BookmarkDisplayFields = {
  series_id: "s1",
  event_id: "e1",
  series_name: "RPT Kaliningrad",
  series_status: "running",
  series_starts_on: "2026-08-01",
  series_ends_on: "2026-08-11",
  organizer_name: "RPT",
  organizer_slug: "rpt",
  venue_name: "Sobranie",
  venue_city: "Калининград",
  event_number: 5,
  event_name: "Main Event",
  flight_label: "Day 1A",
  nearest_start_at: {
    utc: "2026-08-01T17:00:00.000Z",
    venue_local: "2026-08-01T19:00:00+02:00",
    venue_timezone: "Europe/Kaliningrad",
  },
  url: "/events/e1",
};

describe("formatCountdownChip", () => {
  it("shows gold hours when under 24h (5 ч)", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const chip = formatCountdownChip("2026-08-01T17:00:00.000Z", "Europe/Kaliningrad", now);
    expect(chip).toEqual({ kind: "hours", primary: "5 ч", soon: true });
  });

  it("shows day+month for next month start", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const chip = formatCountdownChip("2026-09-01T15:00:00.000Z", "Europe/Minsk", now);
    expect(chip.kind).toBe("date");
    expect(chip.primary).toBe("1");
    expect(chip.secondary).toBe("сен");
    expect(chip.soon).toBe(false);
  });
});

describe("formatFlightBookmarkMeta", () => {
  it("uses завтра for next venue-local day", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    // Kaliningrad UTC+2 → venue local 2026-08-01 is tomorrow from 2026-07-31
    const meta = formatFlightBookmarkMeta(baseDisplay, {
      now,
      userTimezone: "Europe/Moscow",
    });
    expect(meta).toContain("завтра");
    expect(meta).toContain("RPT Kaliningrad");
  });
});

describe("formatFlightBookmarkTitle", () => {
  it("builds #N name · label", () => {
    expect(formatFlightBookmarkTitle(baseDisplay)).toBe("#5 Main Event · Day 1A");
  });
});

// BUG-3: past series and flights landed in the «Предстоящие» list.
describe("isPastBookmarkItem", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");
  const options = { now, userTimezone: "UTC" };

  const listItem = (overrides: Partial<BookmarkListItem>): BookmarkListItem =>
    ({
      key: "k",
      source: "server",
      bookmarkId: "b",
      target_type: "series",
      target_id: "s1",
      reminder_offsets: [],
      created_at: "2026-01-01T00:00:00Z",
      ...baseDisplay,
      ...overrides,
    }) as BookmarkListItem;

  it("treats a flight that already started as past", () => {
    expect(isPastBookmarkItem(listItem({ target_type: "flight" }), options)).toBe(true);
  });

  it("keeps a future flight in upcoming", () => {
    const item = listItem({
      target_type: "flight",
      nearest_start_at: {
        utc: "2026-08-09T17:00:00.000Z",
        venue_local: "2026-08-09T19:00:00+02:00",
        venue_timezone: "Europe/Kaliningrad",
      },
    });
    expect(isPastBookmarkItem(item, options)).toBe(false);
  });

  it("keeps a flight without a known start in upcoming", () => {
    const item = listItem({ target_type: "flight", nearest_start_at: null });
    expect(isPastBookmarkItem(item, options)).toBe(false);
  });

  it("treats a series whose last day passed as past even without nearest start", () => {
    const item = listItem({
      series_status: "running",
      series_ends_on: "2026-08-04",
      nearest_start_at: null,
    });
    expect(isPastBookmarkItem(item, options)).toBe(true);
  });

  it("treats finished and cancelled series as past", () => {
    expect(isPastBookmarkItem(listItem({ series_status: "finished" }), options)).toBe(true);
    expect(isPastBookmarkItem(listItem({ series_status: "cancelled" }), options)).toBe(true);
  });

  it("keeps a running series with a future last day in upcoming", () => {
    const item = listItem({ series_status: "running", series_ends_on: "2026-08-11" });
    expect(isPastBookmarkItem(item, options)).toBe(false);
  });

  it("keeps an announced series without a schedule in upcoming", () => {
    const item = listItem({
      series_status: "announced",
      series_starts_on: "2026-11-01",
      series_ends_on: "2026-11-10",
      nearest_start_at: null,
    });
    expect(isPastBookmarkItem(item, options)).toBe(false);
  });

  it("sorts past items most recent first", () => {
    const older = listItem({ key: "older", series_ends_on: "2026-06-01", nearest_start_at: null });
    const newer = listItem({ key: "newer", series_ends_on: "2026-07-20", nearest_start_at: null });
    expect(sortPastBookmarkListItems([older, newer]).map((item) => item.key)).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("groupHistoryByLocalDay", () => {
  it("groups into Сегодня / Вчера / date", () => {
    const now = new Date("2026-08-02T15:00:00.000Z");
    const groups = groupHistoryByLocalDay(
      [
        {
          id: "1",
          sent_at: "2026-08-02T09:00:00.000Z",
          created_at: "2026-08-02T09:00:00.000Z",
        },
        {
          id: "2",
          sent_at: "2026-08-01T17:00:00.000Z",
          created_at: "2026-08-01T17:00:00.000Z",
        },
        {
          id: "3",
          sent_at: "2026-07-28T10:00:00.000Z",
          created_at: "2026-07-28T10:00:00.000Z",
        },
      ],
      { userTimezone: "UTC", now },
    );
    expect(groups.map((g) => g.label)).toEqual(["Сегодня", "Вчера", "28 июля"]);
  });
});
