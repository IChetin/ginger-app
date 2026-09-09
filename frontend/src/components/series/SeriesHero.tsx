import type { SeriesDetail } from "@/api/types/schedule";
import {
  organizerAbbrev,
  posterGradientClass,
} from "@/components/series/seriesDisplay";
import { cn } from "@/lib/utils";

/** Постер серии без панели действий — кнопки в StickyHeader. */
export function SeriesHero({ series }: { series: SeriesDetail }) {
  const abbrev = organizerAbbrev(series);

  return (
    <div
      className={cn(
        "relative flex h-[210px] items-center justify-center overflow-hidden",
        !series.poster_url && posterGradientClass(series.organizer.slug),
        !series.poster_url && "bg-[linear-gradient(160deg,#26231D_0%,#171511_50%,#0B0A09_100%)]",
      )}
    >
      {series.poster_url ? (
        <img
          src={series.poster_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="text-gold/16 text-[52px] font-extrabold tracking-[0.1em]">{abbrev}</span>
      )}
      <div className="to-bg pointer-events-none absolute inset-x-0 bottom-0 h-[100px] bg-gradient-to-b from-transparent" />
    </div>
  );
}
