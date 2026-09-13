import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { SearchEventItem, SearchSeriesItem, SearchVenueItem } from "@/api/types/search";
import { StickyHeader } from "@/components/layout/StickyHeader";
import {
  useClearRecentSearches,
  useDebouncedValue,
  useDeleteRecentSearch,
  usePushRecentSearch,
  useRecentSearches,
  useSearchQuery,
} from "@/features/search/hooks";
import { highlightMatch, POPULAR_SEARCHES } from "@/features/search/lib/highlight";
import { formatDateRange, formatMoney } from "@/features/schedule/lib/format";
import { currencySymbol } from "@/lib/money";
import { eventPath, seriesPath } from "@/lib/paths";

const GROUP_LIMIT = 5;

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconClear({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconPin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const parts = highlightMatch(text, query);
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          <mark key={index} className="bg-gold-soft text-gold rounded-[3px] px-0.5">
            {part.mark}
          </mark>
        ),
      )}
    </>
  );
}

function seriesBadge(status: SearchSeriesItem["status"]) {
  if (status === "running") {
    return (
      <span className="bg-live-soft text-live inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Идёт
      </span>
    );
  }
  if (status === "finished" || status === "cancelled") {
    return (
      <span className="bg-surface-3 text-ink-3 inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold">
        Завершена
      </span>
    );
  }
  if (status === "schedule_published") {
    return (
      <span className="bg-gold-soft text-gold inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold">
        Скоро
      </span>
    );
  }
  return (
    <span className="bg-surface-3 text-ink-3 inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold">
      Анонс
    </span>
  );
}

function eventBadge(item: SearchEventItem): string | null {
  if (!item.nearest_start_at) {
    return null;
  }
  const start = new Date(item.nearest_start_at.utc);
  const now = new Date();
  if (start.getTime() < now.getTime()) {
    return null;
  }
  const localDay = item.nearest_start_at.venue_local.slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  if (localDay === tomorrowIso) {
    return "завтра";
  }
  return null;
}

function formatEventTime(item: SearchEventItem): string {
  if (!item.nearest_start_at) {
    return "";
  }
  const local = item.nearest_start_at.venue_local;
  const date = local.slice(0, 10);
  const time = local.slice(11, 16);
  const [, m, d] = date.split("-").map(Number);
  const months = [
    "янв",
    "фев",
    "мар",
    "апр",
    "май",
    "июн",
    "июл",
    "авг",
    "сен",
    "окт",
    "ноя",
    "дек",
  ];
  return `${d} ${months[(m ?? 1) - 1]}, ${time}`;
}

function SkeletonRows() {
  return (
    <div className="space-y-1 px-4 pt-4" data-testid="search-skeleton">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 py-2.5">
          <div className="bg-surface-3 h-[42px] w-[42px] animate-pulse rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="bg-surface-3 h-3.5 w-2/3 animate-pulse rounded" />
            <div className="bg-surface-3 h-3 w-1/2 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultRow({
  to,
  icon,
  title,
  subtitle,
  badge,
  query,
  onSelect,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  query: string;
  onSelect?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onSelect}
      className="hover:bg-surface-2 flex items-center gap-3 px-4 py-[11px]"
      data-testid="search-result"
    >
      <div className="border-line-strong bg-surface-3 text-gold flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border text-[12px] font-extrabold">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold">
          <HighlightedText text={title} query={query} />
        </div>
        <div className="text-ink-3 mt-px truncate text-[12.5px]">
          <HighlightedText text={subtitle} query={query} />
        </div>
      </div>
      {badge}
    </Link>
  );
}

function countryFlag(code: string): string {
  if (code.length !== 2) {
    return "";
  }
  const base = 127397;
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => base + c.charCodeAt(0)));
}

