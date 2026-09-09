import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { TouchEvent } from "react";

import { useMonthSwipe } from "@/components/calendar/useMonthSwipe";

function touchEvent(
  type: "touchstart" | "touchmove" | "touchend",
  points: { clientX: number; clientY: number }[],
): TouchEvent {
  const list = points.map((point) => ({
    clientX: point.clientX,
    clientY: point.clientY,
  }));
  return {
    type,
    touches: type === "touchend" ? [] : list,
    changedTouches: list,
    cancelable: true,
    preventDefault: vi.fn(),
  } as unknown as TouchEvent;
}

describe("useMonthSwipe", () => {
  it("swipes left to the next month and right to the previous", () => {
    const onPrevMonth = vi.fn();
    const onNextMonth = vi.fn();
    const { result } = renderHook(() => useMonthSwipe({ onPrevMonth, onNextMonth }));

    act(() => {
      result.current.onTouchStart(touchEvent("touchstart", [{ clientX: 200, clientY: 100 }]));
      result.current.onTouchMove(touchEvent("touchmove", [{ clientX: 120, clientY: 104 }]));
      result.current.onTouchEnd(touchEvent("touchend", [{ clientX: 120, clientY: 104 }]));
    });
    expect(onNextMonth).toHaveBeenCalledOnce();
    expect(onPrevMonth).not.toHaveBeenCalled();

    onNextMonth.mockClear();
    act(() => {
      result.current.onTouchStart(touchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      result.current.onTouchMove(touchEvent("touchmove", [{ clientX: 180, clientY: 102 }]));
      result.current.onTouchEnd(touchEvent("touchend", [{ clientX: 180, clientY: 102 }]));
    });
    expect(onPrevMonth).toHaveBeenCalledOnce();
    expect(onNextMonth).not.toHaveBeenCalled();
  });

  it("ignores vertical scrolls", () => {
    const onPrevMonth = vi.fn();
    const onNextMonth = vi.fn();
    const { result } = renderHook(() => useMonthSwipe({ onPrevMonth, onNextMonth }));

    act(() => {
      result.current.onTouchStart(touchEvent("touchstart", [{ clientX: 100, clientY: 40 }]));
      result.current.onTouchMove(touchEvent("touchmove", [{ clientX: 104, clientY: 160 }]));
      result.current.onTouchEnd(touchEvent("touchend", [{ clientX: 104, clientY: 160 }]));
    });
    expect(onPrevMonth).not.toHaveBeenCalled();
    expect(onNextMonth).not.toHaveBeenCalled();
  });
});
