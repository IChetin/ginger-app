import { describe, expect, it } from "vitest";

import {
  computeEquity,
  equityCanRunSync,
  equityPercents,
  heroEquityPct,
} from "@/features/hands/lib/equity";

const TOL = 0.005;

function shares(holes: string[][], board: string[], iterations = 80_000, seed = 1): number[] {
  const result = computeEquity({ holes, board, iterations, seed });
  const total = result.values.reduce((sum, value) => sum + value, 0) || 1;
  return result.values.map((value) => value / total);
}

function expectNear(actual: number, expected: number, tol = TOL): void {
  expect(actual).toBeGreaterThanOrEqual(expected - tol);
  expect(actual).toBeLessThanOrEqual(expected + tol);
}

describe("computeEquity", () => {
  it("AA vs KK preflop is ~82.6 / 17.4", () => {
    const [aa, kk] = shares(
      [
        ["As", "Ah"],
        ["Ks", "Kh"],
      ],
      [],
    );
    expectNear(aa ?? 0, 0.826);
    expectNear(kk ?? 0, 0.174);
    expectNear((aa ?? 0) + (kk ?? 0), 1, 1e-9);
  });

  it("AKs vs QQ preflop is ~46 / 54", () => {
    const [aks, qq] = shares(
      [
        ["As", "Ks"],
        ["Qh", "Qd"],
      ],
      [],
    );
    expectNear(aks ?? 0, 0.46);
    expectNear(qq ?? 0, 0.54);
  });

  it("identical suited AKs split preflop", () => {
    const [a, b] = shares(
      [
        ["As", "Ks"],
        ["Ah", "Kh"],
      ],
      [],
    );
    expectNear(a ?? 0, 0.5);
    expectNear(b ?? 0, 0.5);
  });

  it("AsKc vs QhJh on Ks9h4d is ~77.8 / 22.2 (exact)", () => {
    const result = computeEquity({
      holes: [
        ["As", "Kc"],
        ["Qh", "Jh"],
      ],
      board: ["Ks", "9h", "4d"],
      iterations: 1,
    });
    expect(result.exact).toBe(true);
    const total = result.values.reduce((sum, value) => sum + value, 0);
    expectNear((result.values[0] ?? 0) / total, 0.778);
    expectNear((result.values[1] ?? 0) / total, 0.222);
  });

  it("AA vs KK on a dry flop stays with aces (exact)", () => {
    const [aa, kk] = shares(
      [
        ["As", "Ah"],
        ["Ks", "Kh"],
      ],
      ["2c", "7d", "9s"],
      1,
    );
    expect(aa ?? 0).toBeGreaterThan(0.88);
    expect(kk ?? 0).toBeLessThan(0.12);
    expectNear((aa ?? 0) + (kk ?? 0), 1, 1e-9);
  });

  it("AhKh vs AsKs on 8h3hAc: hearts AK leads (flush draw), not equal", () => {
    const [hearts, spades] = shares(
      [
        ["Ah", "Kh"],
        ["As", "Ks"],
      ],
      ["8h", "3h", "Ac"],
      1,
    );
    expect(hearts ?? 0).toBeGreaterThan((spades ?? 0) + 0.15);
    expectNear((hearts ?? 0) + (spades ?? 0), 1, 1e-9);
  });

  it("verification hand flop: four known holes sum to 100%, hero AKs trails hearts AKs", () => {
    const result = computeEquity({
      holes: [
        ["As", "Ks"],
        ["Ah", "Kh"],
        ["4s", "3s"],
        ["Ad", "3d"],
      ],
      board: ["8h", "3h", "Ac"],
      iterations: 1,
    });
    expect(result.exact).toBe(true);
    const total = result.values.reduce((sum, value) => sum + value, 0);
    const pct = result.values.map((value) => (value / total) * 100);
    expectNear(
      pct.reduce((sum, value) => sum + value, 0),
      100,
      1e-6,
    );
    const hero = pct[0] ?? 0;
    const p1 = pct[1] ?? 0;
    expect(p1).toBeGreaterThan(hero + 10);
  });

  it("rounds displayed percents so they sum to 100 including ties", () => {
    const result = computeEquity({
      holes: [
        ["As", "Ks"],
        ["Ah", "Kh"],
        ["Ad", "Kd"],
      ],
      board: ["2c", "7d", "9h"],
      iterations: 1,
    });
    const pcts = equityPercents(result.values);
    const sum = Math.round(pcts.reduce((total, value) => total + value, 0) * 10) / 10;
    expect(sum).toBe(100);
    for (const pct of pcts) expect(pct).toBeGreaterThan(0);
  });

  it("AA vs 1 random hand preflop is ~85%", () => {
    const result = computeEquity({
      holes: [["As", "Ah"]],
      board: [],
      randomOpponents: 1,
      iterations: 20_000,
      seed: 1,
    });
    expect(result.exact).toBe(false);
    expectNear(heroEquityPct(result) / 100, 0.85, 0.01);
  });

  it("AA vs 3 random hands preflop is ~64%", () => {
    const result = computeEquity({
      holes: [["As", "Ah"]],
      board: [],
      randomOpponents: 3,
      iterations: 20_000,
      seed: 1,
    });
    expect(result.exact).toBe(false);
    expectNear(heroEquityPct(result) / 100, 0.64, 0.01);
  });

  it("AA vs 1 random hand on the turn enumerates remaining cards", () => {
    const result = computeEquity({
      holes: [["As", "Ah"]],
      board: ["2c", "7d", "9s", "3h"],
      randomOpponents: 1,
      iterations: 1,
    });
    expect(result.exact).toBe(true);
    expect(heroEquityPct(result)).toBeGreaterThan(80);
    expectNear(result.values.reduce((sum, value) => sum + value, 0) > 0 ? 1 : 0, 1, 1e-9);
  });

  it("4-way river with known holes is exact and instant", () => {
    const result = computeEquity({
      holes: [
        ["Ah", "Ad"],
        ["Kh", "Kd"],
        ["Qh", "Qd"],
        ["7h", "7d"],
      ],
      board: ["As", "Kc", "2d", "3h", "9c"],
      iterations: 1,
    });
    expect(result.exact).toBe(true);
    expect(equityCanRunSync({ board: ["As", "Kc", "2d", "3h", "9c"], randomOpponents: 0 })).toBe(
      true,
    );
    const total = result.values.reduce((sum, value) => sum + value, 0);
    expect(total).toBeGreaterThan(0);
    expect((result.values[0] ?? 0) / total).toBe(1);
  });

  it("runs vs-random on a complete river on the main thread", () => {
    expect(
      equityCanRunSync({
        board: ["As", "Kc", "2d", "3h", "9c"],
        randomOpponents: 3,
        iterations: 20_000,
      }),
    ).toBe(true);
    expect(equityCanRunSync({ board: [], randomOpponents: 1, iterations: 20_000 })).toBe(false);
  });
});
