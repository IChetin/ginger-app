import { describe, expect, it } from "vitest";

import { formatUtcOffset } from "@/lib/timezoneOffset";

describe("formatUtcOffset", () => {
  it("formats Europe/Kaliningrad and Asia/Vladivostok", () => {
    // Fixed winter-like instant without DST ambiguity for these zones
    const at = new Date("2026-01-15T12:00:00Z");
    expect(formatUtcOffset("Europe/Kaliningrad", at)).toBe("UTC+2");
    expect(formatUtcOffset("Asia/Vladivostok", at)).toBe("UTC+10");
    expect(formatUtcOffset("Europe/Moscow", at)).toBe("UTC+3");
  });
});
