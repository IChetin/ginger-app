import type { AnteMode } from "@/features/hands/lib/anteMode";
import { cn } from "@/lib/utils";

const segmentClass =
  "min-h-11 min-w-11 rounded-[8px] px-2.5 text-[13px] font-bold leading-none tracking-tight";

export function AnteModeToggle({
  mode,
  onChange,
  compact = false,
}: {
  mode: AnteMode;
  onChange: (mode: AnteMode) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Режим анте"
      className={cn(
        "bg-surface-2 border-line inline-flex items-center gap-0.5 rounded-md border p-[3px]",
        compact ? "h-11 w-[90px] shrink-0" : "shrink-0",
      )}
      data-testid="ante-mode-toggle"
    >
      <button
        type="button"
        aria-pressed={mode === "bb"}
        className={cn(
          compact
            ? "h-full min-h-0 min-w-0 flex-1 rounded-[8px] px-1 text-[11px] font-extrabold whitespace-nowrap"
            : segmentClass,
          mode === "bb" ? "bg-gold-grad text-ink-ongold" : "text-ink-3",
        )}
        onClick={() => onChange("bb")}
      >
        {compact ? "BB" : "BB-анте"}
      </button>
      <button
        type="button"
        aria-pressed={mode === "occupied"}
        className={cn(
          compact
            ? "h-full min-h-0 min-w-0 flex-1 rounded-[8px] px-1 text-[11px] font-extrabold whitespace-nowrap"
            : segmentClass,
          mode === "occupied" ? "bg-gold-grad text-ink-ongold" : "text-ink-3",
        )}
        onClick={() => onChange("occupied")}
      >
        {compact ? "Все" : "По сидящим"}
      </button>
    </div>
  );
}
