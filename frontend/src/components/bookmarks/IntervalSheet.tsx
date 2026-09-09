import { Drawer } from "@base-ui/react/drawer";
import { useEffect, useState } from "react";

import { ReminderOffsetChips } from "@/components/bookmarks/ReminderOffsetChips";
import type { ReminderPresetOffset } from "@/features/bookmarks/lib/reminderPresets";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  offsets: number[];
  isSubmitting?: boolean;
  onSave: (offsets: number[]) => void | Promise<void>;
};

export function IntervalSheet({
  open,
  onOpenChange,
  title = "Интервалы напоминаний",
  offsets,
  isSubmitting = false,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(offsets);

  useEffect(() => {
    if (open) {
      setDraft(offsets);
    }
  }, [open, offsets]);

  const toggle = (offset: ReminderPresetOffset) => {
    const has = draft.includes(offset);
    if (has && draft.length === 1) {
      return;
    }
    setDraft(
      has ? draft.filter((value) => value !== offset) : [...draft, offset].sort((a, b) => a - b),
    );
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-scrim fixed inset-0 z-50 backdrop-blur-[2px]" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup
            className={cn(
              "border-line bg-surface shadow-elevated w-full max-w-[420px] rounded-t-[18px] border p-4 pb-6 outline-none",
              "data-open:animate-in data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:slide-out-to-bottom-4",
            )}
            data-testid="interval-sheet"
          >
            <div className="bg-line-strong mx-auto mb-3 h-1 w-10 rounded-full" />
            <Drawer.Title className="text-ink text-[17px] font-extrabold">{title}</Drawer.Title>
            <Drawer.Description className="text-ink-2 mt-1 text-[13px]">
              Выберите хотя бы один интервал до старта флайта.
            </Drawer.Description>

            <ReminderOffsetChips
              className="mt-4"
              offsets={draft}
              disabled={isSubmitting}
              onToggle={toggle}
            />

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="border-line-strong bg-surface-2 text-ink-2 inline-flex h-11 flex-1 items-center justify-center rounded-md border text-[14px] font-bold"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Отмена
              </button>
              <button
                type="button"
                className="bg-gold-grad text-ink-ongold inline-flex h-11 flex-1 items-center justify-center rounded-md text-[14px] font-extrabold disabled:opacity-60"
                disabled={isSubmitting || draft.length === 0}
                onClick={() => {
                  void onSave(draft);
                }}
              >
                Сохранить
              </button>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
