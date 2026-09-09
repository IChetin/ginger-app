import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { THEME_LABELS, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; hint: string }[] = [
  { value: "system", hint: "Следует настройке устройства" },
  { value: "dark", hint: "Чёрно-золотая" },
  { value: "light", hint: "Кремовый люкс" },
];

export function ThemeSheet({
  open,
  onOpenChange,
  choice,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choice: ThemeChoice;
  onSelect: (choice: ThemeChoice) => void;
}) {
  return (
    <ProfileSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Тема"
      description="Применяется сразу, выбор сохраняется на этом устройстве."
    >
      <div
        role="radiogroup"
        aria-label="Тема"
        className="border-line bg-surface-2 overflow-hidden rounded-md border"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === choice}
            className={cn(
              "border-line flex w-full items-center gap-3 border-t px-4 py-3.5 text-left first:border-t-0",
              option.value === choice && "bg-gold-soft text-gold",
            )}
            onClick={() => onSelect(option.value)}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{THEME_LABELS[option.value]}</span>
              <span className="text-ink-3 mt-px block text-[12px] font-normal">{option.hint}</span>
            </span>
            {option.value === choice ? <span aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
    </ProfileSheet>
  );
}
