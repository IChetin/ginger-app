import type { CardDeck } from "@/api/types/auth";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { PlayingCard } from "@/features/hands/components/PlayingCard";
import { CARD_DECK_LABELS } from "@/features/hands/lib/cardDeck";
import { cn } from "@/lib/utils";

const PREVIEW = ["As", "Ah", "Ad", "Ac"] as const;

const OPTIONS: { value: CardDeck; hint: string }[] = [
  { value: "four_color", hint: "Пики чёрные, черви красные, бубны синие, трефы зелёные" },
  { value: "classic", hint: "Пики и трефы чёрные, черви и бубны красные" },
];

export function CardDeckSheet({
  open,
  onOpenChange,
  scheme,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheme: CardDeck;
  onSelect: (scheme: CardDeck) => void;
}) {
  return (
    <ProfileSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Колода"
      description="Цвета мастей на картах. Выбор сохраняется в профиле."
    >
      <div
        role="radiogroup"
        aria-label="Колода"
        className="border-line bg-surface-2 overflow-hidden rounded-md border"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === scheme}
            data-testid={`card-deck-${option.value}`}
            className={cn(
              "border-line flex w-full items-center gap-3 border-t px-4 py-3.5 text-left first:border-t-0",
              option.value === scheme && "bg-gold-soft",
            )}
            onClick={() => onSelect(option.value)}
          >
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[15px] font-semibold">
                {CARD_DECK_LABELS[option.value]}
              </span>
              <span className="text-ink-3 mt-px block text-[12px] font-normal">{option.hint}</span>
              <span className="mt-2 flex gap-1" aria-hidden="true">
                {PREVIEW.map((card) => (
                  <PlayingCard key={card} card={card} size="sm" scheme={option.value} />
                ))}
              </span>
            </span>
            {option.value === scheme ? (
              <span className="text-gold" aria-hidden="true">
                ✓
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </ProfileSheet>
  );
}
