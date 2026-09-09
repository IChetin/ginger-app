import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { HandLinkTarget } from "@/api/types/hands";
import { useHandLinkTargets } from "@/features/hands/hooks";
import { cn } from "@/lib/utils";

export type HandLinkValue = {
  eventId: string | null;
  seriesId: string | null;
  liveSessionId: string | null;
};

const SECTION_LABEL: Record<HandLinkTarget["section"], string> = {
  live: "Активная сессия",
  today: "Сегодня",
  running: "Идущие серии",
  search: "Серии",
};

const SECTION_ORDER: HandLinkTarget["section"][] = ["live", "today", "running", "search"];

function targetKey(item: HandLinkTarget): string {
  if (item.kind === "live") return `live:${item.live_session_id}`;
  if (item.kind === "series") return `series:${item.series_id}`;
  return `event:${item.event_id}`;
}

function isSelected(item: HandLinkTarget, value: HandLinkValue): boolean {
  if (item.kind === "live") {
    return Boolean(value.liveSessionId) && item.live_session_id === value.liveSessionId;
  }
  if (item.kind === "series") {
    return !value.liveSessionId && !value.eventId && item.series_id === value.seriesId;
  }
  return !value.liveSessionId && item.event_id === value.eventId;
}

function toValue(item: HandLinkTarget | null): HandLinkValue {
  if (!item) return { eventId: null, seriesId: null, liveSessionId: null };
  if (item.kind === "live") {
    return {
      eventId: item.event_id,
      seriesId: null,
      liveSessionId: item.live_session_id,
    };
  }
  if (item.kind === "series") {
    return { eventId: null, seriesId: item.series_id, liveSessionId: null };
  }
  return { eventId: item.event_id, seriesId: null, liveSessionId: null };
}

export function HandLinkSelect({
  eventId,
  seriesId,
  liveSessionId,
  onChange,
  labeled = true,
}: {
  eventId: string | null;
  seriesId?: string | null;
  liveSessionId: string | null;
  onChange: (next: HandLinkValue) => void;
  labeled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const links = useHandLinkTargets(open ? q : undefined);
  const options = links.data ?? [];
  const value: HandLinkValue = {
    eventId,
    seriesId: seriesId ?? null,
    liveSessionId,
  };
  const selected = options.find((item) => isSelected(item, value));
  const fallback = liveSessionId || eventId ? "турнир" : seriesId ? "серия" : "Не привязывать";
  const currentLabel = selected?.label ?? fallback;
  const unbound = !eventId && !seriesId && !liveSessionId;

  const groups = useMemo(() => {
    return SECTION_ORDER.flatMap((section) => {
      const items = options.filter((item) => item.section === section);
      return items.length > 0 ? [{ section, items }] : [];
    });
  }, [options]);

  const pick = (next: HandLinkValue) => {
    onChange(next);
    setOpen(false);
    setQ("");
  };

  const trigger = (
    <button
      type="button"
      data-testid="hand-link-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      className="border-line-strong bg-surface-2 flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border px-3 text-left"
      onClick={() => setOpen(true)}
    >
      <span
        className="min-w-0 flex-1 truncate text-[13px] font-semibold"
        data-testid="hand-link-current"
      >
        {currentLabel}
      </span>
      <span className="text-ink-3 shrink-0 text-[12px]" aria-hidden="true">
        ▾
      </span>
    </button>
  );

  const picker =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-40 flex flex-col items-center justify-end"
            data-testid="hand-link-picker"
          >
            <button
              type="button"
              aria-label="Закрыть"
              className="absolute inset-0 bg-black/55"
              onClick={() => {
                setOpen(false);
                setQ("");
              }}
            />
            <section
              role="dialog"
              aria-label="Турнир"
              className="border-line-strong bg-surface relative flex max-h-[min(32rem,80%)] w-full max-w-[420px] flex-col overflow-hidden rounded-t-[20px] border-t px-3.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <div className="bg-line-strong mx-auto mb-2 h-1 w-9 rounded-full" />
              <h2 className="mb-2.5 text-[16px] font-extrabold">Турнир</h2>
              <input
                type="search"
                data-testid="hand-link-search"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Название турнира или серии"
                className="border-line-strong bg-surface-2 text-ink mb-2.5 h-11 w-full shrink-0 rounded-xl border px-3 text-[16px]"
              />
              <div className="min-h-0 flex-1 overflow-y-auto pb-1">
                {groups.map((group) => (
                  <div key={group.section} className="mb-2.5">
                    <p className="text-ink-3 mb-1 px-0.5 text-[10.5px] font-extrabold tracking-wide uppercase">
                      {SECTION_LABEL[group.section]}
                    </p>
                    {group.items.map((item) => (
                      <button
                        key={targetKey(item)}
                        type="button"
                        data-testid={`hand-link-${targetKey(item)}`}
                        className={cn(
                          "border-line-strong bg-surface-2 mb-1 h-10 w-full truncate rounded-xl border px-3 text-left text-[13px] font-semibold",
                          isSelected(item, value) && "border-line-gold bg-gold-soft text-gold",
                        )}
                        onClick={() => pick(toValue(item))}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
                <button
                  type="button"
                  data-testid="hand-link-none"
                  className={cn(
                    "border-line-strong bg-surface-2 mb-1 h-10 w-full rounded-xl border px-3 text-left text-[13px] font-semibold",
                    unbound && "border-line-gold bg-gold-soft text-gold",
                  )}
                  onClick={() => pick({ eventId: null, seriesId: null, liveSessionId: null })}
                >
                  Не привязывать
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )
      : null;

  const field = (
    <div data-testid="hand-link-select" className="min-w-0">
      {trigger}
      {picker}
    </div>
  );

  if (!labeled) return field;

  return (
    <div>
      <span className="text-ink-3 mb-1.5 block text-[10.5px] font-extrabold tracking-[0.06em] uppercase">
        Турнир
      </span>
      {field}
    </div>
  );
}
