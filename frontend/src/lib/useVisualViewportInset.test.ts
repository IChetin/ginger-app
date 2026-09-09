import { afterEach, describe, expect, it, vi } from "vitest";

import { visualViewportBottomInset } from "@/lib/useVisualViewportInset";

describe("visualViewportBottomInset", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns zero when visualViewport is missing", () => {
    vi.stubGlobal("visualViewport", undefined);
    expect(visualViewportBottomInset()).toBe(0);
  });

  it("measures the keyboard overlap under the layout viewport", () => {
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("visualViewport", { height: 500, offsetTop: 0 });
    expect(visualViewportBottomInset()).toBe(300);
  });
});
