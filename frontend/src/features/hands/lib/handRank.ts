export type ParsedCard = { rank: number; suit: number };

const RANK_CHARS = "23456789TJQKA";
const SUIT_CHARS = "shdc";

export function parseCard(card: string): ParsedCard {
  const rank = RANK_CHARS.indexOf(card[0] ?? "");
  const suit = SUIT_CHARS.indexOf(card[1] ?? "");
  return { rank: rank + 2, suit: Math.max(0, suit) };
}

function pack(category: number, kickers: number[]): number {
  const padded = [...kickers, 0, 0, 0, 0, 0].slice(0, 5);
  let score = category << 20;
  for (let index = 0; index < 5; index += 1) {
    score |= ((padded[index] ?? 0) & 15) << (4 * (4 - index));
  }
  return score;
}

function uniqueSorted(ranks: number[]): number[] {
  return [...new Set(ranks)].sort((a, b) => b - a);
}

function straightHigh(ranks: number[]): number | null {
  const present = new Set(ranks);
  if (present.has(14)) present.add(1);
  for (let high = 14; high >= 5; high -= 1) {
    const need = high === 5 ? [5, 4, 3, 2, 1] : [high, high - 1, high - 2, high - 3, high - 4];
    if (need.every((rank) => present.has(rank))) return high;
  }
  return null;
}

export function evalParsed(cards: ParsedCard[]): number {
  const ranks = cards.map((card) => card.rank);
  const bySuit: number[][] = [[], [], [], []];
  for (const card of cards) {
    bySuit[card.suit]?.push(card.rank);
  }
  const flushRanks = bySuit.map((group) => uniqueSorted(group)).find((group) => group.length >= 5);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const quad = groups.find((item) => item[1] === 4);
  const trips = groups.filter((item) => item[1] === 3);
  const pairs = groups.filter((item) => item[1] === 2);
  const kickers = uniqueSorted(ranks);

  if (flushRanks) {
    const sf = straightHigh(flushRanks);
    if (sf != null) return pack(8, [sf, 0, 0, 0, 0]);
  }
  if (quad) {
    const kicker = kickers.find((rank) => rank !== quad[0]) ?? 0;
    return pack(7, [quad[0], kicker, 0, 0, 0]);
  }
  if (trips.length && (pairs.length || trips.length > 1)) {
    const tripRank = trips[0]?.[0] ?? 0;
    const pairRank = pairs[0]?.[0] ?? trips[1]?.[0] ?? 0;
    return pack(6, [tripRank, pairRank, 0, 0, 0]);
  }
  if (flushRanks) {
    return pack(5, flushRanks.slice(0, 5));
  }
  const straight = straightHigh(ranks);
  if (straight != null) return pack(4, [straight, 0, 0, 0, 0]);
  if (trips.length) {
    const tripRank = trips[0]?.[0] ?? 0;
    const rest = kickers.filter((rank) => rank !== tripRank).slice(0, 2);
    return pack(3, [tripRank, ...rest]);
  }
  if (pairs.length >= 2) {
    const high = pairs[0]?.[0] ?? 0;
    const low = pairs[1]?.[0] ?? 0;
    const kicker = kickers.find((rank) => rank !== high && rank !== low) ?? 0;
    return pack(2, [high, low, kicker, 0, 0]);
  }
  if (pairs.length === 1) {
    const pairRank = pairs[0]?.[0] ?? 0;
    const rest = kickers.filter((rank) => rank !== pairRank).slice(0, 3);
    return pack(1, [pairRank, ...rest]);
  }
  return pack(0, kickers.slice(0, 5));
}

export function evalHand(hole: ParsedCard[], board: ParsedCard[] = []): number {
  return evalParsed([...hole, ...board]);
}

export function bestFive(hole: string[], board: string[]): number {
  return evalParsed([...hole, ...board].map(parseCard));
}
