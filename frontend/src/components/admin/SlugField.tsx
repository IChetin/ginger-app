import { adminInputClass } from "@/components/admin/FlightRowsEditor";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSuggest: () => string;
  onDirty?: () => void;
  className?: string;
};

export function SlugField({ value, onChange, onSuggest, onDirty, className }: Props) {
  return (
    <div className={cn("mb-3", className)}>
      <label className="text-ink-2 mb-1 block text-xs font-semibold">Ссылка</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onDirty?.();
          }}
          className={cn(adminInputClass, "num flex-1")}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => {
            onChange(onSuggest());
            onDirty?.();
          }}
          className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink shrink-0 rounded-[10px] border bg-transparent px-3 text-[12px] font-bold whitespace-nowrap"
        >
          Обновить из названия
        </button>
      </div>
      <p className="text-ink-3 mt-1.5 text-[11px] leading-snug">
        Старая ссылка перестанет работать, если не сохранить редирект
      </p>
    </div>
  );
}
