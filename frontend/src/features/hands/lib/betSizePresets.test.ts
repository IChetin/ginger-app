import { describe, expect, it } from "vitest";

import { postflopBetSizes, preflopBetSizes } from "@/features/hands/lib/betSizePresets";

describe("preflopBetSizes", () => {
  it("applies the multiplier to the current bet", () => {
    const sizes = preflopBetSizes(2000, 4000, 200_000);
    expect(sizes.map((item) => [item.label, item.to])).toEqual([
      ["2×", 4000],
      ["2.5×", 5000],
      ["3×", 6000],
      ["Олл-ин", 200_000],
    ]);
  });

  it("3-bets off the last raise, not BB", () => {
    const sizes = preflopBetSizes(6000, 10_000, 200_000);
    expect(sizes.find((item) => item.key === "x3")?.to).toBe(18_000);
  });
});

describe("postflopBetSizes", () => {
  it("uses pot fractions and clamps below the min raise", () => {
    const sizes = postflopBetSizes(12_000, 8000, 100_000);
    expect(sizes.find((item) => item.key === "third")?.to).toBe(8000);
    expect(sizes.find((item) => item.key === "half")?.to).toBe(8000);
    expect(sizes.find((item) => item.key === "threeq")?.to).toBe(9000);
    expect(sizes.find((item) => item.key === "pot")?.to).toBe(12_000);
    expect(sizes.find((item) => item.key === "allin")?.to).toBe(100_000);
  });
});
