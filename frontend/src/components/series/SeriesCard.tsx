import { Link } from "react-router-dom";

import type { SeriesListItem } from "@/api/types/schedule";
import { BookmarkButton } from "@/components/series/BookmarkButton";
import {
  countdownLabel,
  effectiveSeriesPhase,
  formatSeriesDateRange,
  isSeriesOver,
  liveDayBadgeLabel,
  organizerAbbrev,
  PAST_SERIES_HINT,
  seriesCardDataParts,
} from "@/components/series/seriesDisplay";
import { SeriesLogo } from "@/components/series/SeriesLogo";
import { StatusBadge } from "@/components/series/StatusBadge";
import { formatSeriesMeta } from "@/lib/seriesMeta";
import { seriesPath } from "@/lib/paths";
import { cn } from "@/lib/utils";

function CardBadge({ series }: { series: SeriesListItem }) {
  const phase = effectiveSeriesPhase(series);
  if (phase === "running") {
    return (
      <StatusBadge variant="live" pulse>
        {liveDayBadgeLabel(series) ?? "Идёт"}
      </StatusBadge>
    );
  }
  if (phase === "announced") {
    return <StatusBadge variant="announced">Анонс</StatusBadge>;
  }
  if (phase === "soon") {
    return <StatusBadge variant="soon">{countdownLabel(series.starts_on)}</StatusBadge>;
  }
  if (phase === "past") {
    return <StatusBadge variant="muted">Завершена</StatusBadge>;
  }
  return null;
}

export function SeriesCard({ series }: { series: SeriesListItem }) {
  const abbrev = organizerAbbrev(series);
  const phase = effectiveSeriesPhase(series);
  const isLive = phase === "running";
  const isPast = phase === "past";
  const dataParts = seriesCardDataParts(series);
  const meta = formatSeriesMeta({
    dateLabel: formatSeriesDateRange(series.starts_on, series.ends_on),
    venueName: series.venue.name,
    venueCity: series.venue.city,
    countryCode: series.country.code,
  });

  return (
    <article
      className={cn(
        "border-line bg-surface relative flex items-start gap-3 rounded-lg border p-3",
        "hover:bg-surface-2",
        isLive && "border-line-gold",
        isPast && "opacity-55",
      )}
      data-testid="series-card"
    >
      <Link
        to={seriesPath(series)}
        className="absolute inset-0 z-0 rounded-lg"
        aria-label={series.name}
      />

      <SeriesLogo
        className="relative z-[1]"
        organizerName={series.organizer.name}
        logoUrl={series.organizer.logo_url}
        posterUrl={series.poster_url}
        abbrev={abbrev}
      />

      {/* Title clears badge (~96px); meta/data only bookmark (~44px). */}
      <div className="relative z-[1] min-w-0 flex-1 pointer-events-none">
        <h3 className="overflow-hidden pr-24 text-[15.5px] leading-[1.25] font-extrabold tracking-tight text-ellipsis whitespace-nowrap">
          {series.name}
        </h3>
        <p className="text-ink-2 mt-0.5 overflow-hidden pr-11 text-[12.5px] text-ellipsis whitespace-nowrap">
          {meta}
        </p>
        {dataParts ? (
          <p className="num text-ink-3 mt-[5px] flex flex-wrap items-center gap-[7px] pr-11 text-xs">
            {dataParts.map((part, index) => (
              <span key={`${part.text}-${index}`} className="inline-flex items-center gap-[7px]">
                {index > 0 ? (
                  <span
                    className="bg-ink-3/60 inline-block h-[3px] w-[3px] rounded-full"
                    aria-hidden="true"
                  />
                ) : null}
                <span className={cn(part.emphasis && "text-gold font-bold")}>{part.text}</span>
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <div className="pointer-events-none absolute top-3 right-3 z-[1]">
        <CardBadge series={series} />
      </div>

      <BookmarkButton
        targetType="series"
        targetId={series.id}
        disabledReason={isSeriesOver(series) ? PAST_SERIES_HINT : undefined}
        className={cn(
          "absolute right-2 bottom-2.5 z-[2] !h-11 !min-h-11 !w-11 !min-w-11",
          "bg-transparent backdrop-blur-none hover:bg-surface-3",
        )}
      />
    </article>
  );
}
