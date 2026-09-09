export type BetSizePreset = {
  key: string;
  label: string;
  to: number;
  allin?: boolean;
};

export function clampBetTo(to: number, minTo: number, maxTo: number): number {
  return Math.max(minTo, Math.min(maxTo, Math.round(to)));
}

function preset(
  key: string,
  label: string,
  raw: number,
  minTo: number,
  maxTo: number,
  allin = false,
): BetSizePreset {
  return { key, label, to: allin ? maxTo : clampBetTo(raw, minTo, maxTo), allin };
}

/** Префлоп: k × текущая ставка (после постов это BB). */
export function preflopBetSizes(currentBet: number, minTo: number, maxTo: number): BetSizePreset[] {
  const base = currentBet > 0 ? currentBet : minTo;
  return [
    preset("x2", "2×", 2 * base, minTo, maxTo),
    preset("x25", "2.5×", 2.5 * base, minTo, maxTo),
    preset("x3", "3×", 3 * base, minTo, maxTo),
    preset("allin", "Олл-ин", maxTo, minTo, maxTo, true),
  ];
}

/** Постфлоп: доля банка. */
export function postflopBetSizes(pot: number, minTo: number, maxTo: number): BetSizePreset[] {
  return [
    preset("third", "⅓ банка", pot / 3, minTo, maxTo),
    preset("half", "½ банка", pot / 2, minTo, maxTo),
    preset("threeq", "¾ банка", (pot * 3) / 4, minTo, maxTo),
    preset("pot", "Банк", pot, minTo, maxTo),
    preset("allin", "Олл-ин", maxTo, minTo, maxTo, true),
  ];
}
