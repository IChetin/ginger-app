import { describe, expect, it } from "vitest";

import { actionOrder } from "@/features/hands/lib/hand-engine";
import type { SeatRuntime } from "@/features/hands/lib/hand-engine";
import {
  POSITIONS_BY_SIZE,
  assignPositions,
  blindSeats,
  chairPositions,
  avatarPositionLabel,
  positionLabel,
  previewPosition,
  requiredSeats,
} from "@/features/hands/lib/positions";

function runtime(tableSize: number, occupied: number[], buttonSeat = 1): SeatRuntime[] {
  const positions = assignPositions(tableSize, buttonSeat, occupied);
  return occupied.map((seat) => ({
    seat,
    position: positions.get(seat) ?? "MP",
    name: `P${seat}`,
    stack: 1000,
    committed: 0,
    folded: false,
    allIn: false,
    isHero: false,
    cards: [],
    startingStack: 1000,
    invested: 0,
  }));
}

function names(tableSize: number, occupied: number[], buttonSeat = 1): string[] {
  const positions = assignPositions(tableSize, buttonSeat, occupied);
  return occupied.map((seat) => positions.get(seat) ?? "MP");
}

describe("assignPositions from occupied seats", () => {
  it.each([
    { count: 2, occupied: [1, 3], expected: ["BTN", "BB"] },
    { count: 3, occupied: [1, 2, 3], expected: ["BTN", "SB", "BB"] },
    { count: 4, occupied: [1, 2, 3, 4], expected: ["BTN", "SB", "BB", "CO"] },
    { count: 5, occupied: [1, 2, 3, 4, 5], expected: ["BTN", "SB", "BB", "UTG", "CO"] },
    { count: 6, occupied: [1, 2, 3, 4, 5, 6], expected: ["BTN", "SB", "BB", "UTG", "HJ", "CO"] },
    {
      count: 9,
      occupied: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      expected: ["BTN", "SB", "BB", "UTG", "+1", "+2", "MP", "HJ", "CO"],
    },
  ])("$count players on a 9-max table", ({ occupied, expected }) => {
    expect(names(9, occupied)).toEqual(expected);
  });

  it("does not take names from table_size when four sit on 9-max", () => {
    expect(names(9, [1, 2, 3, 7])).toEqual(["BTN", "SB", "BB", "CO"]);
    expect(assignPositions(9, 1, [1, 2, 3, 7]).get(7)).toBe("CO");
  });

  it("labels heads-up button as BTN/SB", () => {
    expect(positionLabel("BTN", 2)).toBe("BTN/SB");
    expect(positionLabel("BB", 2)).toBe("BB");
    expect(positionLabel("BTN", 3)).toBe("BTN");
    expect(avatarPositionLabel("BTN", 2)).toBe("BTN");
    expect(avatarPositionLabel("UTG", 9)).toBe("UTG");
  });

  it("previews the seat that would appear if someone sits", () => {
    expect(previewPosition(9, 1, [1, 2, 3], 4)).toBe("CO");
    expect(previewPosition(9, 1, [1, 3], 2)).toBe("SB");
  });

  it("preview + short-handed names can mark two seats UTG", () => {
    const occupied = [1, 2, 3, 5, 6];
    const sitting = assignPositions(9, 1, occupied);
    expect(sitting.get(5)).toBe("UTG");
    expect(previewPosition(9, 1, occupied, 4)).toBe("UTG");
  });
});

describe("chairPositions from table size", () => {
  it.each([6, 7, 8, 9] as const)("labels each %s-max chair once in clock order", (size) => {
    const labels = [...chairPositions(size, 1).values()];
    expect(labels).toEqual([...POSITIONS_BY_SIZE[size]]);
    expect(new Set(labels).size).toBe(size);
  });
});

describe("blinds and required seats from occupied", () => {
  it("posts blinds to the occupied ring, not the empty chairs", () => {
    expect(blindSeats(9, 1, [1, 3])).toEqual({ sb: 1, bb: 3 });
    expect(blindSeats(9, 1, [1, 2, 3, 7])).toEqual({ sb: 2, bb: 3 });
    expect(blindSeats(9, 1, [1, 5, 8])).toEqual({ sb: 5, bb: 8 });
  });

  it("locks both heads-up seats and the current BB otherwise", () => {
    expect(requiredSeats(9, 1, 1, [1, 3])).toEqual([1, 3]);
    expect(requiredSeats(9, 1, 1, [1, 2, 3])).toEqual([1, 3]);
    expect(requiredSeats(6, 1, 1)).toEqual([1, 3]);
    expect(requiredSeats(2, 1, 1)).toEqual([1, 2]);
  });
});

describe("action order from occupied positions", () => {
  it.each([
    { count: 2, occupied: [1, 3], preflop: [1, 3], postflop: [3, 1] },
    { count: 3, occupied: [1, 2, 3], preflop: [1, 2, 3], postflop: [2, 3, 1] },
    { count: 4, occupied: [1, 2, 3, 4], preflop: [4, 1, 2, 3], postflop: [2, 3, 4, 1] },
    { count: 5, occupied: [1, 2, 3, 4, 5], preflop: [4, 5, 1, 2, 3], postflop: [2, 3, 4, 5, 1] },
    {
      count: 6,
      occupied: [1, 2, 3, 4, 5, 6],
      preflop: [4, 5, 6, 1, 2, 3],
      postflop: [2, 3, 4, 5, 6, 1],
    },
    {
      count: 9,
      occupied: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      preflop: [4, 5, 6, 7, 8, 9, 1, 2, 3],
      postflop: [2, 3, 4, 5, 6, 7, 8, 9, 1],
    },
  ])("$count-handed order", ({ occupied, preflop, postflop }) => {
    const seats = runtime(9, occupied);
    expect(actionOrder(seats, "preflop")).toEqual(preflop);
    expect(actionOrder(seats, "flop")).toEqual(postflop);
  });
});
