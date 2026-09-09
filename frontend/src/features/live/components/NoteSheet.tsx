import { Drawer } from "@base-ui/react/drawer";
import { useEffect, useState } from "react";

import { fromLocalParts, toDatetimeLocalParts } from "@/features/live/lib/datetimeLocal";

export function NoteSheet({
  open,
  onOpenChange,
  onSave,
  saveLabel = "Сохранить",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (text: string, occurredAt: string) => void;
  saveLabel?: string;
}) {
  const [text, setText] = useState("");
  const [time, setTime] = useState(() => toDatetimeLocalParts(new Date().toISOString()).time);

  useEffect(() => {
    if (open) {
      setText("");
      setTime(toDatetimeLocalParts(new Date().toISOString()).time);
    }
  }, [open]);

  const date = toDatetimeLocalParts(new Date().toISOString()).date;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Popup className="border-line-strong bg-surface fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92%] w-full max-w-[420px] rounded-t-[20px] border-t px-[18px] pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="bg-line-strong mx-auto mb-3 h-1 w-9 rounded-full" />
          <h2 className="text-lg font-extrabold">Заметка</h2>
          <p className="text-ink-2 num mb-3.5 text-[12.5px]">Сохранится с отметкой {time}</p>
          <textarea
            className="border-line-strong bg-surface-2 h-[120px] w-full resize-none rounded-md border px-3.5 py-3 text-base leading-snug"
            maxLength={500}
            placeholder="Что произошло за столом?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="text-ink-3 num mb-3 text-right text-[11.5px]">{text.length} / 500</div>
          <label className="mb-4 block">
            <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">
              Время события
            </span>
            <input
              type="time"
              className="border-line-strong bg-surface-2 num h-12 w-full rounded-md border px-3.5 text-base"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <div className="flex gap-2.5">
            <button
              type="button"
              className="border-line-strong text-ink-2 flex h-[46px] flex-1 items-center justify-center rounded-md border text-[14.5px] font-extrabold"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!text.trim()}
              className="bg-gold-grad text-ink-ongold flex h-[46px] flex-1 items-center justify-center rounded-md text-[14.5px] font-extrabold disabled:opacity-50"
              onClick={() => onSave(text.trim(), fromLocalParts(date, time))}
            >
              {saveLabel}
            </button>
          </div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
