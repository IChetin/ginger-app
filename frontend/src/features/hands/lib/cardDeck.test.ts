import { describe, expect, it } from "vitest";

import {
  CARD_FACE,
  DEFAULT_CARD_DECK,
  parseCardDeck,
  SUIT_BLACK,
  SUIT_CLUB,
  SUIT_DIAMOND,
  SUIT_RED,
  suitColor,
} from "@/features/hands/lib/cardDeck";

function lin(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function contrast(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function hex(value: string): [number, number, number] {
  const raw = value.replace("#", "");
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

describe("cardDeck", () => {
  it("defaults to four-color", () => {
    expect(DEFAULT_CARD_DECK).toBe("four_color");
    expect(parseCardDeck(undefined)).toBe("four_color");
    expect(parseCardDeck("classic")).toBe("classic");
  });

  it("maps four-color suits distinctly", () => {
    expect(suitColor("s", "four_color")).toBe(SUIT_BLACK);
    expect(suitColor("h", "four_color")).toBe(SUIT_RED);
    expect(suitColor("d", "four_color")).toBe(SUIT_DIAMOND);
    expect(suitColor("c", "four_color")).toBe(SUIT_CLUB);
  });

  it("paints clubs black in the classic scheme", () => {
    expect(suitColor("c", "classic")).toBe(SUIT_BLACK);
    expect(suitColor("d", "classic")).toBe(SUIT_RED);
  });

  it("keeps 3:1 contrast on a cream face at hole-card size", () => {
    const face = hex(CARD_FACE);
    for (const color of [SUIT_BLACK, SUIT_RED, SUIT_DIAMOND, SUIT_CLUB]) {
      expect(contrast(hex(color), face)).toBeGreaterThanOrEqual(3);
    }
  });
});
