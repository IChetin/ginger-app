import { describe, expect, it } from "vitest";

import fixture from "@/demo/hands.json";
import { listDemoHands } from "@/demo/hands";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const LATER = new Date("2026-10-15T09:30:00.000Z");

describe("demo hand fixtures", () => {
  it("has three published hands with human notes and series names", () => {
    expect(fixture.items).toHaveLength(3);
    expect(fixture.items.map((row) => row.slug)).toEqual(["demo-1", "demo-2", "demo-3"]);
    for (const row of fixture.items) {
      expect(row.note.endsWith("?")).toBe(true);
      expect(row.series_name.length).toBeGreaterThan(3);
      expect(row.preview.hero_cards).toHaveLength(2);
    }
    expect(fixture.items[0]?.preview.board).toHaveLength(5);
    expect(fixture.items[1]?.preview.board).toHaveLength(0);
    expect(fixture.items[2]?.preview.hero_profit).toBeLessThan(0);
  });

  it("keeps created dates relative to now", () => {
    const first = listDemoHands({}, NOW).items[0];
    const later = listDemoHands({}, LATER).items[0];
    expect(first?.created_at).toBe("2026-08-30T12:00:00.000Z");
    expect(later?.created_at).toBe("2026-10-13T09:30:00.000Z");
  });

  it("filters by note and hides drafts", () => {
    const byNote = listDemoHands({ q: "ривер" }, NOW);
    expect(byNote.items).toHaveLength(1);
    expect(byNote.items[0]?.slug).toBe("demo-3");
    expect(listDemoHands({ status: "draft" }, NOW).total).toBe(0);
    expect(listDemoHands({ status: "published" }, NOW).total).toBe(3);
  });
});
