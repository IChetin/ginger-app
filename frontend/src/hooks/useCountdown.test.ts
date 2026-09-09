import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCountdown } from "@/hooks/useCountdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down to zero", () => {
    const { result } = renderHook(() => useCountdown(3));
    expect(result.current.remaining).toBe(3);
    expect(result.current.isFinished).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(2);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.remaining).toBe(0);
    expect(result.current.isFinished).toBe(true);
  });

  it("restarts when token changes", () => {
    const { result, rerender } = renderHook(({ seconds, token }) => useCountdown(seconds, token), {
      initialProps: { seconds: 5, token: 0 },
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.remaining).toBe(3);

    rerender({ seconds: 5, token: 1 });
    expect(result.current.remaining).toBe(5);
  });
});
