import { cn } from "@/lib/utils";
import type { SegmentOption } from "@/components/filters/types";

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-surface border-line mx-4 mb-2.5 flex min-w-0 gap-0.5 overflow-x-auto rounded-md border p-[3px]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        const countLabel =
          option.count === undefined ? option.label : `${option.label} ${option.count}`;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-label={countLabel}
            aria-selected={active}
            className={cn(
              "flex h-[34px] items-center justify-center gap-1 rounded-sm whitespace-nowrap",
              options.length <= 4
                ? "min-w-0 flex-1 basis-0 max-[359px]:min-w-max max-[359px]:flex-none max-[359px]:shrink-0"
                : "shrink-0",
              option.count !== undefined ? "px-1.5" : "px-3",
              active ? "bg-surface-3 text-ink" : "text-ink-2",
            )}
            onClick={() => onChange(option.value)}
          >
            <span className="text-[13px] font-bold">{option.label}</span>
            {option.count !== undefined ? (
              <span
                className={cn(
                  "text-ink-3 num font-semibold tabular-nums",
                  "text-[9px] min-[360px]:text-[10px]",
                  !active && "max-[359px]:hidden",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
