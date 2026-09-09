import type { StreetName } from "@/api/types/hands";
import { PlayingCard } from "@/features/hands/components/PlayingCard";
import {
  boardSlot,
  previousBoardSlots,
  STREET_TITLE,
  type BoardStreetSlot,
} from "@/features/hands/lib/handSchema";
import { cn } from "@/lib/utils";

function slotIndexes(slot: BoardStreetSlot): number[] {
  return Array.from({ length: slot.count }, (_, offset) => slot.start + offset);
}

function BoardSlotButton({
  index,
  card,
  muted,
  large,
  active,
  onSelect,
}: {
  index: number;
  card: string | undefined;
  muted: boolean;
  large: boolean;
  active: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`board-card-${index}`}
      data-muted={muted ? "1" : "0"}
      aria-label={card ?? `Карта ${index + 1}`}
      aria-pressed={active}
      className={cn(
        "rounded-[8px]",
        muted && "opacity-45",
        active && "ring-gold ring-2 ring-offset-2 ring-offset-[var(--surface,#141311)]",
        large && !active && "ring-1 ring-[rgba(217,179,106,0.75)]",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(index);
      }}
    >
      {card ? (
        <PlayingCard card={card} size={large ? "lg" : "sm"} />
      ) : (
        <PlayingCard slot size={large ? "lg" : "sm"} />
      )}
    </button>
  );
}

function StreetGroup({
  slot,
  cards,
  replacing,
  muted,
  large,
  onSelect,
}: {
  slot: BoardStreetSlot;
  cards: string[];
  replacing: number | null;
  muted: boolean;
  large: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <div data-testid={`board-group-${slot.street}`} className="text-center">
      <div
        className={cn(
          "mb-1.5 text-[10.5px] font-extrabold tracking-[0.09em] uppercase",
          large ? "text-gold" : "text-ink-3",
        )}
      >
        {STREET_TITLE[slot.street]}
      </div>
      <div className="flex justify-center gap-1">
        {slotIndexes(slot).map((index) => (
          <BoardSlotButton
            key={index}
            index={index}
            card={cards[index]}
            muted={muted && replacing !== index}
            large={large}
            active={replacing === index || (large && replacing == null)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export function BoardByStreet({
  street,
  cards,
  replacing,
  onSelect,
}: {
  street: StreetName;
  cards: string[];
  replacing: number | null;
  onSelect: (index: number) => void;
}) {
  const current = boardSlot(street);
  if (!current) return null;
  const previous = previousBoardSlots(street);

  return (
    <div data-testid="board-by-street">
      {previous.length > 0 ? (
        <>
          <div
            className="mb-3 flex flex-wrap items-end justify-center gap-5"
            data-testid="board-previous"
          >
            {previous.map((slot) => (
              <StreetGroup
                key={slot.street}
                slot={slot}
                cards={cards}
                replacing={replacing}
                muted
                large={false}
                onSelect={onSelect}
              />
            ))}
          </div>
          <div className="border-line mx-auto mb-3 w-12 border-t" />
        </>
      ) : null}
      <div data-testid="board-current">
        <StreetGroup
          slot={current}
          cards={cards}
          replacing={replacing}
          muted={false}
          large
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
