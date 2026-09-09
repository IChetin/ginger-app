import type { Ref } from "react";
import { Link } from "react-router-dom";

import type { CalendarSeriesItem } from "@/api/types/schedule";
import {
  formatCalendarRangeChip,
  formatOverlapRange,
  monthSeriesSectionTitle,
  seriesMetaLine,
  statusBadgeVariant,
} from "@/components/calendar/calendarDisplay";
import {
  countdownLabel,
  isSeriesOver,
  pickDisplayMinBuyin,
} from "@/components/series/seriesDisplay";
import { StatusBadge } from "@/components/series/StatusBadge";
import { formatMoney } from "@/features/schedule/lib/format";
import { seriesPath } from "@/lib/paths";
import { daysUntil, pluralRu, tournamentsWord } from "@/lib/plural";
import { formatSeriesVenuePlace, joinMetaParts } from "@/lib/seriesMeta";
import { cn } from "@/lib/utils";

function seriesLogoLabel(series: CalendarSeriesItem): string {
  const slug = series.organizer.slug?.replace(/[^a-zA-Zа-яА-Я0-9]/g, "") ?? "";
  if (slug.length >= 2) {
    return slug.slice(0, 3).toUpperCase();
  }
  return series.name.slice(0, 3).toUpperCase();
}

function seriesDatePlaceLine(series: CalendarSeriesItem): string {
  const range = formatOverlapRange(series.starts_on, series.ends_on);
  return joinMetaParts([
    range,
    ...formatSeriesVenuePlace({
      venueName: series.venue.name,
      venueCity: series.venue.city,
      countryCode: series.country.code,
    }),
  ]);
}

function periodDetailLine(series: CalendarSeriesItem): string | null {
  if (series.coverage == null || series.events_in_period == null) {
    return null;
  }
  const count = series.events_in_period;
  const tournaments = `${count} ${tournamentsWord(count)}`;
  if (series.coverage === "full") {
    const min = pickDisplayMinBuyin(
      series.min_buyins_in_period ?? series.min_buyins,
      series.country.code,
    );
    if (min) {
      return `Целиком в периоде · ${tournaments} · от ${formatMoney(min.amount, min.currency.symbol)}`;
    }
    return `Целиком в периоде · ${tournaments}`;
  }
  if (series.overlap_starts_on && series.overlap_ends_on) {
    return `В периоде: ${formatOverlapRange(series.overlap_starts_on, series.overlap_ends_on)} · ${tournaments}`;
  }
  return `В периоде · ${tournaments}`;
}

function MonthSeriesRow({
  series,
  viewYear,
  viewMonth,
}: {
  series: CalendarSeriesItem;
  viewYear: number;
  viewMonth: number;
}) {
  const range = formatCalendarRangeChip(series, viewYear, viewMonth);
  const badge = statusBadgeVariant(series.status);
  const past = isSeriesOver(series);
  const dimmed = series.status === "announced" || past;

  return (
    <Link
      to={seriesPath(series)}
      data-testid={`calendar-series-${series.id}`}
      className={cn(
        "border-line bg-surface flex items-center gap-3 rounded-md border px-3 py-3",
        dimmed && "opacity-55",
      )}
    >
      <span
        className={cn(
          "border-line-strong bg-surface-3 inline-flex h-12 min-w-[52px] shrink-0 flex-col items-center justify-center rounded-[12px] border leading-tight",
          series.is_bookmarked && !past && "border-line-gold",
        )}
      >
        <b
          className={cn(
            "num text-[13px] font-extrabold",
            series.is_bookmarked && !past && "text-gold",
          )}
        >
          {range.main}
        </b>
        <span className="text-ink-3 text-[9px] font-bold uppercase">{range.monthLabel}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold">{series.name}</div>
        <div className="text-ink-2 truncate text-[12px]">{seriesMetaLine(series)}</div>
      </div>
      {badge === "live" && !past ? (
        <StatusBadge variant="live" pulse>
          Идёт
        </StatusBadge>
      ) : null}
      {badge === "announced" ? <StatusBadge variant="announced">Анонс</StatusBadge> : null}
    </Link>
  );
}

