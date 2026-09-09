const RANK_CHARS = new Set(["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]);
const SUIT_CHARS = new Set(["s", "h", "d", "c"]);

export const DECK_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export const DECK_HIGH = DECK_RANKS.slice(0, 7);
export const DECK_LOW = DECK_RANKS.slice(7);

export type DeckKeyResult = { buffer: string; card: string | null };

function startBuffer(key: string): DeckKeyResult {
  if (key === "1") return { buffer: "1", card: null };
  const rank = key.toUpperCase();
  if (RANK_CHARS.has(rank)) return { buffer: rank, card: null };
  return { buffer: "", card: null };
}

/** Накапливает ввод вида `As` / `10h` → код карты `As` / `Th`. */
export function consumeDeckKey(buffer: string, key: string): DeckKeyResult {
  if (key.length !== 1) return { buffer, card: null };

  if (buffer === "1") {
    if (key === "0") return { buffer: "T", card: null };
    return startBuffer(key);
  }

  if (buffer.length === 1) {
    const suit = key.toLowerCase();
    if (SUIT_CHARS.has(suit)) {
      return { buffer: "", card: `${buffer}${suit}` };
    }
    return startBuffer(key);
  }

  return startBuffer(key);
}

export function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
