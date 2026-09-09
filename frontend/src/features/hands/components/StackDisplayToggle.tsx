import type { StackDisplayMode } from "@/features/hands/lib/stackDisplay";
import { cn } from "@/lib/utils";

const segmentClass =
  "min-h-11 min-w-11 rounded-[8px] px-3 text-[13px] font-bold leading-none tracking-tight";

const compactSegmentClass =
  "h-[32px] min-h-0 min-w-0 rounded-[7px] px-2 text-[11px] font-extrabold leading-none whitespace-nowrap";

export function StackDisplayToggle({
  mode,
  onChange,
  disabled = false,
  compact = false,
  bbFirst = false,
}: {
  mode: StackDisplayMode;
  onChange: (mode: StackDisplayMode) => void;
  disabled?: boolean;
  compact?: boolean;
  bbFirst?: boolean;
}) {
  const chips = (
    <button
      key="chips"
      type="button"
      aria-label="Фишки"
      aria-pressed={mode === "chips"}
      disabled={disabled}
      className={cn(
        compact ? compactSegmentClass : segmentClass,
        mode === "chips" ? "bg-gold-grad text-ink-ongold" : "text-ink-3",
      )}
      onClick={() => onChange("chips")}
    >
      {compact && !bbFirst ? (
        <>
          <span className="min-[430px]:hidden">₽</span>
          <span className="hidden min-[430px]:inline">Фишки</span>
        </>
      ) : (
        "Фишки"
      )}
    </button>
  );
  const bb = (
    <button
      key="bb"
      type="button"
      aria-label="BB"
      aria-pressed={mode === "bb"}
      disabled={disabled}
      title={disabled ? "Укажите размер BB" : undefined}
      className={cn(
        compact ? compactSegmentClass : segmentClass,
        mode === "bb" ? "bg-gold-grad text-ink-ongold" : "text-ink-3",
      )}
      onClick={() => onChange("bb")}
    >
      BB
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Отображение стеков"
      aria-disabled={disabled}
      className={cn(
        "bg-surface-2 border-line inline-flex shrink-0 items-center gap-0.5 rounded-md border p-[3px]",
        compact && "h-[38px]",
        disabled && "opacity-50",
      )}
      data-testid="stack-display-toggle"
    >
      {bbFirst ? (
        <>
          {bb}
          {chips}
        </>
      ) : (
        <>
          {chips}
          {bb}
        </>
      )}
    </div>
  );
}
