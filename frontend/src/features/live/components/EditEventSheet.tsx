import { Drawer } from "@base-ui/react/drawer";
import { useEffect, useState } from "react";

import type { LiveEventRead } from "@/api/types/live";
import { LadderNumberStepper } from "@/components/ui/NumberStepper";
import { entriesCount, entryOrdinal, investedTotal } from "@/features/live/lib/calc";
import { fromLocalParts, toDatetimeLocalParts } from "@/features/live/lib/datetimeLocal";
import { formatMoney } from "@/features/schedule/lib/format";

export function EditEventSheet({
  open,
  event,
  events,
  currencySymbol,
  onOpenChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  event: LiveEventRead | null;
  events: LiveEventRead[];
  currencySymbol: string;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: { amount?: string; occurred_at?: string; text?: string }) => void;
  onDelete: () => void;
}) {
  const parts = event ? toDatetimeLocalParts(event.occurred_at) : { date: "", time: "" };
  const [amount, setAmount] = useState(event?.amount ?? "");
  const [text, setText] = useState(event?.text ?? "");
  const [date, setDate] = useState(parts.date);
  const [time, setTime] = useState(parts.time);

  useEffect(() => {
    if (event) {
      const p = toDatetimeLocalParts(event.occurred_at);
      setAmount(event.amount ?? "");
      setText(event.text ?? "");
      setDate(p.date);
      setTime(p.time);
    }
  }, [event]);

  if (!event) return null;

  const isNote = event.type === "note";
  const isLastEntry =
    event.type === "entry" && events.filter((e) => e.type === "entry").length <= 1;

  const previewInvested = isNote
    ? investedTotal(events)
    : investedTotal(events.map((e) => (e.id === event.id ? { ...e, amount: amount || "0" } : e)));

  const title =
    event.type === "entry"
      ? "Вход в турнир"
      : event.type === "reentry"
        ? `Ре-энтри · ${entryOrdinal(events, event.id)}-й вход`
        : "Заметка";

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Popup className="border-line-strong bg-surface fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92%] w-full max-w-[420px] rounded-t-[20px] border-t px-[18px] pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="bg-line-strong mx-auto mb-3 h-1 w-9 rounded-full" />
          <h2 className="text-lg font-extrabold">{title}</h2>
          <p className="text-ink-2 mb-3.5 text-[12.5px]">Можно поправить, если отметили не сразу</p>
          {isNote ? (
            <textarea
              className="border-line-strong bg-surface-2 mb-3 h-[120px] w-full resize-none rounded-md border px-3.5 py-3 text-base"
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          ) : (
            <div className="mb-3 flex gap-2.5">
              <div className="min-w-0 flex-1">
                <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">
                  Сумма входа
                </span>
                <LadderNumberStepper
                  aria-label="Сумма входа"
                  min={0}
                  value={amount}
                  frameClassName="border-line-strong bg-surface-2 num h-12 w-full min-w-0 rounded-md border"
                  className="text-base"
                  onChange={setAmount}
                />
              </div>
              <label className="w-[112px]">
                <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Время</span>
                <input
                  type="time"
                  className="border-line-strong bg-surface-2 num h-12 w-full rounded-md border px-3.5 text-base"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
          )}
          <label className="mb-3 block">
            <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Дата</span>
            <input
              type="date"
              className="border-line-strong bg-surface-2 num h-12 w-full rounded-md border px-3.5 text-base"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {isNote ? (
            <label className="mb-3 block">
              <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Время</span>
              <input
                type="time"
                className="border-line-strong bg-surface-2 num h-12 w-full rounded-md border px-3.5 text-base"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          ) : (
            <div className="border-line bg-surface-2 text-ink-2 mb-3.5 rounded-md border px-3.5 py-2.5 text-[12.5px]">
              После правки вложено в турнир:{" "}
              <b className="text-ink num font-bold">
                {formatMoney(String(previewInvested), currencySymbol)}
              </b>{" "}
              · {entriesCount(events)} входа
            </div>
          )}
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={isLastEntry}
              className="text-danger border-danger/40 flex h-[46px] flex-1 items-center justify-center rounded-md border text-[14.5px] font-extrabold disabled:opacity-40"
              onClick={onDelete}
            >
              Удалить
            </button>
            <button
              type="button"
              className="bg-gold-grad text-ink-ongold flex h-[46px] flex-1 items-center justify-center rounded-md text-[14.5px] font-extrabold"
              onClick={() =>
                onSave({
                  amount: isNote ? undefined : amount,
                  text: isNote ? text : undefined,
                  occurred_at: fromLocalParts(date, time),
                })
              }
            >
              Сохранить
            </button>
          </div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
