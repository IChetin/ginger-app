import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "@base-ui/react/drawer";

import { FilterGroup } from "@/components/filters/FilterGroup";
import { useIsDesktop } from "@/components/filters/useIsDesktop";
import type {
  FilterGroupConfig,
  FilterSelectionMode,
  FilterValues,
} from "@/components/filters/types";
import { clearValues, toggleValue } from "@/components/filters/types";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

function applyLabel(
  resultCount: number | null,
  resultWords: readonly [string, string, string],
): string {
  if (resultCount === null) {
    return `Показать ${resultWords[2]}`;
  }
  return `Показать ${resultCount} ${pluralRu(resultCount, ...resultWords)}`;
}

function SheetBody({
  title,
  groups,
  values,
  onToggle,
  onReset,
  onApply,
  resultCount,
  resultWords,
  showGrip,
  showApply,
}: {
  title: string;
  groups: FilterGroupConfig[];
  values: FilterValues;
  onToggle: (groupId: string, value: string, mode: FilterSelectionMode) => void;
  onReset: () => void;
  onApply: () => void;
  resultCount: number | null;
  resultWords: readonly [string, string, string];
  showGrip: boolean;
  showApply: boolean;
}) {
  return (
    <>
      {showGrip ? (
        <div className="bg-line-strong mx-auto mt-2.5 mb-1.5 h-1 w-9 shrink-0 rounded-full" />
      ) : null}

      <div
        className={cn(
          "border-line flex shrink-0 items-center border-b px-[18px]",
          showGrip ? "pt-1.5 pb-3" : "py-4",
        )}
      >
        {showGrip ? (
          <Drawer.Title className="text-ink text-[18px] font-extrabold">{title}</Drawer.Title>
        ) : (
          <h3 className="text-ink text-[18px] font-extrabold">{title}</h3>
        )}
        {showGrip ? <Drawer.Description className="sr-only">{title}</Drawer.Description> : null}
        <button
          type="button"
          className="text-gold ml-auto text-[13px] font-bold"
          onClick={onReset}
        >
          Сбросить всё
        </button>
      </div>

      {/*
        Родитель обязан иметь definite height (h-full / h-[86vh]), иначе
        flex-1 + min-h-0 схлопывает тело до 0 при height:auto у шита.
      */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pt-1 pb-3"
        data-base-ui-swipe-ignore=""
      >
        {groups.map((group) => (
          <FilterGroup
            key={group.id}
            group={group}
            selected={values[group.id] ?? []}
            onToggle={(value, mode) => onToggle(group.id, value, mode)}
          />
        ))}
      </div>

      <div className="border-line-strong bg-surface flex shrink-0 gap-2.5 border-t px-[18px] pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          className={cn(
            "border-line-strong text-ink-2 h-[50px] rounded-md border px-[18px] text-[15px] font-extrabold",
            !showApply && "flex-1",
          )}
          onClick={onReset}
        >
          Сбросить
        </button>
        {showApply ? (
          <button
            type="button"
            className="bg-gold-grad text-ink-ongold shadow-sheen h-[50px] flex-1 rounded-md text-[15px] font-extrabold tabular-nums"
            onClick={onApply}
          >
            {applyLabel(resultCount, resultWords)}
          </button>
        ) : null}
      </div>
    </>
  );
}

export function FilterSheet({
  open,
  onOpenChange,
  title,
  groups,
  values,
  onChange,
  resultCount,
  resultWords,
  onApply,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  groups: FilterGroupConfig[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  resultCount: number | null;
  /** one / few / many — «серия / серии / серий» */
  resultWords: readonly [string, string, string];
  onApply: () => void;
  onReset: () => void;
}) {
  const isDesktop = useIsDesktop();
  const groupIds = groups.map((group) => group.id);

  const handleToggle = (groupId: string, value: string, mode: FilterSelectionMode) => {
    onChange(toggleValue(values, groupId, value, mode));
  };

  const handleReset = () => {
    onChange(clearValues(groupIds));
    onReset();
  };

  useEffect(() => {
    if (!open || !isDesktop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isDesktop, onOpenChange]);

  const bodyProps = {
    title,
    groups,
    values,
    onToggle: handleToggle,
    onReset: handleReset,
    onApply,
    resultCount,
    resultWords,
  };

  if (isDesktop) {
    if (!open || typeof document === "undefined") return null;
    // Portal в body: иначе backdrop-filter у TopBar становится containing block
    // для position:fixed и панель схлопывается до высоты шапки (~168px).
    return createPortal(
      <div className="fixed inset-0 z-50" data-testid="filter-panel-desktop">
        <button
          type="button"
          aria-label="Закрыть фильтры"
          className="bg-scrim absolute inset-0"
          onClick={() => onOpenChange(false)}
        />
        <aside
          role="dialog"
          aria-modal="false"
          aria-label={title}
          className={cn(
            "border-line-strong bg-surface absolute top-0 right-0 flex h-dvh w-[min(100%,400px)] flex-col border-l",
            "shadow-elevated",
          )}
        >
          <SheetBody {...bodyProps} showGrip={false} showApply={false} />
        </aside>
      </div>,
      document.body,
    );
  }

  // mobile: modal Drawer + definite height — flex-1/min-h-0 не схлопывается
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} modal>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-scrim fixed inset-0 z-50" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup
            className={cn(
              "border-line-strong bg-surface flex h-[86vh] w-full max-w-[420px] flex-col overflow-hidden",
              "rounded-t-[20px] border border-b-0 outline-none",
            )}
            data-testid="filter-sheet-mobile"
          >
            <Drawer.Content className="flex h-full min-h-0 flex-col">
              <SheetBody {...bodyProps} showGrip showApply />
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
