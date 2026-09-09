import type { CardDeck } from "@/api/types/auth";

export type { CardDeck };

export const DEFAULT_CARD_DECK: CardDeck = "four_color";

export const CARD_FACE = "#FBF8F0";
export const SUIT_BLACK = "#1A1710";
export const SUIT_RED = "#C7382F";
export const SUIT_DIAMOND = "#2E6FC4";
export const SUIT_CLUB = "#1F8A4C";

const PALETTE: Record<CardDeck, Record<string, string>> = {
  classic: { s: SUIT_BLACK, h: SUIT_RED, d: SUIT_RED, c: SUIT_BLACK },
  four_color: { s: SUIT_BLACK, h: SUIT_RED, d: SUIT_DIAMOND, c: SUIT_CLUB },
};

export const CARD_DECK_LABELS: Record<CardDeck, string> = {
  classic: "Классическая",
  four_color: "Четырёхцветная",
};

export function isCardDeck(value: unknown): value is CardDeck {
  return value === "classic" || value === "four_color";
}

export function parseCardDeck(value: unknown): CardDeck {
  return isCardDeck(value) ? value : DEFAULT_CARD_DECK;
}

/** Suit ink on a cream card face. Same hex in both app themes. */
export function suitColor(suit: string, scheme: CardDeck = DEFAULT_CARD_DECK): string {
  return PALETTE[scheme][suit] ?? SUIT_BLACK;
}

export function isBlackSuit(suit: string, scheme: CardDeck = DEFAULT_CARD_DECK): boolean {
  return suitColor(suit, scheme) === SUIT_BLACK;
}
