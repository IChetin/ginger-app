import type { ScheduleView } from "@/api/types/tournaments";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { SCHEDULE_VIEW_LABELS } from "@/features/tournaments/lib/scheduleView";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ScheduleView; hint: string }[] = [
  { value: "cards", hint: "Крупно: формат, аддон, Early Bird" },
  { value: "table", hint: "Плотный список, как лобби турниров" },
];

export function ScheduleViewSheet({
  open,
  onOpenChange,
  choice,
  isPending,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choice: ScheduleView;
  isPending: boolean;
  onSelect: (choice: ScheduleView) => void;
}) {
  return (
    <ProfileSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Вид расписания"
      description="Сохраняется в профиле — одинаково на всех устройствах."
    >
      <div
        role="radiogroup"
        aria-label="Вид расписания"
        className="border-line bg-surface-2 overflow-hidden rounded-md border"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === choice}
            disabled={isPending}
            className={cn(
              "border-line flex w-full items-center gap-3 border-t px-4 py-3.5 text-left first:border-t-0",
              option.value === choice && "bg-gold-soft text-gold",
            )}
            onClick={() => onSelect(option.value)}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">
                {SCHEDULE_VIEW_LABELS[option.value]}
              </span>
              <span className="text-ink-3 mt-px block text-[12px] font-normal">{option.hint}</span>
            </span>
            {option.value === choice ? <span aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
    </ProfileSheet>
  );
}
