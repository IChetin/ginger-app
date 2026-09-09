import { describe, expect, it } from "vitest";

import { findWiderThanViewport, hasHorizontalPageScroll } from "@/features/hands/lib/overflow";

describe("overflow helpers", () => {
  it("чеклист: body.scrollWidth не больше clientWidth", () => {
    expect(hasHorizontalPageScroll()).toBe(false);
    expect(document.body.scrollWidth).toBe(document.documentElement.clientWidth);
  });

  it("findWiderThanViewport находит элемент с scrollWidth больше вьюпорта", () => {
    const wide = document.createElement("div");
    Object.defineProperty(wide, "scrollWidth", { configurable: true, value: 2000 });
    const root = document.createElement("div");
    root.append(wide);
    expect(findWiderThanViewport(root, 1280)).toEqual([wide]);
    expect(findWiderThanViewport(root, 2000)).toEqual([]);
  });
});
