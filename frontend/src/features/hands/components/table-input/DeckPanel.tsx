import type { Dispatch } from "react";

import { CardDeck } from "@/features/hands/components/CardDeck";
import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";
import { TABLE_SHEET_CLASS } from "@/features/hands/components/table-input/sheet";
import { TableUndoButton } from "@/features/hands/components/table-input/TableUndoButton";
import { describeHole } from "@/features/hands/lib/describeHand";
import { usedCards } from "@/features/hands/lib/hand-engine";
import { displaySeatName } from "@/features/hands/lib/playerNames";
import { canUseBb } from "@/features/hands/lib/stackDisplay";
import type { TableInputAction, TableInputState } from "@/features/hands/lib/tableInputState";
import { useTableStackDisplay } from "@/features/hands/lib/useTableStackDisplay";
import { cn } from "@/lib/utils";

export function DeckPanel({
  state,
  dispatch,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
}) {
  const { mode, setMode } = useTableStackDisplay();
  const deck = state.deck;
  if (!deck) return null;
  const replacing = deck.kind === "board" && deck.replaceIndex != null;
  const title = replacing
    ? "Замена карты борда"
    : deck.kind === "hero"
      ? "Карты героя"
      : deck.kind === "showdown"
        ? cardsHeading(
            deck.seat != null
              ? displaySeatName(deck.seat, state.heroSeat, state.names[deck.seat])
              : undefined,
          )
        : "Борд";
  const locked = usedCards({
    ...state,
    heroCards: deck.kind === "hero" ? [] : state.heroCards,
    showdownCards:
      deck.kind === "showdown" && deck.seat != null
        ? { ...state.showdownCards, [deck.seat]: [] }
        : state.showdownCards,
  });
  if (replacing) {
    const current = deck.replaceIndex != null ? deck.selected[deck.replaceIndex] : undefined;
    if (current) locked.delete(current);
  } else {
    for (const card of deck.selected) locked.delete(card);
  }
  const selectedForDeck =
    replacing && deck.replaceIndex != null && deck.selected[deck.replaceIndex]
      ? [deck.selected[deck.replaceIndex]]
      : deck.selected;
  const holeLabel =
    (deck.kind === "hero" || deck.kind === "showdown") && deck.selected.length === 2
      ? describeHole(deck.selected)
      : "";

  return (
    <section
      className={cn(TABLE_SHEET_CLASS, "max-h-[60%] overflow-y-auto")}
      data-testid="table-deck-panel"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <StackDisplayToggle
          compact
          mode={mode === "bb" && canUseBb(state.blinds.bb) ? "bb" : "chips"}
          disabled={!canUseBb(state.blinds.bb)}
          onChange={setMode}
        />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          <TableUndoButton state={state} dispatch={dispatch} />
          <button
            type="button"
            className="text-ink-3 text-[13px] font-bold"
            onClick={() => dispatch({ type: "closeDeck" })}
          >
            Закрыть
          </button>
        </div>
      </div>
      {holeLabel ? (
        <p
          className="text-ink-3 mb-2 text-[12px] font-semibold"
          data-testid="table-hole-description"
        >
          {holeLabel}
        </p>
      ) : null}
      <CardDeck
        variant="rows"
        selected={selectedForDeck}
        used={locked}
        onToggle={(card) => dispatch({ type: "toggleCard", card })}
      />
      {deck.kind === "showdown" && deck.seat != null && deck.seat !== state.heroSeat ? (
        <button
          type="button"
          data-testid={`table-deck-muck-${deck.seat}`}
          className="text-ink-3 mt-3 w-full text-[13px] font-extrabold"
          onClick={() => dispatch({ type: "muckSeat", seat: deck.seat! })}
        >
          Не показал
        </button>
      ) : null}
    </section>
  );
}

function cardsHeading(name: string | undefined): string {
  if (!name) return "Карты вскрытия";
  const match = /^Игрок (\d+)$/.exec(name);
  if (match) return `Карты Игрока ${match[1]}`;
  return `Карты ${name}`;
}
