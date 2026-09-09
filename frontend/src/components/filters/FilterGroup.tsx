import { FilterOption } from "@/components/filters/FilterOption";
import type { FilterGroupConfig, FilterSelectionMode } from "@/components/filters/types";

export function FilterGroup({
  group,
  selected,
  onToggle,
}: {
  group: FilterGroupConfig;
  selected: string[];
  onToggle: (value: string, mode: FilterSelectionMode) => void;
}) {
  const mode = group.mode ?? "multi";
  const selectedCount = selected.length;

  return (
    <div className="border-line border-b py-3.5 last:border-b-0">
      <div className="text-ink-3 mb-2.5 flex items-center gap-2 text-[12px] font-bold tracking-[0.06em] uppercase">
        <span>{group.title}</span>
        {selectedCount > 0 && mode === "multi" ? (
          <span className="text-gold text-[12px] font-bold tracking-normal normal-case">
            · выбрано {selectedCount}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {group.options.map((option) => (
          <FilterOption
            key={option.value}
            label={option.label}
            selected={selected.includes(option.value)}
            count={option.count}
            disabled={option.disabled ?? (option.count !== undefined && option.count === 0)}
            onClick={() => onToggle(option.value, mode)}
          />
        ))}
      </div>
      {group.hint ? <p className="text-ink-3 mt-2 text-[11px] leading-snug">{group.hint}</p> : null}
      {group.footer}
    </div>
  );
}
