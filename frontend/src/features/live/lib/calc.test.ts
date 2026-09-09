import { describe, expect, it } from "vitest";

import type { LiveEventRead } from "@/api/types/live";
import {
  entriesCount,
  formatDuration,
  investedTotal,
  sessionProfit,
} from "@/features/live/lib/calc";

function ev(
  partial: Partial<LiveEventRead> & Pick<LiveEventRead, "id" | "type">,
): LiveEventRead {
  return {
    amount: null,
    currency_code: "RUB",
    text: null,
    occurred_at: "2026-08-08T17:00:00Z",
    created_at: "2026-08-08T17:00:00Z",
    ...partial,
  };
}

describe("live calc", () => {
  const events: LiveEventRead[] = [
    ev({ id: "1", type: "entry", amount: "44000" }),
    ev({ id: "2", type: "reentry", amount: "44000" }),
    ev({ id: "3", type: "reentry", amount: "44000" }),
    ev({ id: "4", type: "note", text: "note" }),
  ];

  it("sums investments and counts entries", () => {
    expect(investedTotal(events)).toBe(132_000);
    expect(entriesCount(events)).toBe(3);
  });

  it("computes profit", () => {
    expect(sessionProfit(events, 285_000)).toBe(153_000);
    expect(sessionProfit(events, 0)).toBe(-132_000);
  });

  it("formats duration", () => {
    const started = "2026-08-08T16:00:00.000Z";
    const now = Date.parse("2026-08-08T20:20:00.000Z");
    expect(formatDuration(started, now)).toBe("4 ч 20 мин");
  });
});
