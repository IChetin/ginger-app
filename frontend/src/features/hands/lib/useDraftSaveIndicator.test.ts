import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatSavedAgo,
  SAVE_INDICATOR_DELAY_MS,
  useDraftSaveIndicator,
} from "@/features/hands/lib/useDraftSaveIndicator";

describe("formatSavedAgo", () => {
  const now = Date.parse("2026-08-23T12:00:00.000Z");

  it("uses just-now, minutes, hours and days", () => {
    expect(formatSavedAgo("2026-08-23T11:59:30.000Z", now)).toBe("Сохранено только что");
    expect(formatSavedAgo("2026-08-23T11:58:00.000Z", now)).toBe("Сохранено 2 минуты назад");
    expect(formatSavedAgo("2026-08-23T11:00:00.000Z", now)).toBe("Сохранено 1 час назад");
    expect(formatSavedAgo("2026-08-21T12:00:00.000Z", now)).toBe("Сохранено 2 дня назад");
  });
});

describe("useDraftSaveIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays hidden for a fast save", () => {
    const { result } = renderHook(() => useDraftSaveIndicator());
    act(() => {
      result.current.beginRequest();
    });
    act(() => {
      vi.advanceTimersByTime(SAVE_INDICATOR_DELAY_MS - 1);
    });
    expect(result.current.visible).toBe("hidden");
    act(() => {
      result.current.succeed();
    });
    expect(result.current.visible).toBe("hidden");
    expect(result.current.lastSavedAt).toBeTruthy();
  });

  it("shows saving only after the delay", () => {
    const { result } = renderHook(() => useDraftSaveIndicator());
    act(() => {
      result.current.beginRequest();
    });
    act(() => {
      vi.advanceTimersByTime(SAVE_INDICATOR_DELAY_MS);
    });
    expect(result.current.visible).toBe("saving");
    act(() => {
      result.current.succeed();
    });
    expect(result.current.visible).toBe("hidden");
  });

  it("shows an error until the next success", () => {
    const { result } = renderHook(() => useDraftSaveIndicator());
    act(() => {
      result.current.beginRequest();
      result.current.fail();
    });
    expect(result.current.visible).toBe("error");
    act(() => {
      result.current.beginRequest();
      result.current.succeed();
    });
    expect(result.current.visible).toBe("hidden");
  });

  it("shows offline and hides it when the connection returns", () => {
    const { result } = renderHook(() => useDraftSaveIndicator());
    act(() => {
      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.visible).toBe("offline");
    act(() => {
      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.visible).toBe("hidden");
  });
});
