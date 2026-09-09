import { Link } from "react-router-dom";

import type { EventDetail, FlightRead } from "@/api/types/schedule";
import { StaffEditLink } from "@/components/admin/StaffEditLink";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { CopyToast } from "@/components/ui/CopyToast";
import { useCopyToast } from "@/components/ui/useCopyToast";
import { seriesPath } from "@/lib/paths";
import { shareOrCopyUrl } from "@/lib/share";
import { formatEventStartMeta, lastFlightByStart, nearestFutureFlight } from "@/lib/time";

const iconClass =
  "h-5 w-5 stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

const headerBtnClass =
  "bg-surface-2 text-ink-2 inline-flex h-[38px] min-h-11 w-[38px] min-w-11 shrink-0 items-center justify-center rounded-md";

export type EventLocationState = {
  seriesDay?: string;
  flightId?: string;
};

type Props = {
  event: EventDetail;
  seriesDay?: string;
  now?: Date;
};

export function EventHeader({ event, seriesDay, now = new Date() }: Props) {
  const { message: toast, showCopied } = useCopyToast();
  const seriesHref = seriesPath(event.series, { day: seriesDay });

  const nearest = nearestFutureFlight(event.flights, now);
  const focusFlight: FlightRead | null = nearest ?? lastFlightByStart(event.flights);
  const singleUnlabeled = event.flights.length === 1 && event.flights[0]?.label == null;
  const meta = focusFlight
    ? formatEventStartMeta(focusFlight, {
        kind: nearest ? "nearest" : "last",
        singleUnlabeled,
      })
    : null;

  const titlePrefix = event.number != null ? `#${event.number} ` : "";
  const compactTitle = `${titlePrefix}${event.name}`;

  const shareBtn = (
    <button
      type="button"
      aria-label="Поделиться"
      className={headerBtnClass}
      onClick={() => {
        const title = event.number != null ? `#${event.number} ${event.name}` : event.name;
        void shareOrCopyUrl({
          title,
          url: window.location.href,
          text: `${title} · ${event.series.name} · Day2`,
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
  );

  return (
    <>
      <StickyHeader
        title={compactTitle}
        titleInExpanded={false}
        expandedContent={
          <Link
            to={seriesHref}
            className="text-gold truncate text-[13px] font-bold"
            data-testid="event-breadcrumb"
          >
            {event.series.name}
          </Link>
        }
        actions={
          <>
            <StaffEditLink
              to={
                seriesDay
                  ? `/admin/series/${event.series.id}?event=${encodeURIComponent(event.id)}&day=${encodeURIComponent(seriesDay)}`
                  : `/admin/series/${event.series.id}?event=${encodeURIComponent(event.id)}`
              }
              className={headerBtnClass}
            />
            {shareBtn}
          </>
        }
        compactActions={shareBtn}
      />

      <div className="px-4 pt-5">
        {event.status === "cancelled" ? (
          <span className="bg-surface-2 text-ink-3 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Отменён
          </span>
        ) : null}
        <h1 className="mt-2 text-[23px] font-extrabold tracking-[-0.02em]">
          {titlePrefix}
          {event.name}
        </h1>
        {meta ? (
          <p className="num text-ink-2 mt-1 text-sm" data-testid="event-start-meta">
            {meta}
          </p>
        ) : null}
      </div>
      <CopyToast message={toast} />
    </>
  );
}
