import type { LiveEventRead } from "@/api/types/live";
import { entryOrdinal, runningInvestedById } from "@/features/live/lib/calc";
import { timeLabel } from "@/features/live/lib/datetimeLocal";
import { formatMoney } from "@/features/schedule/lib/format";
import { cn } from "@/lib/utils";

export function EventTimeline({
  events,
  currencySymbol,
  onEdit,
}: {
  events: LiveEventRead[];
  currencySymbol: string;
  onEdit: (eventId: string) => void;
}) {
  const sorted = events.slice().sort((a, b) => {
    const ta = new Date(a.occurred_at).getTime();
    const tb = new Date(b.occurred_at).getTime();
    if (ta !== tb) return tb - ta;
    return b.created_at.localeCompare(a.created_at);
  });
  const running = runningInvestedById(events);

  return (
    <div>
      <h3 className="text-ink-3 mb-2 text-[13px] font-bold tracking-[0.06em] uppercase">События</h3>
      {sorted.length === 0 ? (
        <p className="text-ink-3 text-[13px]">Пока нет событий</p>
      ) : null}
      {sorted.map((ev) => {
        const ordinal = entryOrdinal(events, ev.id);
        return (
          <div
            key={ev.id}
            className="border-line flex items-start gap-2.5 border-b py-2.5 last:border-b-0"
          >
            <span className="text-ink-3 num min-w-[38px] pt-0.5 text-xs font-extrabold">
              {timeLabel(ev.occurred_at)}
            </span>
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]",
                ev.type === "entry" && "bg-gold-soft text-gold",
                ev.type === "reentry" && "bg-warn-soft text-warn",
                ev.type === "note" && "bg-surface-3 text-ink-2",
              )}
            >
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24">
                {ev.type === "entry" ? (
                  <path
                    d="M5 13l4 4L19 7"
                    className="fill-none stroke-current [stroke-width:1.8]"
                  />
                ) : ev.type === "reentry" ? (
                  <path
                    d="M12 5v14M5 12h14"
                    className="fill-none stroke-current [stroke-width:1.8]"
                  />
                ) : (
                  <path
                    d="M4 20h4L19 9l-4-4L4 16v4z"
                    className="fill-none stroke-current [stroke-width:1.8]"
                  />
                )}
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              {ev.type === "note" ? (
                <div className="text-ink-2 text-[12.5px] whitespace-pre-wrap">{ev.text}</div>
              ) : (
                <>
                  <div className="text-sm font-bold">
                    {ev.type === "entry" ? "Вход в турнир" : `Ре-энтри · ${ordinal}-й вход`}
                  </div>
                  <div className="text-ink-3 num mt-0.5 text-[11.5px]">
                    {ev.type === "entry"
                      ? formatMoney(ev.amount ?? "0", currencySymbol)
                      : `+${formatMoney(ev.amount ?? "0", currencySymbol)} · всего ${formatMoney(String(running.get(ev.id) ?? 0), currencySymbol)}`}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              aria-label="Изменить"
              className="text-ink-3 p-1"
              onClick={() => onEdit(ev.id)}
            >
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24">
                <path
                  d="M4 20h4L19 9l-4-4L4 16v4z"
                  className="fill-none stroke-current [stroke-width:1.8]"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