function PeriodSeriesRow({ series, todayIso }: { series: CalendarSeriesItem; todayIso: string }) {
  const past = isSeriesOver(series);
  const detail = periodDetailLine(series);
  const days = daysUntil(series.starts_on, todayIso);
  const soon =
    days !== null && days > 0 && series.status === "schedule_published"
      ? countdownLabel(series.starts_on, todayIso)
      : null;

  return (
    <Link
      to={seriesPath(series)}
      data-testid={`calendar-series-${series.id}`}
      className={cn(
        "relative flex items-start gap-[11px] px-4 py-2.5",
        "hover:bg-surface-2",
        past && "opacity-55",
      )}
    >
      <span className="border-line-strong from-surface-3 to-surface-2 text-gold inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border bg-gradient-to-br text-[12px] font-extrabold">
        {seriesLogoLabel(series)}
      </span>
      <div className="min-w-0 flex-1 pr-[70px]">
        <div className="truncate text-[14.5px] font-extrabold">{series.name}</div>
        <div className="text-ink-2 mt-px truncate text-[12px]">{seriesDatePlaceLine(series)}</div>
        {detail ? (
          <div className="text-ink-3 num mt-1 text-[11.5px]">
            {series.coverage === "partial" && series.overlap_starts_on && series.overlap_ends_on ? (
              <>
                В периоде:{" "}
                <span className="text-gold font-bold">
                  {formatOverlapRange(series.overlap_starts_on, series.overlap_ends_on)}
                </span>
                {` · ${series.events_in_period} ${tournamentsWord(series.events_in_period ?? 0)}`}
              </>
            ) : (
              detail
            )}
          </div>
        ) : null}
      </div>
      {series.coverage === "partial" ? (
        <span className="bg-info-soft text-info absolute top-3 right-4 inline-flex h-[21px] items-center gap-1.5 rounded-full px-2 text-[11px] font-bold">
          <span className="h-[5px] w-[5px] rounded-full bg-current" aria-hidden="true" />
          частично
        </span>
      ) : series.status === "running" && !past ? (
        <span className="absolute top-3 right-4">
          <StatusBadge variant="live" pulse>
            Идёт
          </StatusBadge>
        </span>
      ) : soon && !past ? (
        <span className="bg-gold-soft text-gold absolute top-3 right-4 inline-flex h-[21px] items-center gap-1.5 rounded-full px-2 text-[11px] font-bold">
          <span className="h-[5px] w-[5px] rounded-full bg-current" aria-hidden="true" />
          {soon}
        </span>
      ) : series.status === "announced" ? (
        <span className="absolute top-3 right-4">
          <StatusBadge variant="announced">Анонс</StatusBadge>
        </span>
      ) : null}
    </Link>
  );
}

export function MonthSeriesList({
  series,
  viewYear,
  viewMonth,
  mode,
  todayIso,
  onClearPeriod,
  listRef,
}: {
  series: CalendarSeriesItem[];
  viewYear: number;
  viewMonth: number;
  mode: "month" | "picking" | "period";
  todayIso: string;
  onClearPeriod?: () => void;
  listRef?: Ref<HTMLElement>;
}) {
  if (mode === "picking") {
    return (
      <section
        ref={listRef}
        className="border-line flex-1 border-t px-[30px] py-9 text-center"
        data-testid="calendar-series-list"
      >
        <p className="text-ink-2 text-[13.5px]" data-testid="calendar-picking-hint">
          Выберите вторую дату,
          <br />
          чтобы увидеть серии периода
        </p>
      </section>
    );
  }

  if (mode === "period") {
    return (
      <section
        ref={listRef}
        className="border-line flex-1 border-t pb-4"
        data-testid="calendar-series-list"
      >
        <div className="flex items-baseline justify-between px-4 pt-3.5 pb-2">
          <h2 className="text-[16px] font-extrabold">Серии периода</h2>
          <span className="text-ink-3 num text-[12px]">
            {series.length} {pluralRu(series.length, "серия", "серии", "серий")}
          </span>
        </div>
        {series.length === 0 ? (
          <div className="px-[30px] py-9 text-center" data-testid="calendar-empty-list">
            <b className="text-ink mb-1 block text-[15px] font-bold">В выбранный период серий нет</b>
            {onClearPeriod ? (
              <button
                type="button"
                onClick={onClearPeriod}
                className="bg-gold-soft text-gold mt-4 inline-flex h-11 min-h-11 items-center justify-center rounded-full px-5 text-[13px] font-bold"
                data-testid="calendar-clear-period"
              >
                Сбросить период
              </button>
            ) : null}
          </div>
        ) : (
          <div>
            {series.map((item) => (
              <PeriodSeriesRow key={item.id} series={item} todayIso={todayIso} />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section ref={listRef} className="px-4 pt-[18px]" data-testid="calendar-series-list">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="text-ink-3 text-[13px] font-bold tracking-[0.06em] uppercase">
          {monthSeriesSectionTitle(viewMonth)}
        </h2>
      </div>
      {series.length === 0 ? (
        <div
          className="border-line bg-surface rounded-md border px-4 py-8 text-center"
          data-testid="calendar-empty-list"
        >
          <p className="text-ink text-[15px] font-semibold">В этом месяце пусто</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {series.map((item) => (
            <MonthSeriesRow
              key={item.id}
              series={item}
              viewYear={viewYear}
              viewMonth={viewMonth}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function MonthSeriesListSkeleton() {
  return (
    <div className="space-y-2 px-4 pt-[18px]" data-testid="calendar-series-skeleton">
      <div className="bg-surface-2 mb-2.5 h-4 w-28 rounded-sm" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="bg-surface h-[72px] rounded-md" />
      ))}
    </div>
  );
}
