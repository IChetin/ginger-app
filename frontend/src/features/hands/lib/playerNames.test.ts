import { describe, expect, it } from "vitest";

import {
  commitSeatName,
  displaySeatName,
  filterNameSuggestions,
  HERO_NAME,
  isGenericPlayerName,
  mergeNameSuggestions,
  normalizeSeatName,
  rankUsedNames,
  SEAT_NAME_MAX,
} from "@/features/hands/lib/playerNames";

describe("playerNames", () => {
  it("keeps the hero as Вы and opponents as Игрок N by default", () => {
    expect(displaySeatName(1, 1)).toBe(HERO_NAME);
    expect(displaySeatName(2, 1)).toBe("Игрок 2");
    expect(displaySeatName(2, 1, "  ")).toBe("Игрок 2");
    expect(displaySeatName(2, 1, "Игрок 2")).toBe("Игрок 2");
  });

  it("trims, collapses spaces and caps custom names at 16 characters", () => {
    expect(normalizeSeatName("  Дед   в кепке ")).toBe("Дед в кепке");
    expect(normalizeSeatName("a".repeat(20)).length).toBe(SEAT_NAME_MAX);
    expect(displaySeatName(3, 1, "Рег из Минска")).toBe("Рег из Минска");
  });

  it("empty commit returns default; hero cannot be renamed", () => {
    expect(commitSeatName("", 3, 1)).toBeNull();
    expect(commitSeatName("Игрок 3", 3, 1)).toBeNull();
    expect(commitSeatName("Дед в кепке", 1, 1)).toBeNull();
    expect(commitSeatName("Рег из Минска", 3, 1)).toBe("Рег из Минска");
  });

  it("ranks past names by frequency then recency", () => {
    expect(
      rankUsedNames([
        { name: "Рег из Минска", at: 1 },
        { name: "Игрок 4", at: 2 },
        { name: "Вы", at: 3 },
        { name: "Ник", at: 4 },
        { name: "Рег из Минска", at: 5 },
        { name: "Ник", at: 10 },
      ]),
    ).toEqual(["Ник", "Рег из Минска"]);
    expect(
      rankUsedNames([
        { name: "Рег из Минска", at: 1 },
        { name: "Рег из Минска", at: 2 },
        { name: "Ник", at: 10 },
      ]),
    ).toEqual(["Рег из Минска", "Ник"]);
  });

  it("merges and filters suggestions without generic names", () => {
    expect(isGenericPlayerName("Игрок 9")).toBe(true);
    expect(mergeNameSuggestions(["Рег из Минска"], ["Ник", "Рег из Минска", "Игрок 2"])).toEqual([
      "Рег из Минска",
      "Ник",
    ]);
    expect(filterNameSuggestions(["Рег из Минска", "Ник"], "рег")).toEqual(["Рег из Минска"]);
    expect(filterNameSuggestions(["Рег из Минска", "Ник"], "Игрок 2")).toEqual([
      "Рег из Минска",
      "Ник",
    ]);
    expect(
      filterNameSuggestions(
        Array.from({ length: 20 }, (_, index) => `Имя ${index + 1}`),
        "",
      ),
    ).toHaveLength(6);
  });
});
