import { cn } from "@/lib/utils";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function FilterOption({
  label,
  selected,
  count,
  disabled = false,
  onClick,
}: {
  label: string;
  selected: boolean;
  count?: number;
  /** Zero-count options stay visible but inactive (unless already selected). */
  disabled?: boolean;
  onClick: () => void;
}) {
  const inactive = disabled && !selected;

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={inactive}
      onClick={onClick}
      className={cn(
        "inline-flex h-[38px] items-center gap-[7px] rounded-full border px-3.5 text-[14px] font-semibold",
        selected
          ? "border-line-gold bg-gold-soft text-gold"
          : "border-line-strong bg-surface-2 text-ink-2",
        inactive && "cursor-not-allowed opacity-45",
      )}
    >
      <span
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px]",
          selected ? "border-transparent bg-gold-grad text-ink-ongold" : "border-line-strong",
        )}
      >
        {selected ? (
          <CheckIcon className="h-[11px] w-[11px] fill-none stroke-current [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]" />
        ) : null}
      </span>
      <span>{label}</span>
      {count !== undefined ? (
        <span
          className={cn(
            "num text-[11px] tabular-nums",
            selected ? "text-gold/75" : "text-ink-3",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
