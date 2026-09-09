import { describe, expect, it } from "vitest";

import { minStackChips, stepBetChips, stepStackChips } from "@/features/hands/lib/chipStep";

describe("stepStackChips", () => {
  it("uses BB size in chips mode", () => {
    expect(stepStackChips(200_000, 1, "chips", 2_000)).toBe(202_000);
    expect(stepStackChips(200_000, -1, "chips", 2_000)).toBe(198_000);
    expect(stepStackChips(null, 1, "chips", 2_000)).toBe(2_000);
  });

  it("does not step a stack to zero", () => {
    expect(stepStackChips(2_000, -1, "chips", 2_000)).toBe(1);
    expect(stepStackChips(1, -1, "chips", 2_000)).toBe(1);
    expect(stepStackChips(1_000, -1, "bb", 2_000, minStackChips("bb", 2_000))).toBe(1_000);
  });

  it("uses half a BB as the BB-mode floor", () => {
    expect(minStackChips("chips", 2_000)).toBe(1);
    expect(minStackChips("bb", 2_000)).toBe(1_000);
    expect(minStackChips("bb", 0)).toBe(1);
  });

  it("uses 0.5 BB below 10 BB and 1 BB from 10 BB", () => {
    expect(stepStackChips(18_000, 1, "bb", 2_000)).toBe(19_000);
    expect(stepStackChips(19_000, 1, "bb", 2_000)).toBe(20_000);
    expect(stepStackChips(20_000, 1, "bb", 2_000)).toBe(22_000);
    expect(stepStackChips(20_000, -1, "bb", 2_000)).toBe(18_000);
  });
});

describe("stepBetChips", () => {
  it("steps by BB in chips mode and 1 BB in BB mode", () => {
    expect(stepBetChips(4_000, 1, "chips", 2_000, 4_000, 200_000)).toBe(6_000);
    expect(stepBetChips(6_000, 1, "bb", 2_000, 4_000, 200_000)).toBe(8_000);
    expect(stepBetChips(null, 1, "chips", 2_000, 4_000, 200_000)).toBe(6_000);
  });

  it("clamps to the actor stack", () => {
    expect(stepBetChips(199_000, 1, "chips", 2_000, 4_000, 200_000)).toBe(200_000);
    expect(stepBetChips(200_000, 1, "chips", 2_000, 4_000, 200_000)).toBe(200_000);
    expect(stepBetChips(4_000, -1, "chips", 2_000, 4_000, 200_000)).toBe(4_000);
  });
});
