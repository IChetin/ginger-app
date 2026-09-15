import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { Tournament } from "@/api/types/tournaments";
import { AppIcon } from "@/features/tournaments/components/TournamentCard";
import { formatMoney, formatStartShort } from "@/features/tournaments/lib/format";
import { fetchLiveEvents } from "@/features/tournaments/liveApi";
import { cn } from "@/lib/utils";

function stepLabel(item: Tournament): string {
  const base = item.live_step ? `Шаг ${item.live_step}` : "Турнир серии";
  return item.notes && item.live_step ? `${base} · ${item.notes}` : base;
}

/**
 * Путь в живые серии (он-офф турниры X-Poker): STEP-сателлиты и сам турнир серии. Отдельно
 * от онлайн-расписания и свёрнуто по умолчанию, чтобы не отодвигать список турниров вниз.
 */
export function LiveEvents({ onSelect }: { onSelect: (tournament: Tournament) => void }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["tournaments", "live"],
    queryFn: ({ signal }) => fetchLiveEvents(signal),
    staleTime: 60_000,
  });
  const events = query.data ?? [];
  if (events.length === 0) return null;

  return (
    <section className="px-3 pt-2.5" data-testid="live-events">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="border-line bg-surface flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left"
      >
        <span className="bg-danger rounded-[4px] px-1 text-[10px] font-extrabold tracking-[0.06em] text-white">
          LIVE
        </span>
        <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-bold">
          Путь в живые серии
        </span>
        <span className="text-ink-3 num text-[12px] font-semibold">{events.length}</span>
        <span
          aria-hidden="true"
          className={cn("text-ink-3 text-[12px] transition-transform", open && "rotate-90")}
        >
          ›
        </span>
      </button>
      {open ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {events.map((event) => (
            <div
              key={`${event.club.id}-${event.title}`}
              className="border-line bg-surface rounded-md border"
            >
              <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
                <AppIcon app={event.club.app} className="h-4 w-4 shrink-0" />
                <span className="font-display text-ink min-w-0 flex-1 truncate text-[14px] font-bold">
                  {event.title}
                </span>
                {event.dates ? (
                  <span className="text-ink-2 shrink-0 text-[11.5px]">{event.dates}</span>
                ) : null}
              </div>
              <ul>
                {event.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className="border-line hover:bg-surface-2 flex w-full items-center gap-2 border-t px-3 py-1.5 text-left text-[12px]"
                    >
                      <span className="num text-ink-2 w-[92px] shrink-0">
                        {formatStartShort(item.starts_at)}
                      </span>
                      <span className="text-ink min-w-0 flex-1 truncate font-semibold">
                        {stepLabel(item)}
                      </span>
                      <span className="num text-ink shrink-0 font-bold">
                        {formatMoney(item.buyin, item.club)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
