import { describe, expect, it } from "vitest";

import { HAND_SLUG_LENGTH, isHandSlug } from "@/features/hands/lib/handSlug";
import { isHandCreateState, newHandLocation } from "@/features/hands/lib/startNewHand";

describe("startNewHand", () => {
  it("builds a unique final location with a valid slug", () => {
    const first = newHandLocation();
    const second = newHandLocation();
    expect(first.pathname).toMatch(/^\/hand\//);
    expect(isHandSlug(first.pathname.slice("/hand/".length))).toBe(true);
    expect(first.state.creating).toBe(true);
    expect(first.state.slug).toHaveLength(HAND_SLUG_LENGTH);
    expect(first.pathname).toBe(`/hand/${first.state.slug}`);
    expect(first.state.draftId).not.toBe(second.state.draftId);
    expect(first.state.slug).not.toBe(second.state.slug);
    expect(isHandCreateState(first.state, first.state.slug)).toBe(true);
    expect(isHandCreateState(first.state, second.state.slug)).toBe(false);
  });
});
