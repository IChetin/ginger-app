import { useEffect, useMemo, useRef } from "react";

import type { ResultListItem } from "@/api/types/tracker";
import { currencySymbol, formatNumberRu, signPrefix } from "@/lib/money";
import { pluralRu } from "@/lib/plural";
import { parseIsoDateParts } from "@/lib/time";
import { cn } from "@/lib/utils";

const MONTHS = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
] as const;

function monthTitle(iso: string): string {
  const { year, month } = parseIsoDateParts(iso);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(/\s*г\.$/, "");
}

function money(value: string, currency: string, signed = false): string {
  const number = Number(value);
  const prefix = signed ? signPrefix(number) : "";
  return `${prefix}${formatNumberRu(Math.abs(number))} ${currencySymbol(currency)}`;
}

function entriesWord(value: number): string {
  return pluralRu(value, "вход", "входа", "входов");
}

function formatPlace(place: number, fieldSize: number | null): string {
  if (fieldSize != null && fieldSize > 0) {
    return `${place} / ${fieldSize}`;
  }
  return `${place} место`;
}

export function ResultsList({
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onEdit,
}: {
  items: ResultListItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onEdit: (item: ResultListItem) => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const map = new Map<string, ResultListItem[]>();
    for (const item of items) {
      const key = item.played_on.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [items]);

  useEffect(() => {
    if (!hasNextPage || !sentinel.current || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !isFetchingNextPage) onLoadMore();
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  if (items.length === 0) {
    return (
      <div className="text-ink-2 px-4 py-8 text-center text-[13px]">
        Результатов пока нет. Добавьте первый турнир.
      </div>
    );
  }

  return (
    <div className="pb-8" data-testid="results-list">
      {groups.map(([month, rows], groupIndex) => (
        <section key={month} className={cn("px-4 pt-5", groupIndex > 0 && "pt-2")}>
          <h2 className="text-ink-3 mb-2.5 text-[13px] font-bold tracking-[0.06em] uppercase">
            {monthTitle(month)}
          </h2>
          {rows.map((item) => {
            const { month: monthPart, day } = parseIsoDateParts(item.played_on);
            const profit = Number(item.profit_base);
            return (
              <button
                key={item.id}
                type="button"
                className="border-line bg-surface mb-2 flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left"
                onClick={() => onEdit(item)}
              >
                <span className="border-line-strong bg-surface-3 flex h-[46px] w-11 shrink-0 flex-col items-center justify-center rounded-[12px] border leading-[1.15]">
                  <span className="num text-ink text-[15px] font-extrabold">{day}</span>
                  <span className="text-ink-3 text-[9px] font-bold uppercase">
                    {MONTHS[monthPart - 1]}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-[14px] font-bold">{item.name}</span>
                  <span className="num text-ink-2 mt-px block truncate text-[12px]">
                    {item.series_text ? `${item.series_text} · ` : ""}
                    {money(item.buyin, item.currency_code)} × {item.entries_count}{" "}
                    {entriesWord(item.entries_count)}
                  </span>
                </span>
                <span
                  className={cn(
                    "num shrink-0 text-right text-[14px] font-extrabold",
                    profit > 0 ? "text-live" : profit < 0 ? "text-danger" : "text-ink",
                  )}
                >
                  {money(item.profit_base, item.base_currency, true)}
                  {Number(item.payout) > 0 && item.place != null ? (
                    <span className="text-gold ml-1.5 inline-block text-[10px] font-bold">
                      {formatPlace(item.place, item.field_size)}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </section>
      ))}
      <div ref={sentinel} className="h-1" />
      {isFetchingNextPage ? (
        <p className="text-ink-3 py-3 text-center text-[12px]">Загрузка…</p>
      ) : null}
      {hasNextPage && typeof IntersectionObserver === "undefined" ? (
        <button
          type="button"
          className="text-gold mx-auto mt-2 block text-[13px] font-bold"
          onClick={onLoadMore}
        >
          Показать ещё
        </button>
      ) : null}
    </div>
  );
}
