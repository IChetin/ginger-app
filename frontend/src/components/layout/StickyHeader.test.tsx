import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { STICKY_BELOW_HEADER_TOP, StickyHeader } from "@/components/layout/StickyHeader";
import { renderWithProviders } from "@/test/render";

async function scrollToY(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

describe("StickyHeader compact hysteresis", () => {
  afterEach(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    document.documentElement.style.removeProperty("--sticky-h");
  });

  it("does not compact on a small move inside the dead zone", async () => {
    renderWithProviders(<StickyHeader title="Серия" />);
    expect(screen.getByTestId("sticky-header")).toHaveAttribute("data-compact", "false");
    await scrollToY(50);
    expect(screen.getByTestId("sticky-header")).toHaveAttribute("data-compact", "false");
  });

  it("compacts below 80px and stays compact until back above 40px", async () => {
    renderWithProviders(<StickyHeader title="Серия" />);
    await scrollToY(120);
    await waitFor(() =>
      expect(screen.getByTestId("sticky-header")).toHaveAttribute("data-compact", "true"),
    );
    await scrollToY(50);
    expect(screen.getByTestId("sticky-header")).toHaveAttribute("data-compact", "true");
    await scrollToY(20);
    await waitFor(() =>
      expect(screen.getByTestId("sticky-header")).toHaveAttribute("data-compact", "false"),
    );
  });

  it("expands on iOS overscroll past the top", async () => {
    renderWithProviders(<StickyHeader title="Серия" />);
    await scrollToY(120);
    await waitFor(() =>
      expect(screen.getByTestId("sticky-header")).toHaveAttribute("data-compact", "true"),
    );
    await scrollToY(-40);
    await waitFor(() =>
      expect(screen.getByTestId("sticky-header")).toHaveAttribute("data-compact", "false"),
    );
  });

  it("publishes --sticky-h and keeps below-header top on that variable", () => {
    renderWithProviders(<StickyHeader title="Серия" />);
    expect(STICKY_BELOW_HEADER_TOP).toMatch(/--sticky-h/);
    expect(document.documentElement.style.getPropertyValue("--sticky-h")).toMatch(/px$/);
  });

  it("does not compact when compactible is false", async () => {
    renderWithProviders(<StickyHeader title="Поиск" compactible={false} />);
    await scrollToY(200);
    expect(screen.getByTestId("sticky-header")).toHaveAttribute("data-compact", "false");
  });
});
