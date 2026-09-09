import { describe, expect, it } from "vitest";

import type { HandActionType } from "@/api/types/hands";
import { actionTone, formatActionPhrase, formatActionShort } from "@/features/hands/lib/actionTone";

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

function mix(
  fg: readonly [number, number, number],
  bg: readonly [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    bg[0] * (1 - alpha) + fg[0] * alpha,
    bg[1] * (1 - alpha) + fg[1] * alpha,
    bg[2] * (1 - alpha) + fg[2] * alpha,
  ];
}

function hex(value: string): [number, number, number] {
  const raw = value.replace("#", "");
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

describe("actionTone", () => {
  it("maps types onto the aggression scale", () => {
    const expected: Record<HandActionType, string> = {
      fold: "fold",
      check: "check",
      call: "call",
      bet: "aggress",
      raise: "aggress",
      allin: "allin",
    };
    for (const [type, tone] of Object.entries(expected)) {
      expect(actionTone(type as HandActionType)).toBe(tone);
    }
  });

  it("keeps the full phrase for the list and short labels for the table", () => {
    const chips = (value: number) => new Intl.NumberFormat("ru-RU").format(value);
    expect(formatActionPhrase({ action: "fold" }, chips)).toBe("фолд");
    expect(formatActionPhrase({ action: "call", amount: 15000 }, chips)).toBe("колл 15\u00a0000");
    expect(formatActionPhrase({ action: "raise", amount: 15000 }, chips)).toBe(
      "рейз до 15\u00a0000",
    );
    expect(formatActionShort("raise")).toBe("РЕЙЗ");
    expect(formatActionShort("allin")).toBe("ОЛЛ-ИН");
  });
});

describe("action palette contrast", () => {
  const dark = {
    surface2: hex("1c1a16"),
    text2: hex("a9a395"),
    live: hex("43d9a3"),
    warn: hex("f58f3c"),
    liveFg: hex("43d9a3"),
    warnFg: hex("f58f3c"),
    liveSoft: 0.13,
    warnSoft: 0.13,
    ongold: hex("1c1503"),
    goldHi: hex("f1d68e"),
    goldLo: hex("d3a94f"),
  };
  const light = {
    surface2: hex("f0e8d7"),
    text2: hex("6e6449"),
    live: hex("1f9e6e"),
    warn: hex("c46a15"),
    liveFg: mix([0, 0, 0], hex("1f9e6e"), 0.35),
    warnFg: mix([0, 0, 0], hex("c46a15"), 0.3),
    liveSoft: 0.12,
    warnSoft: 0.12,
    ongold: hex("241a04"),
    goldHi: hex("e9c877"),
    goldLo: hex("c89a3f"),
  };

  it.each([
    ["dark", dark],
    ["light", light],
  ] as const)("%s call/raise/all-in and check meet 4.5:1", (_name, theme) => {
    const callBg = mix(theme.live, theme.surface2, theme.liveSoft);
    const raiseBg = mix(theme.warn, theme.surface2, theme.warnSoft);
    expect(contrast(theme.liveFg, callBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.warnFg, raiseBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.ongold, theme.goldHi)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.ongold, theme.goldLo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.text2, theme.surface2)).toBeGreaterThanOrEqual(4.5);
  });
});
