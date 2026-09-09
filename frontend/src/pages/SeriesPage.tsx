import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useSeries } from "@/api/series";
import type { EventSummary } from "@/api/types/schedule";
import { StaffEditLink } from "@/components/admin/StaffEditLink";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { CopyToast } from "@/components/ui/CopyToast";
import { useCopyToast } from "@/components/ui/useCopyToast";
import { BookmarkButton } from "@/components/series/BookmarkButton";
import { DayStrip } from "@/components/series/DayStrip";
import { EventRow, type FlightRowModel } from "@/components/series/EventRow";
import { SeriesHero } from "@/components/series/SeriesHero";
import { SeriesInfo } from "@/components/series/SeriesInfo";
import { isSeriesOver, PAST_SERIES_HINT } from "@/components/series/seriesDisplay";
import { tournamentsWord } from "@/lib/plural";
import { seriesPath } from "@/lib/paths";
import { shareOrCopyUrl } from "@/lib/share";
import { defaultSeriesDay, eachIsoDate, formatDayListTitle, venueLocalDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const iconClass =
  "h-5 w-5 stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

const headerBtnClass =
  "bg-surface-2 text-ink-2 inline-flex h-[38px] min-h-11 w-[38px] min-w-11 shrink-0 items-center justify-center rounded-md";

function flattenDayRows(events: EventSummary[], day: string): FlightRowModel[] {
  const rows: FlightRowModel[] = [];
  for (const event of events) {
    for (const flight of event.flights) {
      const flightDay = venueLocalDate(flight.start_at.utc, flight.start_at.venue_timezone);
      if (flightDay === day) {
        rows.push({ event, flight, day });
      }
    }
  }
  rows.sort((a, b) => a.flight.start_at.utc.localeCompare(b.flight.start_at.utc));
  return rows;
}

function SeriesSkeleton() {
  return (
    <div data-testid="series-skeleton">
      <div className="bg-surface-2 h-[52px]" />
      <div className="bg-surface-2 h-[210px]" />
      <div className="space-y-3 px-4 pt-4">
        <div className="bg-surface-2 h-6 w-40 rounded-full" />
        <div className="bg-surface-2 h-8 w-2/3 rounded-sm" />
        <div className="bg-surface-2 h-4 w-3/4 rounded-sm" />
        <div className="bg-surface h-16 rounded-md" />
      </div>
      <div className="mt-5 space-y-2.5 px-4">
        <div className="bg-surface h-[76px] rounded-md" />
        <div className="bg-surface h-[76px] rounded-md" />
        <div className="bg-surface h-[76px] rounded-md" />
      </div>
    </div>
  );
}

export function SeriesPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useSeries(seriesId);
  const { message: toast, showCopied } = useCopyToast();

  const series = query.data;
  const dayParam = searchParams.get("day");

  const rangeDays = useMemo(
    () => (series ? eachIsoDate(series.starts_on, series.ends_on) : []),
    [series],
  );

  const resolvedDay = useMemo(() => {
    if (!series) {
      return null;
    }
    if (dayParam && rangeDays.includes(dayParam)) {
      return dayParam;
    }
    return defaultSeriesDay(series.starts_on, series.ends_on, series.status, series.venue.timezone);
  }, [series, dayParam, rangeDays]);

  useEffect(() => {
    if (!series || !seriesId || series.slug === seriesId) {
      return;
    }
    const canonical = seriesPath(series, { day: searchParams.get("day") });
    navigate(canonical, { replace: true });
  }, [series, seriesId, searchParams, navigate]);

  useEffect(() => {
    if (!series || !resolvedDay) {
      return;
    }
    if (dayParam === resolvedDay) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set("day", resolvedDay);
    setSearchParams(next, { replace: true });
  }, [series, resolvedDay, dayParam, searchParams, setSearchParams]);

  const dayEvents = useMemo(() => {
    if (!series || !resolvedDay) {
      return [];
    }
    const group = series.events_by_day.find((item) => item.date === resolvedDay);
    return group?.events ?? [];
  }, [series, resolvedDay]);

  const rows = useMemo(
    () => (resolvedDay ? flattenDayRows(dayEvents, resolvedDay) : []),
    [dayEvents, resolvedDay],
  );

  const uniqueEventCount = useMemo(() => new Set(rows.map((row) => row.event.id)).size, [rows]);

  if (!seriesId) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-semibold">Не указан идентификатор серии</p>
        <Link to="/" className="text-gold mt-4 inline-flex">
          На главную
        </Link>
      </div>
    );
  }

  if (query.isLoading) {
    return <SeriesSkeleton />;
  }

  if (query.isError) {
    const is404 = query.error instanceof ApiError && query.error.status === 404;
    if (is404) {
      return (
        <div className="px-4 py-16 text-center" data-testid="series-not-found">
          <p className="text-lg font-extrabold">Серия не найдена</p>
          <p className="text-ink-2 mt-2 text-sm">Возможно, она ещё не опубликована</p>
          <Link
            to="/"
            className="bg-gold-grad text-ink-ongold mt-5 inline-flex h-11 min-h-11 items-center justify-center rounded-full px-5 text-[13px] font-bold"
          >
            На главную
          </Link>
        </div>
      );
    }
    return (
      <div
        className="border-line bg-surface mx-4 mt-8 rounded-lg border px-4 py-8 text-center"
        data-testid="series-error"
      >
        <p className="font-semibold">Не удалось загрузить серию</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className={cn(
            "mt-4 inline-flex h-11 min-h-11 items-center justify-center rounded-full px-5",
            "bg-gold-soft text-gold text-[13px] font-bold",
          )}
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!series || !resolvedDay) {
    return null;
  }

  const day = searchParams.get("day");
  const adminSeriesPath = day
    ? `/admin/series/${series.id}?day=${encodeURIComponent(day)}`
    : `/admin/series/${series.id}`;

  const bookmarkBtn = (
    <BookmarkButton
      targetType="series"
      targetId={series.id}
      className="bg-surface-2 backdrop-blur-none"
      disabledReason={isSeriesOver(series) ? PAST_SERIES_HINT : undefined}
    />
  );

  return (
    <div data-testid="series-page">
      <StickyHeader
        title={series.name}
        titleInExpanded={false}
        actions={
          <>
            <StaffEditLink to={adminSeriesPath} className={headerBtnClass} />
            <button
              type="button"
              aria-label="Поделиться"
              className={headerBtnClass}
              onClick={() => {
                void shareOrCopyUrl({
                  title: series.name,
                  url: window.location.href,
                  text: `${series.name} · Day2`,
                }).then((outcome) => {
                  if (outcome === "copied") showCopied();
                });
              }}
            >
              <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12M12 3l-4 4M12 3l4 4" />
                <path d="M5 13v6h14v-6" />
              </svg>
            </button>
            {bookmarkBtn}
          </>
        }
        compactActions={bookmarkBtn}
      />
      <SeriesHero series={series} />
      <SeriesInfo series={series} />
      <DayStrip
        startsOn={series.starts_on}
        endsOn={series.ends_on}
        activeDay={resolvedDay}
        venueTimezone={series.venue.timezone}
        onSelect={(nextDay) => {
          const next = new URLSearchParams(searchParams);
          next.set("day", nextDay);
          setSearchParams(next, { replace: true });
        }}
      />

      <div className="flex flex-col gap-2.5 px-4 py-4">
        <div className="mb-0.5 flex items-baseline justify-between">
          <h2 className="text-[17px] font-extrabold">{formatDayListTitle(resolvedDay)}</h2>
          <span className="num text-ink-3 text-xs">
            {uniqueEventCount} {tournamentsWord(uniqueEventCount)}
          </span>
        </div>

        {rows.length === 0 ? (
          <div
            className="border-line-strong bg-surface rounded-md border border-dashed px-4 py-10 text-center"
            data-testid="empty-day"
          >
            <p className="font-bold">В этот день турниров нет</p>
            <p className="text-ink-2 mt-1 text-sm">Выберите другой день в ленте выше</p>
          </div>
        ) : (
          rows.map((row) => <EventRow key={row.flight.id} row={row} seriesSlug={series.slug} />)
        )}
      </div>
      <CopyToast message={toast} />
    </div>
  );
}
