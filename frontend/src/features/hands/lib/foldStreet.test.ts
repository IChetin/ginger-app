import { describe, expect, it } from "vitest";

import {
  foldedBeforeStreet,
  foldedEarlierPlayers,
  foldedPlayers,
  foldStreetBySeat,
  formatFoldOnStreet,
  isVisibleOnStreet,
} from "@/features/hands/lib/foldStreet";

const STREETS = [
  {
    street: "preflop" as const,
    actions: [
      { seat: 4, action: "fold" as const },
      { seat: 5, action: "fold" as const },
      { seat: 1, action: "call" as const, amount: 2000 },
      { seat: 2, action: "call" as const, amount: 2000 },
      { seat: 3, action: "check" as const },
    ],
  },
  {
    street: "flop" as const,
    actions: [
      { seat: 2, action: "fold" as const },
      { seat: 3, action: "check" as const },
      { seat: 1, action: "check" as const },
    ],
  },
  {
    street: "turn" as const,
    actions: [
      { seat: 3, action: "check" as const },
      { seat: 1, action: "check" as const },
    ],
  },
];

const SEATS = [
  { seat: 1, name: "Вы" },
  { seat: 2, name: "Игрок 2" },
  { seat: 3, name: "Игрок 3" },
  { seat: 4, name: "Игрок 4" },
  { seat: 5, name: "Игрок 5" },
];

describe("foldStreet", () => {
  it("records the street of the first fold per seat", () => {
    const map = foldStreetBySeat(STREETS);
    expect(map.get(4)).toBe("preflop");
    expect(map.get(5)).toBe("preflop");
    expect(map.get(2)).toBe("flop");
    expect(map.has(1)).toBe(false);
    expect(map.has(3)).toBe(false);
  });

  it("formats the fold street in the locative", () => {
    expect(formatFoldOnStreet("preflop")).toBe("фолд на префлопе");
    expect(formatFoldOnStreet("flop")).toBe("фолд на флопе");
    expect(formatFoldOnStreet("turn")).toBe("фолд на тёрне");
    expect(formatFoldOnStreet("river")).toBe("фолд на ривере");
  });

  it("keeps preflop folders visible on preflop and hides them later", () => {
    const map = foldStreetBySeat(STREETS);
    expect(isVisibleOnStreet(4, "preflop", map)).toBe(true);
    expect(isVisibleOnStreet(4, "flop", map)).toBe(false);
    expect(isVisibleOnStreet(2, "flop", map)).toBe(true);
    expect(isVisibleOnStreet(2, "turn", map)).toBe(false);
    expect(isVisibleOnStreet(1, "river", map)).toBe(true);
    expect(foldedBeforeStreet("preflop", "flop")).toBe(true);
    expect(foldedBeforeStreet("flop", "flop")).toBe(false);
  });

  it("lists earlier folders in chronological order", () => {
    expect(foldedEarlierPlayers(SEATS, STREETS, "preflop")).toEqual([]);
    expect(foldedEarlierPlayers(SEATS, STREETS, "flop")).toEqual([
      { seat: 4, name: "Игрок 4", street: "preflop" },
      { seat: 5, name: "Игрок 5", street: "preflop" },
    ]);
    expect(foldedEarlierPlayers(SEATS, STREETS, "turn")).toEqual([
      { seat: 4, name: "Игрок 4", street: "preflop" },
      { seat: 5, name: "Игрок 5", street: "preflop" },
      { seat: 2, name: "Игрок 2", street: "flop" },
    ]);
    expect(foldedPlayers(SEATS, STREETS)).toHaveLength(3);
  });
});
