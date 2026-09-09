import { describe, expect, it } from "vitest";

import {
  canLadderDecrement,
  canLadderIncrement,
  CHIP_LADDER,
  nextLadder,
  nextLinear,
  parseStepperInt,
  stepMoneyString,
} from "@/lib/numberStep";

describe("CHIP_LADDER", () => {
  it("contains the published blind rungs and continues after 100000", () => {
    expect(CHIP_LADDER).toEqual(
      expect.arrayContaining([
        25, 50, 100, 200, 300, 400, 500, 1_000, 1_500, 2_000, 2_500, 3_000, 4_000, 5_000, 6_000,
        8_000, 10_000, 12_000, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 60_000, 80_000,
        100_000,
      ]),
    );
    expect(nextLadder(100_000, 1)).toBe(120_000);
    expect(nextLadder(120_000, 1)).toBe(150_000);
  });
});

describe("nextLadder", () => {
  it("moves along the series and snaps intermediate values", () => {
    expect(nextLadder(2_000, 1, 25)).toBe(2_500);
    expect(nextLadder(2_000, -1, 25)).toBe(1_500);
    expect(nextLadder(2_200, 1, 25)).toBe(2_500);
    expect(nextLadder(2_200, -1, 25)).toBe(2_000);
  });

  it("does not go below the minimum, including values typed below the series", () => {
    expect(nextLadder(25, -1, 25)).toBe(25);
    expect(nextLadder(10, -1, 25)).toBe(10);
    expect(nextLadder(10, 1, 25)).toBe(25);
    expect(canLadderDecrement(25, 25)).toBe(false);
    expect(canLadderDecrement(10, 25)).toBe(false);
    expect(canLadderIncrement(10, 25)).toBe(true);
  });

  it("treats empty as a jump to the first positive rung", () => {
    expect(nextLadder(null, 1, 0)).toBe(25);
    expect(nextLadder(null, -1, 0)).toBe(0);
    expect(canLadderDecrement(null, 0)).toBe(false);
    expect(stepMoneyString("", 1)).toBe("25");
  });

  it("allows ante/payout to reach zero", () => {
    expect(nextLadder(25, -1, 0)).toBe(0);
    expect(nextLadder(0, 1, 0)).toBe(25);
    expect(canLadderDecrement(0, 0)).toBe(false);
  });
});

describe("nextLinear", () => {
  it("steps and clamps", () => {
    expect(nextLinear(4_000, 1, 2_000, 0)).toBe(6_000);
    expect(nextLinear(1_000, -1, 2_000, 0)).toBe(0);
    expect(nextLinear(9_000, 1, 2_000, 0, 10_000)).toBe(10_000);
    expect(nextLinear(10_000, 1, 2_000, 0, 10_000)).toBe(10_000);
  });
});

describe("parseStepperInt", () => {
  it("strips grouping spaces", () => {
    expect(parseStepperInt("1 000")).toBe(1_000);
    expect(parseStepperInt("")).toBeNull();
  });
});
