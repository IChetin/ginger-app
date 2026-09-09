import { evalHand, parseCard } from "@/features/hands/lib/handRank";

const RANK_ORDER = "23456789TJQKA";
const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function describeHole(cards: string[]): string {
  if (cards.length !== 2) return "";
  const first = cards[0];
  const second = cards[1];
  if (!first || !second) return "";
  const ranks = [first[0] ?? "", second[0] ?? ""].sort(
    (a, b) => RANK_ORDER.indexOf(b) - RANK_ORDER.indexOf(a),
  );
  const a = ranks[0] ?? "";
  const b = ranks[1] ?? "";
  if (a === b) return `${a}${b}`;
  const suited = first[1] === second[1];
  if (suited) {
    const suit = SUIT_GLYPH[first[1] ?? ""] ?? "";
    return `${a}${b}s${suit ? ` ${suit}` : ""}`;
  }
  return `${a}${b} offsuit`;
}

export function categoryLabel(score: number): string {
  const names = [
    "старшая карта",
    "пара",
    "две пары",
    "сет",
    "стрит",
    "флеш",
    "фулл-хаус",
    "каре",
    "стрит-флеш",
  ];
  return names[score >> 20] ?? "";
}

/** Комбинация по дыркам и борду; пусто, пока нет двух карт или хотя бы флопа. */
export function describeMadeHand(hole: string[], board: string[]): string {
  if (hole.length !== 2 || board.length < 3) return "";
  try {
    return categoryLabel(evalHand(hole.map(parseCard), board.map(parseCard)));
  } catch {
    return "";
  }
}
