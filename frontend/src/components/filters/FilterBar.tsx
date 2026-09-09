import { useState } from "react";

import type { AppliedChip } from "@/components/filters/types";
import { cn } from "@/lib/utils";

const CHIP_VISIBLE_LIMIT = 6;

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5h18M6 12h12M10 19h4" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const iconClass =
  "h-[15px] w-[15px] fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

export function FilterTrigger({
  activeCount,
  onOpen,
  compact = false,
}: {
  activeCount: number;
  onOpen: () => void;
  compact?: boolean;
}) {
  const label = activeCount > 0 ? `Фильтры, применено ${activeCount}` : "Фильтры";
  const active = activeCount > 0;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        data-testid="filter-trigger"
        className={cn(
          "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
          active
            ? "border-line-gold bg-gold-soft text-gold"
            : "border-line-strong bg-surface text-ink-2",
        )}
      >
        <FilterIcon className={iconClass} />
        {active ? (
          <span className="bg-gold-grad text-ink-ongold absolute -top-1 -right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[4px] text-[10px] font-extrabold tabular-nums">
            {activeCount}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      data-testid="filter-trigger"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-[7px] rounded-full border px-3.5 text-[13px] font-bold",
        active
          ? "border-line-gold bg-gold-soft text-gold"
          : "border-line-strong bg-surface text-ink",
      )}
    >
      <FilterIcon className={iconClass} />
      Фильтры
      {active ? (
        <span className="bg-gold-grad text-ink-ongold inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[11px] font-extrabold tabular-nums">
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}

function ChipList({
  chips,
  onRemoveChip,
  onClear,
}: {
  chips: AppliedChip[];
  onRemoveChip: (chip: AppliedChip) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = chips.length > CHIP_VISIBLE_LIMIT;
  const showCollapsed = needsCollapse && !expanded;
  const visibleChips = showCollapsed ? chips.slice(0, CHIP_VISIBLE_LIMIT) : chips;
  const hiddenCount = chips.length - CHIP_VISIBLE_LIMIT;

  return (
    <>
      {visibleChips.map((chip) => (
        <span
          key={`${chip.groupId}:${chip.value}`}
          className="border-line-gold bg-gold-soft text-gold inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-2 pl-3 text-[13px] font-semibold whitespace-nowrap"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Убрать ${chip.label}`}
            className="inline-flex p-0.5"
            onClick={() => onRemoveChip(chip)}
          >
            <CloseIcon className="h-[13px] w-[13px] fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round]" />
          </button>
        </span>
      ))}

      {showCollapsed ? (
        <button
          type="button"
          className="border-line-gold bg-gold-soft text-gold inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap"
          onClick={() => setExpanded(true)}
          data-testid="filter-chips-more"
        >
          ещё {hiddenCount}
        </button>
      ) : null}

      {chips.length > 0 ? (
        <button
          type="button"
          className="text-ink-3 shrink-0 px-1.5 text-[13px] font-semibold underline"
          onClick={onClear}
        >
          Сбросить
        </button>
      ) : null}
    </>
  );
}

const chipsRowClass = cn(
  "flex w-full min-w-0 max-w-full items-center gap-2 px-4 pb-3",
  "max-lg:overflow-x-auto max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden",
  "lg:flex-wrap lg:overflow-x-visible",
);

export function FilterChips({
  chips,
  onRemoveChip,
  onClear,
}: {
  chips: AppliedChip[];
  onRemoveChip: (chip: AppliedChip) => void;
  onClear: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className={chipsRowClass} data-testid="filter-chips">
      <ChipList chips={chips} onRemoveChip={onRemoveChip} onClear={onClear} />
    </div>
  );
}

export function FilterBar({
  activeCount,
  chips,
  onOpen,
  onRemoveChip,
  onClear,
}: {
  activeCount: number;
  chips: AppliedChip[];
  onOpen: () => void;
  onRemoveChip: (chip: AppliedChip) => void;
  onClear: () => void;
}) {
  return (
    <div className={chipsRowClass} data-testid="filter-bar">
      <FilterTrigger activeCount={activeCount} onOpen={onOpen} />
      <ChipList chips={chips} onRemoveChip={onRemoveChip} onClear={onClear} />
    </div>
  );
}
