import {
  REMINDER_PRESET_LABELS,
  REMINDER_PRESET_OFFSETS,
  type ReminderPresetOffset,
} from "@/features/bookmarks/lib/reminderPresets";
import { cn } from "@/lib/utils";

type Props = {
  offsets: number[];
  onToggle: (offset: ReminderPresetOffset) => void;
  disabled?: boolean;
  className?: string;
};

/** Controlled preset chips for flight reminder offsets (min 1 selected enforced by parent). */
export function ReminderOffsetChips({ offsets, onToggle, disabled = false, className }: Props) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} data-testid="reminder-offset-chips">
      {REMINDER_PRESET_OFFSETS.map((offset) => {
        const activeChip = offsets.includes(offset);
        return (
          <button
            key={offset}
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-[13px] text-[13px] font-semibold",
              activeChip
                ? "bg-gold-grad text-ink-ongold shadow-sheen-soft border-transparent"
                : "border-line-strong bg-surface-2 text-ink-2",
            )}
            onClick={() => onToggle(offset)}
          >
            За {REMINDER_PRESET_LABELS[offset]}
          </button>
        );
      })}
    </div>
  );
}
