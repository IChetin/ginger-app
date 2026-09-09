import { describe, expect, it } from "vitest";

import type { LiveCandidateRead } from "@/api/types/live";
import { eventDetailFixture } from "@/test/fixtures";

import {
  eventDisplayName,
  linkedStartFromCandidate,
  linkedStartFromEvent,
  pickLiveCandidate,
  pickLiveFlight,
} from "./pickLiveFlight";

function flight(id: string, utc: string, label: string | null = id) {
  return { id, label, start_at: { utc } };
}

function candidate(partial: Partial<LiveCandidateRead> & Pick<LiveCandidateRead, "event_id" | "flight_id" | "start_at">): LiveCandidateRead {
  return {
    name: "Main",
    series_name: "RPT",
    buyin: "44000.00",
    currency: { code: "RUB", symbol: "₽" },
    reentry_count: 1,
    reentry_unlimited: false,
    ...partial,
  };
}

describe("pickLiveFlight", () => {
  const early = flight("a", "2026-08-02T10:00:00.000Z", "1A");
  const mid = flight("b", "2026-08-03T17:00:00.000Z", "1B");
  const late = flight("c", "2026-08-31T12:00:00.000Z", "1C");
  const now = new Date("2026-08-31T11:00:00.000Z");

  it("returns null for an empty list", () => {
    expect(pickLiveFlight([], now)).toBeNull();
  });

  it("uses the preferred flight when it exists", () => {
    expect(pickLiveFlight([early, mid, late], now, "a")?.id).toBe("a");
  });

  it("falls back to nearest by time if preferred id is unknown", () => {
    expect(pickLiveFlight([early, mid, late], now, "missing")?.id).toBe("c");
  });

  it("picks the start closest to now when no flight is selected", () => {
    expect(pickLiveFlight([early, mid, late], now)?.id).toBe("c");
    expect(pickLiveFlight([early, mid], new Date("2026-08-02T12:00:00.000Z"))?.id).toBe("a");
  });
});

describe("pickLiveCandidate", () => {
  const now = new Date("2026-08-31T11:00:00.000Z");
  const items = [
    candidate({ event_id: "e1", flight_id: "f1", start_at: "2026-08-31T08:00:00.000Z" }),
    candidate({ event_id: "e1", flight_id: "f2", start_at: "2026-08-31T12:00:00.000Z" }),
    candidate({ event_id: "e2", flight_id: "f3", start_at: "2026-08-31T11:05:00.000Z" }),
  ];

  it("returns null when the event is not in the list", () => {
    expect(pickLiveCandidate(items, "missing", null, now)).toBeNull();
  });

  it("binds to the requested flight of this event", () => {
    expect(pickLiveCandidate(items, "e1", "f1", now)?.flight_id).toBe("f1");
  });

  it("picks the nearest flight of this event and ignores others", () => {
    expect(pickLiveCandidate(items, "e1", null, now)?.flight_id).toBe("f2");
  });
});

describe("linked start payloads", () => {
  it("maps a candidate", () => {
    const payload = linkedStartFromCandidate(
      candidate({
        event_id: "e1",
        flight_id: "f1",
        start_at: "2026-08-31T12:00:00.000Z",
        name: "#5 Main · Day 1A",
        reentry_unlimited: true,
      }),
    );
    expect(payload.event_id).toBe("e1");
    expect(payload.flight_id).toBe("f1");
    expect(payload.display_name).toBe("#5 Main · Day 1A");
    expect(payload.reentry_allowed).toBe(true);
  });

  it("maps an event + flight", () => {
    const payload = linkedStartFromEvent(eventDetailFixture, eventDetailFixture.flights[0]);
    expect(payload.event_id).toBe(eventDetailFixture.id);
    expect(payload.flight_id).toBe(eventDetailFixture.flights[0].id);
    expect(payload.display_name).toBe("#1 Main Event · A");
    expect(payload.display_series).toBe(eventDetailFixture.series.name);
    expect(payload.buyin).toBe(eventDetailFixture.buyin);
  });

  it("formats a name without a number or label", () => {
    expect(eventDisplayName({ number: null, name: "Turbo" })).toBe("Turbo");
  });
});
