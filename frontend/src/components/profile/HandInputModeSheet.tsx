import type { HandInputMode } from "@/api/types/auth";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { cn } from "@/lib/utils";

const OPTIONS: { value: HandInputMode; label: string; hint: string }[] = [
  { value: "table", label: "На столе", hint: "Ввод прямо на столе, как за живой игрой" },
  { value: "wizard", label: "Визард", hint: "Пошагово: стол → карты → действия → итог" },
];

export function HandInputModeSheet({
  open,
  onOpenChange,
  mode,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: HandInputMode;
  onSelect: (mode: HandInputMode) => void;
}) {
  return (
    <ProfileSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Способ ввода раздачи"
      description="Черновик открывается в любом режиме. Выбор сохраняется в профиле."
    >
      <div
        role="radiogroup"
        aria-label="Способ ввода раздачи"
        className="border-line bg-surface-2 overflow-hidden rounded-md border"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === mode}
            data-testid={`hand-input-mode-${option.value}`}
            className={cn(
              "border-line flex w-full items-center gap-3 border-t px-4 py-3.5 text-left first:border-t-0",
              option.value === mode && "bg-gold-soft text-gold",
            )}
            onClick={() => onSelect(option.value)}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{option.label}</span>
              <span className="text-ink-3 mt-px block text-[12px] font-normal">{option.hint}</span>
            </span>
            {option.value === mode ? <span aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
    </ProfileSheet>
  );
}
