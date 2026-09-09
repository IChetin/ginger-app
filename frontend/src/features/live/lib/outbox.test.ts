import { describe, expect, it } from "vitest";

import { coalesceOutbox, type OutboxItem } from "@/features/live/lib/liveIdb";

function item(kind: OutboxItem["kind"], payload: Record<string, unknown>, seq = 1): OutboxItem {
  return { seq, kind, payload, created_at: new Date().toISOString() };
}

describe("live outbox coalesce", () => {
  it("folds patch into pending create_events", () => {
    const queue = [
      item("create_events", {
        session_id: "s1",
        events: [{ id: "e1", type: "reentry", amount: "44000", occurred_at: "t" }],
      }),
    ];
    const next = coalesceOutbox(
      queue,
      item("patch_event", { id: "e1", amount: "40000" }, 2),
    );
    expect(next).toHaveLength(1);
    expect(next[0].kind).toBe("create_events");
    const events = next[0].payload.events as { id: string; amount: string }[];
    expect(events[0].amount).toBe("40000");
  });

  it("drops create+delete of same event", () => {
    const queue = [
      item("create_events", {
        session_id: "s1",
        events: [
          { id: "e1", type: "reentry", amount: "44000", occurred_at: "t" },
          { id: "e2", type: "note", text: "x", occurred_at: "t" },
        ],
      }),
    ];
    const next = coalesceOutbox(queue, item("delete_event", { id: "e1" }, 2));
    const events = next[0].payload.events as { id: string }[];
    expect(events.map((e) => e.id)).toEqual(["e2"]);
  });

  it("preserves order of distinct create then finish", () => {
    const queue = [item("create_session", { id: "s1" }, 1)];
    const withEvents = coalesceOutbox(
      queue,
      item(
        "create_events",
        { session_id: "s1", events: [{ id: "e1", type: "entry", amount: "1", occurred_at: "t" }] },
        2,
      ),
    );
    const withFinish = coalesceOutbox(
      withEvents,
      item("finish", { session_id: "s1", body: { in_the_money: false, payout: "0" } }, 3),
    );
    expect(withFinish.map((i) => i.kind)).toEqual([
      "create_session",
      "create_events",
      "finish",
    ]);
  });
});
