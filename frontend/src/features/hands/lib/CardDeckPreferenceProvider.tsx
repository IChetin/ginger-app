import { createContext, useContext, type ReactNode } from "react";

import type { CardDeck } from "@/api/types/auth";
import { useMe } from "@/features/auth/hooks";
import { DEFAULT_CARD_DECK, parseCardDeck } from "@/features/hands/lib/cardDeck";

const CardDeckContext = createContext<CardDeck>(DEFAULT_CARD_DECK);

export function CardDeckPreferenceProvider({ children }: { children: ReactNode }) {
  const { data: user } = useMe();
  return (
    <CardDeckContext.Provider value={parseCardDeck(user?.card_deck)}>
      {children}
    </CardDeckContext.Provider>
  );
}

export function useCardDeck(): CardDeck {
  return useContext(CardDeckContext);
}
