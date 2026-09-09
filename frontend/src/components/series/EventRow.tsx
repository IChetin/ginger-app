import { Link } from "react-router-dom";

import type { EventSummary, FlightRead } from "@/api/types/schedule";
import { ReminderBell } from "@/components/series/ReminderBell";
import { PAST_FLIGHT_HINT } from "@/components/series/seriesDisplay";
import { formatGameType, formatMoney } from "@/features/schedule/lib/format";
import { eventPath } from "@/lib/paths";
import { formatDualTime, formatShortDayMonth, isPastUtc, venueLocalDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export type FlightRowModel = {
  event: EventSummary;
  flight: FlightRead;
  day: string;
};

function tagLabel(tag: string): string {
  const map: Record<string, string> = {
    turbo: "Турбо",
    bounty: "Баунти",
    satellite: "Сателлит",
    freezeout: "Freezeout",
    main: "Main",
    deepstack: "Deepstack",
  };
  return map[tag] ?? tag;
}

function reentryChip(event: EventSummary): string | null {
  if (event.reentry_unlimited) {
    return "Ре-энтри без лимита";
  }
  if (event.reentry_count != null && event.reentry_count > 0) {
    return `Ре-энтри ×${event.reentry_count}`;
  }
  return null;
}

function siblingFlightChips(event: EventSummary, currentFlightId: string, day: string) {
  return event.flights
    .filter((flight) => flight.id !== currentFlightId)
    .map((flight) => {
      const flightDay = venueLocalDate(flight.start_at.utc, flight.start_at.venue_timezone);
      if (flightDay === day) {
        return null;
      }
      const label = flight.label ?? "Flight";
      return `${label} — ${formatShortDayMonth(flightDay)}`;
    })
    .filter((value): value is string => Boolean(value));
}

export function EventRow({
  row,
  seriesSlug,
}: {
  row: FlightRowModel;
  seriesSlug: string;
}) {
  const { event, flight, day } = row;
  const dual = formatDualTime(flight.start_at.utc, flight.start_at.venue_timezone);
  const past = isPastUtc(flight.start_at.utc);
  const siblings = siblingFlightChips(event, flight.id, day);
  const reentry = reentryChip(event);
  const titlePrefix = event.number != null ? `#${event.number} ` : "";
  const flightSuffix = flight.label ? ` · ${flight.label}` : "";

  const metaParts = [
    formatMoney(event.buyin, event.currency.symbol),
    event.guarantee ? `Гарантия ${formatMoney(event.guarantee, event.currency.symbol)}` : null,
    formatGameType(event.game_type),
    ...event.tags.filter((tag) => tag !== "main").map(tagLabel),
  ].filter(Boolean);

  return (
    <Link
      to={eventPath(row.event, { slug: seriesSlug })}
      state={{ seriesDay: day, flightId: flight.id }}
      className={cn(
        "border-line bg-surface hover:bg-surface-2 flex items-start gap-3.5 rounded-md border p-3.5",
        past && "opacity-50",
      )}
      data-testid="event-row"
    >
      <div className="num min-w-[52px] text-center">
        <div className="text-[17px] font-extrabold">{dual.venue}</div>
        {dual.user ? <div className="text-ink-3 text-[11px]">{dual.user}</div> : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold">
          {titlePrefix}
          {event.name}
          {flightSuffix}
        </div>
        <div className="num text-ink-2 mt-0.5 text-[13px]">{metaParts.join(" · ")}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {past ? (
            <span className="bg-surface-2 text-ink-3 inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold">
              Завершён
            </span>
          ) : null}
          {reentry ? (
            <span className="border-line-strong bg-surface-2 text-ink-2 inline-flex h-[26px] items-center rounded-[8px] border px-2.5 text-[11px] font-extrabold">
              {reentry}
            </span>
          ) : null}
          {event.start_stack != null ? (
            <span className="border-line-strong bg-surface-2 text-ink-2 inline-flex h-[26px] items-center rounded-[8px] border px-2.5 text-[11px] font-extrabold">
              Стек {event.start_stack.toLocaleString("ru-RU")}
            </span>
          ) : null}
          {event.start_blinds ? (
            <span className="border-line-strong bg-surface-2 text-ink-2 inline-flex h-[26px] items-center rounded-[8px] border px-2.5 text-[11px] font-extrabold">
              {event.start_blinds}
            </span>
          ) : null}
          {siblings.map((chip) => (
            <span
              key={chip}
              className="border-line-strong bg-surface-2 text-ink-2 inline-flex h-[26px] items-center rounded-[8px] border px-2.5 text-[11px] font-extrabold"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      <ReminderBell flightId={flight.id} disabled={past} disabledReason={PAST_FLIGHT_HINT} />
    </Link>
  );
}
