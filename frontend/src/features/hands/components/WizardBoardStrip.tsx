import type { Dispatch } from "react";

import { PlayingCard } from "@/features/hands/components/PlayingCard";
import { WizardHeroEquity } from "@/features/hands/components/WizardHeroEquity";
import { BOARD_STREET_SLOTS, boardReplaceHint } from "@/features/hands/lib/handSchema";
import { canUseBb, formatStackAmount } from "@/features/hands/lib/stackDisplay";
import { useStackDisplay } from "@/features/hands/lib/useStackDisplay";
import {
  highlightedBoardIndexes,
  wizardBoardCards,
  wizardPot,
  type WizardAction,
  type WizardState,
} from "@/features/hands/lib/wizardState";
import { cn } from "@/lib/utils";

function slotIndexes(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, offset) => start + offset);
}

export function WizardBoardStrip({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}) {
  const cards = wizardBoardCards(state);
  const highlighted = new Set(highlightedBoardIndexes(state));
  const pot = wizardPot(state);
  const { mode } = useStackDisplay();
  const bbOk = canUseBb(state.blinds.bb);
  const displayMode = bbOk && mode === "bb" ? "bb" : "chips";
  const amount = formatStackAmount(pot, displayMode, state.blinds.bb);

  return (
    <div data-testid="wizard-board-strip" className="min-w-0">
      <div
        data-testid="wizard-board-strip-cards"
        className="border-line flex h-11 min-w-0 items-center gap-2 border-t px-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible">
          {BOARD_STREET_SLOTS.map((slot, slotIndex) => {
            const indexes = slotIndexes(slot.start, slot.count);
            const current = indexes.some((index) => highlighted.has(index));
            return (
              <div
                key={slot.street}
                data-testid={`strip-group-${slot.street}`}
                data-current={current ? "1" : "0"}
                className={cn(
                  "flex shrink-0 items-center gap-0.5 rounded-[6px]",
                  slotIndex > 0 && "ml-0.5",
                  current && "outline-gold outline-2 outline-offset-1 outline-solid",
                )}
              >
                {indexes.map((index) => {
                  const card = cards[index];
                  return (
                    <button
                      key={index}
                      type="button"
                      data-testid={`strip-card-${index}`}
                      aria-label={card ?? boardReplaceHint(index).replace("Меняете ", "")}
                      className="shrink-0 rounded-[5px]"
                      onClick={() => dispatch({ type: "openBoardSlot", index })}
                    >
                      {card ? (
                        <PlayingCard card={card} size="strip" />
                      ) : (
                        <PlayingCard slot size="strip" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="min-w-0 shrink-0 text-right" data-testid="strip-pot">
          <div className="text-ink-3 text-[9px] leading-none font-semibold tracking-wide uppercase">
            Банк
          </div>
          <div className="text-gold num mt-0.5 max-w-[7.5rem] truncate text-[13px] leading-none font-extrabold">
            {amount}
          </div>
        </div>
      </div>
      <WizardHeroEquity state={state} />
    </div>
  );
}
