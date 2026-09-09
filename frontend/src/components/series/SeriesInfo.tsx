import { Link } from "react-router-dom";

import type { SeriesDetail } from "@/api/types/schedule";
import { BookmarkButton } from "@/components/series/BookmarkButton";
import {
  formatSeriesDateRange,
  isSeriesOver,
  PAST_SERIES_HINT,
  pickDisplayMinBuyin,
} from "@/components/series/seriesDisplay";
import { StatusBadge } from "@/components/series/StatusBadge";
import { formatMoney } from "@/features/schedule/lib/format";
import { tournamentsWord } from "@/lib/plural";
import { seriesSchedulePath } from "@/lib/paths";
import { formatSeriesMeta } from "@/lib/seriesMeta";
import { SERIES_STATUS_LABELS } from "@/lib/statusLabels";
import { seriesDayIndex, todayInTimezone } from "@/lib/time";
import { cn } from "@/lib/utils";

function liveBadgeLabel(series: SeriesDetail): string {
  if (series.status === "running") {
    const today = todayInTimezone(series.venue.timezone);
    const index = seriesDayIndex(series.starts_on, series.ends_on, today);
    if (index) {
      return `Идёт · день ${index.day} из ${index.total}`;
    }
  }
  return SERIES_STATUS_LABELS[series.status] ?? series.status;
}

function mainEventBuyin(series: SeriesDetail): string | null {
  for (const day of series.events_by_day) {
    for (const event of day.events) {
      if (event.tags.includes("main")) {
        return formatMoney(event.buyin, event.currency.symbol);
      }
    }
  }
  return null;
}

function telegramUrl(links: Record<string, string>): string | null {
  const candidates = ["telegram", "tg", "t.me", "Telegram"];
  for (const key of candidates) {
    if (links[key]) {
      return links[key];
    }
  }
  for (const value of Object.values(links)) {
    if (value.includes("t.me/") || value.includes("telegram.")) {
      return value;
    }
  }
  return null;
}

export function SeriesInfo({ series }: { series: SeriesDetail }) {
  const year = series.starts_on.slice(0, 4);
  const meta = formatSeriesMeta({
    dateLabel: `${formatSeriesDateRange(series.starts_on, series.ends_on)} ${year}`,
    venueName: series.venue.name,
    venueCity: series.venue.city,
    countryCode: series.country.code,
  });
  const min = pickDisplayMinBuyin(series.min_buyins, series.country.code);
  const main = mainEventBuyin(series);
  const tg = telegramUrl(series.links);
  const isLive = series.status === "running";
  const showEvents = series.events_count > 0;
  const showMin = min !== null;
  const showMain = main !== null;
  const showStats = showEvents || showMin || showMain;

  return (
    <div className="relative z-2 -mt-[34px] px-4">
      <StatusBadge
        variant={isLive ? "live" : series.status === "announced" ? "announced" : "soon"}
        pulse={isLive}
      >
        {liveBadgeLabel(series)}
      </StatusBadge>

      <h1 className="mt-2.5 text-2xl font-extrabold tracking-tight">{series.name}</h1>
      <p className="num text-ink-2 mt-1 text-sm">{meta}</p>

      {showStats ? (
        <div
          className={cn(
            "border-line bg-surface mt-3.5 flex gap-4 rounded-md border px-3.5 py-3",
          )}
        >
          {showEvents ? (
            <div className="min-w-0 flex-1">
              <div className="num text-base font-extrabold">{series.events_count}</div>
              <div className="text-ink-3 mt-px text-[11px]">
                {tournamentsWord(series.events_count)}
              </div>
            </div>
          ) : null}
          {showMin ? (
            <div className="min-w-0 flex-1">
              <div className="num text-base font-extrabold">
                {`от ${formatMoney(min.amount, min.currency.symbol)}`}
              </div>
              <div className="text-ink-3 mt-px text-[11px]">бай-ины</div>
            </div>
          ) : null}
          {showMain ? (
            <div className="min-w-0 flex-1">
              <div className="num text-base font-extrabold">{main}</div>
              <div className="text-ink-3 mt-px text-[11px]">Main Event</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2.5">
        <BookmarkButton
          targetType="series"
          targetId={series.id}
          variant="cta"
          disabledReason={isSeriesOver(series) ? PAST_SERIES_HINT : undefined}
        />
        <Link
          to={seriesSchedulePath(series)}
          className="border-line-gold text-ink hover:bg-gold-soft inline-flex h-11 min-h-11 flex-1 items-center justify-center rounded-md border px-3.5 text-[13px] font-extrabold"
        >
          Все расписание
        </Link>
        {tg ? (
          <a
            href={tg}
            target="_blank"
            rel="noreferrer"
            aria-label="Телеграм серии"
            className="border-line-gold text-ink hover:bg-gold-soft inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-md border"
          >
            <svg
              className="h-5 w-5 fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M21 4 3 11l6 2 2 6 3.5-4.5L19 17z" />
            </svg>
          </a>
        ) : null}
      </div>
    </div>
  );
}
