import { describe, expect, it, vi } from "vitest";

import { formatFlightDateTime, formatMoney } from "@/features/schedule/lib/format";

describe("formatFlightDateTime", () => {
  it("does not duplicate time when user timezone matches venue", () => {
    const result = formatFlightDateTime(
      {
        utc: "2026-08-01T11:00:00+00:00",
        venue_local: "2026-08-01T14:00:00+03:00",
        venue_timezone: "Europe/Moscow",
      },
      "Europe/Moscow",
    );
    expect(result.venue).toContain("Europe/Moscow");
    expect(result.user).toBeNull();
  });

  it("adds user local time for another timezone", () => {
    vi.stubGlobal("Intl", Intl);
    const result = formatFlightDateTime(
      {
        utc: "2026-08-01T11:00:00+00:00",
        venue_local: "2026-08-01T14:00:00+03:00",
        venue_timezone: "Europe/Moscow",
      },
      "Asia/Nicosia",
    );
    expect(result.user).toContain("ваше время");
  });
});

describe("formatMoney", () => {
  it("formats decimal string without float artifacts", () => {
    expect(formatMoney("10000.50", "₽")).toContain("₽");
    expect(formatMoney("10000.50", "₽")).toContain("10");
  });
});
