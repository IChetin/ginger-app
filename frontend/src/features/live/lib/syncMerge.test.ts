import { describe, expect, it } from "vitest";

import type { LiveEventRead, LiveSessionRead } from "@/api/types/live";
import type { LocalLiveEvent, LocalLiveSession } from "@/features/live/lib/liveIdb";
import { mergeServerSession } from "@/features/live/lib/sync";

function serverSession(events: LiveEventRead[]): LiveSessionRead {
  return {
    id: "s1",
    event_id: "e1",
    flight_id: "f1",
    manual_name: null,
    manual_venue: null,
    manual_buyin: null,
    manual_currency: null,
    started_at: "2026-08-12T20:00:00Z",
    finished_at: null,
    status: "active",
    place: null,
    field_size: null,
    payout: null,
    result_id: null,
    display_name: "Test",
    display_series: "Series",
    buyin: "10000",
    currency: { code: "RUB", symbol: "₽" },
    reentry_allowed: true,
    events,
    created_at: "2026-08-12T20:00:00Z",
    updated_at: "2026-08-12T20:00:00Z",
  };
}

function localSession(events: LocalLiveEvent[]): LocalLiveSession {
  const base = serverSession(events.map(({ deleted_at: _d, ...rest }) => rest));
  return { ...base, events };
}

describe("mergeServerSession", () => {
  it("keeps local pending events wiped by empty create_session response", () => {
    const existing = localSession([
      {
        id: "local-entry",
        type: "entry",
        amount: "10000",
        currency_code: "RUB",
        text: null,
        occurred_at: "2026-08-12T20:00:00Z",
        created_at: "2026-08-12T20:00:00Z",
        deleted_at: null,
      },
    ]);
    const merged = mergeServerSession(serverSession([]), existing);
    expect(merged.events.map((e) => e.id)).toEqual(["local-entry"]);
  });

  it("prefers server events and appends only unknown local ids", () => {
    const server = serverSession([
      {
        id: "server-entry",
        type: "entry",
        amount: "10000",
        currency_code: "RUB",
        text: null,
        occurred_at: "2026-08-12T20:00:00Z",
        created_at: "2026-08-12T20:00:00Z",
      },
    ]);
    const existing = localSession([
      {
        id: "local-entry",
        type: "entry",
        amount: "10000",
        currency_code: "RUB",
        text: null,
        occurred_at: "2026-08-12T20:00:00Z",
        created_at: "2026-08-12T20:00:00Z",
        deleted_at: null,
      },
      {
        id: "re1",
        type: "reentry",
        amount: "10000",
        currency_code: "RUB",
        text: null,
        occurred_at: "2026-08-12T20:01:00Z",
        created_at: "2026-08-12T20:01:00Z",
        deleted_at: null,
      },
    ]);
    const merged = mergeServerSession(server, existing);
    expect(merged.events.map((e) => e.id).sort()).toEqual(["re1", "server-entry"]);
  });
});
