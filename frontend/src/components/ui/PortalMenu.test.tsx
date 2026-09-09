import { describe, expect, it } from "vitest";

import { computeMenuPosition } from "@/components/ui/portalMenuPosition";

const menu = { width: 160, height: 200 };
const viewport = { width: 400, height: 800 };

describe("computeMenuPosition", () => {
  it("opens below the anchor when there is room", () => {
    const pos = computeMenuPosition(
      { top: 200, bottom: 240, left: 300, right: 380, width: 80, height: 40 },
      menu,
      viewport,
      52,
    );
    expect(pos.top).toBe(244);
    expect(pos.left).toBe(220);
    expect(pos.maxHeight).toBe(200);
  });

  it("opens above without crossing the sticky header", () => {
    const pos = computeMenuPosition(
      { top: 640, bottom: 680, left: 300, right: 380, width: 80, height: 40 },
      menu,
      { width: 400, height: 700 },
      52,
    );
    expect(pos.top).toBeGreaterThanOrEqual(60);
    expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(636);
    expect(pos.maxHeight).toBe(200);
  });

  it("clamps to the sticky header and scrolls when both sides are short", () => {
    const pos = computeMenuPosition(
      { top: 80, bottom: 120, left: 20, right: 60, width: 40, height: 40 },
      menu,
      { width: 400, height: 200 },
      52,
    );
    expect(pos.top).toBeGreaterThanOrEqual(60);
    expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(192);
    expect(pos.maxHeight).toBeLessThan(200);
    expect(pos.maxHeight).toBeGreaterThan(0);
  });
});
