import { useEffect, useRef } from "react";

import { useIsDesktop } from "@/components/filters/useIsDesktop";
import {
  CARD_FACE,
  type CardDeck as CardDeckScheme,
  isBlackSuit,
  suitColor,
} from "@/features/hands/lib/cardDeck";
import { useCardDeck } from "@/features/hands/lib/CardDeckPreferenceProvider";
import {
  consumeDeckKey,
  DECK_HIGH,
  DECK_LOW,
  DECK_RANKS,
  isTypingInField,
} from "@/features/hands/lib/deckKeys";
import { cn } from "@/lib/utils";

const SUITS = [
  { suit: "s", glyph: "♠" },
  { suit: "h", glyph: "♥" },
  { suit: "d", glyph: "♦" },
  { suit: "c", glyph: "♣" },
] as const;

const DESKTOP_MIN_WIDTH = 640;
const KEY_BUFFER_MS = 800;

export function CardDeck({
  selected,
  used,
  onToggle,
  variant = "auto",
}: {
  selected: string[];
  used: Set<string>;
  onToggle: (card: string) => void;
  /** `rows` — 4×13 as in the table-input mock; `auto` splits ranks on mobile. */
  variant?: "auto" | "rows";
}) {
  const selectedSet = new Set(selected);
  const isDesktop = useIsDesktop(DESKTOP_MIN_WIDTH);
  const compact = variant === "rows" || isDesktop;
  const scheme = useCardDeck();
  useDeckKeyboard(isDesktop, selectedSet, used, onToggle);

  return (
    <div
      data-testid="card-deck"
      className={cn("flex flex-col gap-2", isDesktop && "mx-auto w-full max-w-[560px] gap-[5px]")}
    >
      {SUITS.map((row) => (
        <div key={row.suit} className="bg-surface-2/40 space-y-1 rounded-md px-1 py-1.5">
          {compact ? (
            <DeckRow
              ranks={DECK_RANKS}
              suit={row.suit}
              glyph={row.glyph}
              scheme={scheme}
              selectedSet={selectedSet}
              used={used}
              onToggle={onToggle}
              compact
              dense={variant === "rows"}
            />
          ) : (
            <>
              <DeckRow
                ranks={DECK_HIGH}
                suit={row.suit}
                glyph={row.glyph}
                scheme={scheme}
                selectedSet={selectedSet}
                used={used}
                onToggle={onToggle}
              />
              <DeckRow
                ranks={DECK_LOW}
                suit={row.suit}
                glyph={row.glyph}
                scheme={scheme}
                selectedSet={selectedSet}
                used={used}
                onToggle={onToggle}
                pad
              />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function useDeckKeyboard(
  enabled: boolean,
  selectedSet: Set<string>,
  used: Set<string>,
  onToggle: (card: string) => void,
) {
  const selectedRef = useRef(selectedSet);
  const usedRef = useRef(used);
  const onToggleRef = useRef(onToggle);
  selectedRef.current = selectedSet;
  usedRef.current = used;
  onToggleRef.current = onToggle;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let timer: number | null = null;
    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const reset = () => {
      buffer = "";
      clearTimer();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingInField(event.target)) return;

      const result = consumeDeckKey(buffer, event.key);
      buffer = result.buffer;
      if (result.card) {
        event.preventDefault();
        const blocked = usedRef.current.has(result.card) && !selectedRef.current.has(result.card);
        if (!blocked) onToggleRef.current(result.card);
        reset();
        return;
      }
      clearTimer();
      if (buffer) {
        timer = window.setTimeout(reset, KEY_BUFFER_MS);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimer();
    };
  }, [enabled]);
}

function DeckRow({
  ranks,
  suit,
  glyph,
  scheme,
  selectedSet,
  used,
  onToggle,
  compact = false,
  pad = false,
  dense = false,
}: {
  ranks: readonly string[];
  suit: string;
  glyph: string;
  scheme: CardDeckScheme;
  selectedSet: Set<string>;
  used: Set<string>;
  onToggle: (card: string) => void;
  compact?: boolean;
  pad?: boolean;
  dense?: boolean;
}) {
  const black = isBlackSuit(suit, scheme);
  return (
    <div
      data-testid="deck-row"
      className={cn(
        compact
          ? dense
            ? "grid grid-cols-[14px_repeat(13,minmax(0,1fr))] items-center gap-[3px]"
            : "grid grid-cols-[15px_repeat(13,minmax(0,40px))] items-center justify-center gap-[5px]"
          : "flex items-center gap-1",
      )}
    >
      <span
        className={cn(
          "w-[15px] shrink-0 text-center text-[14px] font-extrabold",
          black && "text-ink",
        )}
        style={black ? undefined : { color: suitColor(suit, scheme) }}
      >
        {glyph}
      </span>
      {ranks.map((rank) => {
        const card = `${rank}${suit}`;
        return (
          <Pick
            key={card}
            rank={rank}
            suit={suit}
            scheme={scheme}
            card={card}
            selected={selectedSet.has(card)}
            used={used.has(card) && !selectedSet.has(card)}
            compact={compact}
            dense={dense}
            onToggle={onToggle}
          />
        );
      })}
      {pad ? <span className="flex-1" /> : null}
    </div>
  );
}

function Pick({
  rank,
  suit,
  scheme,
  card,
  selected,
  used,
  compact,
  dense = false,
  onToggle,
}: {
  rank: string;
  suit: string;
  scheme: CardDeckScheme;
  card: string;
  selected: boolean;
  used: boolean;
  compact: boolean;
  dense?: boolean;
  onToggle: (card: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={used}
      aria-disabled={used}
      aria-pressed={selected}
      aria-label={card}
      onClick={() => {
        if (used) return;
        onToggle(card);
      }}
      className={cn(
        "box-border flex items-center justify-center rounded-[5px] border text-[12.5px] font-extrabold",
        compact
          ? dense
            ? "h-[34px] w-full min-w-0 text-[12.5px]"
            : "h-[54px] w-full min-w-0"
          : "aspect-[0.68] flex-1",
        selected && "border-transparent shadow-[0_2px_6px_rgba(0,0,0,0.4)]",
        !selected && !used && "border-line-strong bg-surface-2 text-ink-2",
        used && "border-line bg-surface-3 text-ink-3 cursor-not-allowed opacity-25",
      )}
      style={selected ? { backgroundColor: CARD_FACE, color: suitColor(suit, scheme) } : undefined}
    >
      {rank}
    </button>
  );
}
