import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useEquity } from "@/features/hands/lib/useEquity";

describe("useEquity", () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it("computes a complete river on the main thread when Worker is missing", async () => {
    // @ts-expect-error Worker is missing in some browsers / test envs
    globalThis.Worker = undefined;
    const { result } = renderHook(() =>
      useEquity(
        [
          ["Ah", "Ad"],
          ["Kh", "Kd"],
          ["Qh", "Qd"],
          ["7h", "7d"],
        ],
        ["As", "Kc", "2d", "3h", "9c"],
      ),
    );
    await waitFor(() => expect(result.current.result?.exact).toBe(true));
    expect(result.current.failed).toBe(false);
    const values = result.current.result?.values ?? [];
    const total = values.reduce((sum, value) => sum + value, 0);
    expect(values[0]).toBe(total);
  });

  it("does not fail vs-random on a complete river without a Worker", async () => {
    // @ts-expect-error Worker is missing in some browsers / test envs
    globalThis.Worker = undefined;
    const { result } = renderHook(() =>
      useEquity([["Ah", "Ad"]], ["As", "Kc", "2d", "3h", "9c"], {
        randomOpponents: 3,
        iterations: 2_000,
      }),
    );
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.failed).toBe(false);
    expect(result.current.result?.values.length ?? 0).toBe(4);
  });
});
