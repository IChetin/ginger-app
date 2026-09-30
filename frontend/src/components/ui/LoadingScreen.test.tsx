import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoadingScreen, SLOW_AFTER_MS } from "@/components/ui/LoadingScreen";

describe("LoadingScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("подсказывает про VPN, если сервер долго молчит", () => {
    render(<LoadingScreen />);
    expect(screen.queryByTestId("loading-slow")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(SLOW_AFTER_MS);
    });

    expect(screen.getByText("Сервер не отвечает")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
});
