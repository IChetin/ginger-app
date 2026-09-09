import { describe, expect, it } from "vitest";

import { daysUntil, daysWord, pluralRu, tournamentsWord } from "@/lib/plural";

describe("pluralRu", () => {
  it("handles Russian day/tournament endings", () => {
    expect(daysWord(1)).toBe("день");
    expect(daysWord(2)).toBe("дня");
    expect(daysWord(5)).toBe("дней");
    expect(daysWord(11)).toBe("дней");
    expect(daysWord(21)).toBe("день");
    expect(tournamentsWord(34)).toBe("турнира");
    expect(pluralRu(0, "день", "дня", "дней")).toBe("дней");
  });
});

describe("daysUntil", () => {
  it("computes non-negative UTC day delta", () => {
    expect(daysUntil("2026-08-12", "2026-08-01")).toBe(11);
    expect(daysUntil("2026-08-01", "2026-08-01")).toBe(0);
    expect(daysUntil("2026-07-31", "2026-08-01")).toBeNull();
  });
});