export function SearchPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [seriesLimit, setSeriesLimit] = useState(GROUP_LIMIT);
  const [venuesLimit, setVenuesLimit] = useState(GROUP_LIMIT);
  const [eventsLimit, setEventsLimit] = useState(GROUP_LIMIT);
  const debounced = useDebouncedValue(input, 300);
  const query = debounced.trim();

  const search = useSearchQuery(
    {
      q: query,
      series_limit: seriesLimit,
      venues_limit: venuesLimit,
      events_limit: eventsLimit,
    },
    { enabled: query.length >= 2 },
  );
  const recent = useRecentSearches();
  const pushRecent = usePushRecentSearch();
  const deleteRecent = useDeleteRecentSearch();
  const clearRecent = useClearRecentSearches();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSeriesLimit(GROUP_LIMIT);
    setVenuesLimit(GROUP_LIMIT);
    setEventsLimit(GROUP_LIMIT);
  }, [query]);

  const isIdle = input.trim().length === 0;
  const isTypingShort = input.trim().length === 1;
  const showLoading = query.length >= 2 && (search.isFetching || search.isLoading);
  const data = search.data;

  const emptyResults = useMemo(() => {
    if (!data) {
      return false;
    }
    return data.series.total === 0 && data.venues.total === 0 && data.events.total === 0;
  }, [data]);

  /** History only on explicit completion (Enter or result tap) — never on debounce. */
  const commitRecent = (value: string) => {
    void pushRecent.mutateAsync(value);
  };

  const applyChip = (value: string) => {
    setInput(value);
    inputRef.current?.focus();
  };

  return (
    <div className="bg-bg flex min-h-screen flex-col" data-testid="search-page">
      <StickyHeader
        compactible={false}
        showBack={false}
        actions={
          <button
            type="button"
            className="text-gold shrink-0 text-[14px] font-bold"
            onClick={() => navigate(-1)}
          >
            Отмена
          </button>
        }
      >
        <div className="border-gold bg-surface text-ink-3 flex h-11 items-center gap-2.5 rounded-full border px-3.5">
          <IconSearch className="h-[18px] w-[18px] fill-none stroke-current [stroke-width:1.8]" />
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitRecent(input);
                inputRef.current?.blur();
              }
            }}
            placeholder="Серия, город, турнир…"
            className="text-ink placeholder:text-ink-3 w-full bg-transparent text-[16px] outline-none"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-testid="search-input"
          />
          {input ? (
            <button
              type="button"
              className="bg-surface-3 text-ink-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              aria-label="Очистить"
              onClick={() => {
                setInput("");
                inputRef.current?.focus();
              }}
            >
              <IconClear className="h-[11px] w-[11px] fill-none stroke-current [stroke-width:1.8]" />
            </button>
          ) : null}
        </div>
      </StickyHeader>

      <div className="flex-1 overflow-y-auto pb-4">
        {isIdle || isTypingShort ? (
          <>
            {(recent.data?.length ?? 0) > 0 ? (
              <>
                <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
                  <div className="text-ink-3 text-[12px] font-bold tracking-[0.06em] uppercase">
                    Недавние запросы
                  </div>
                  <button
                    type="button"
                    className="text-gold shrink-0 text-[12px] font-bold"
                    onClick={() => clearRecent.mutate()}
                    data-testid="clear-recent-searches"
                  >
                    Очистить
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 px-4 pb-2">
                  {recent.data?.map((item) => (
                    <button
                      key={item.query}
                      type="button"
                      className="border-line-strong bg-surface text-ink-2 inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold"
                      onClick={() => applyChip(item.query)}
                    >
                      {item.query}
                      <span
                        role="button"
                        tabIndex={0}
                        className="text-ink-3"
                        aria-label={`Удалить «${item.query}»`}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteRecent.mutate(item.query);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.stopPropagation();
                            deleteRecent.mutate(item.query);
                          }
                        }}
                      >
                        <IconClear className="h-3 w-3 fill-none stroke-current [stroke-width:1.8]" />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <div className="text-ink-3 px-4 pt-4 pb-2 text-[12px] font-bold tracking-[0.06em] uppercase">
              Популярное
            </div>
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {POPULAR_SEARCHES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="border-line-strong bg-surface text-ink-2 inline-flex h-[34px] items-center rounded-full border px-3.5 text-[13px] font-semibold"
                  onClick={() => applyChip(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {query.length >= 2 && showLoading && !data ? <SkeletonRows /> : null}

        {query.length >= 2 && data && emptyResults ? (
          <div className="flex flex-col items-center gap-2.5 px-[30px] py-12 text-center">
            <div className="bg-gold-soft text-gold flex h-[52px] w-[52px] -rotate-[4deg] items-center justify-center rounded-2xl">
              <IconSearch className="h-6 w-6 fill-none stroke-current [stroke-width:1.8]" />
            </div>
            <div className="text-[16px] font-bold">Ничего не нашлось</div>
            <div className="text-ink-2 text-[13.5px]">
              Проверьте написание или попробуйте название серии, город или организатора
            </div>
          </div>
        ) : null}

        {query.length >= 2 && data && !emptyResults ? (
          <>
            {data.series.items.length > 0 ? (
              <section>
                <div className="text-ink-3 flex items-center gap-2 px-4 pt-4 pb-2 text-[12px] font-bold tracking-[0.06em] uppercase">
                  Серии{" "}
                  <span className="font-semibold tracking-normal normal-case">
                    · {data.series.total}
                  </span>
                </div>
                {data.series.items.map((item) => (
                  <SeriesResult
                    key={item.id}
                    item={item}
                    query={query}
                    onSelect={() => commitRecent(input)}
                  />
                ))}
                {data.series.has_more ? (
                  <button
                    type="button"
                    className="text-gold w-full py-2.5 text-center text-[13px] font-bold"
                    onClick={() => setSeriesLimit((value) => value + 10)}
                  >
                    Показать ещё {data.series.total - data.series.items.length} серий
                  </button>
                ) : null}
              </section>
            ) : null}

            {data.venues.items.length > 0 ? (
              <section>
                <div className="text-ink-3 flex items-center gap-2 px-4 pt-4 pb-2 text-[12px] font-bold tracking-[0.06em] uppercase">
                  Площадки{" "}
                  <span className="font-semibold tracking-normal normal-case">
                    · {data.venues.total}
                  </span>
                </div>
                {data.venues.items.map((item) => (
                  <VenueResult
                    key={item.id}
                    item={item}
                    query={query}
                    onSelect={() => commitRecent(input)}
                  />
                ))}
                {data.venues.has_more ? (
                  <button
                    type="button"
                    className="text-gold w-full py-2.5 text-center text-[13px] font-bold"
                    onClick={() => setVenuesLimit((value) => value + 10)}
                  >
                    Показать ещё {data.venues.total - data.venues.items.length} площадок
                  </button>
                ) : null}
              </section>
            ) : null}

            {data.events.items.length > 0 ? (
              <section>
                <div className="text-ink-3 flex items-center gap-2 px-4 pt-4 pb-2 text-[12px] font-bold tracking-[0.06em] uppercase">
                  Турниры{" "}
                  <span className="font-semibold tracking-normal normal-case">
                    · {data.events.total}
                  </span>
                </div>
                {data.events.items.map((item) => (
                  <EventResult
                    key={item.id}
                    item={item}
                    query={query}
                    onSelect={() => commitRecent(input)}
                  />
                ))}
                {data.events.has_more ? (
                  <button
                    type="button"
                    className="text-gold w-full py-2.5 text-center text-[13px] font-bold"
                    onClick={() => setEventsLimit((value) => value + 10)}
                  >
                    Показать ещё {data.events.total - data.events.items.length} турниров
                  </button>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function SeriesResult({
  item,
  query,
  onSelect,
}: {
  item: SearchSeriesItem;
  query: string;
  onSelect?: () => void;
}) {
  const subtitle = [
    formatDateRange(item.starts_on, item.ends_on),
    item.venue_name,
    item.events_count > 0 ? `${item.events_count} турниров` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const initials = item.organizer_slug.slice(0, 3).toUpperCase();
  return (
    <ResultRow
      to={seriesPath(item)}
      icon={initials}
      title={item.name}
      subtitle={subtitle}
      badge={seriesBadge(item.status)}
      query={query}
      onSelect={onSelect}
    />
  );
}

function VenueResult({
  item,
  query,
  onSelect,
}: {
  item: SearchVenueItem;
  query: string;
  onSelect?: () => void;
}) {
  const subtitle = [
    `${countryFlag(item.country_code)} ${item.city}`.trim(),
    item.zone ? `зона «${item.zone}»` : null,
    item.series_count > 0 ? `${item.series_count} серий` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ResultRow
      to={`/?venues=${item.id}`}
      icon={<IconPin className="h-[18px] w-[18px] fill-none stroke-current [stroke-width:1.8]" />}
      title={item.name}
      subtitle={subtitle}
      query={query}
      onSelect={onSelect}
    />
  );
}

function EventResult({
  item,
  query,
  onSelect,
}: {
  item: SearchEventItem;
  query: string;
  onSelect?: () => void;
}) {
  const badge = eventBadge(item);
  const subtitle = [
    item.series_name,
    formatEventTime(item),
    formatMoney(item.buyin, currencySymbol(item.currency_code)),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ResultRow
      to={eventPath(item, { slug: item.series_slug })}
      icon={<span className="num">{item.number != null ? `#${item.number}` : "·"}</span>}
      title={item.name}
      subtitle={subtitle}
      badge={
        badge ? (
          <span className="bg-gold-soft text-gold inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold">
            {badge}
          </span>
        ) : null
      }
      query={query}
      onSelect={onSelect}
    />
  );
}
