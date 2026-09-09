import type { EventDetail, FlightRead } from "@/api/types/schedule";
import { ReminderBell } from "@/components/series/ReminderBell";
import { PAST_FLIGHT_HINT } from "@/components/series/seriesDisplay";
import { ReminderSettings } from "@/components/event/ReminderSettings";
import {
  formatDayListTitle,
  formatDualTime,
  isPastUtc,
  nearestFutureFlight,
  venueLocalDate,
} from "@/lib/time";
import { cn } from "@/lib/utils";

type Props = {
  event: EventDetail;
  now?: Date;
  /** Flight whose reminder settings panel is shown (nearest bookmarked preferred). */
  settingsFlightId: string | null;
  onSettingsFlightIdChange: (flightId: string | null) => void;
};

export function FlightList({
  event,
  now = new Date(),
  settingsFlightId,
  onSettingsFlightIdChange,
}: Props) {
  const nearest = nearestFutureFlight(event.flights, now);
  const singleUnlabeled = event.flights.length === 1 && event.flights[0]?.label == null;
  const sorted = [...event.flights].sort((a, b) => a.start_at.utc.localeCompare(b.start_at.utc));

  const settingsFlight: FlightRead | null =
    sorted.find((flight) => flight.id === settingsFlightId) ?? null;

  return (
    <section className="px-4 pt-2" data-testid="flight-list">
      <h2 className="mb-2.5 text-[17px] font-extrabold">
        {singleUnlabeled ? "Старт" : "Флайты"}
        {!singleUnlabeled ? (
          <span className="text-ink-3 ml-1.5 text-xs font-normal">
            напоминание — на каждый отдельно
          </span>
        ) : null}
      </h2>

      <div className="flex flex-col gap-2">
        {sorted.map((flight) => {
          const past = isPastUtc(flight.start_at.utc, now);
          const active = nearest?.id === flight.id;
          const dayIso = venueLocalDate(flight.start_at.utc, flight.start_at.venue_timezone);
          const dual = formatDualTime(flight.start_at.utc, flight.start_at.venue_timezone);
          const timeLine = dual.user ? `${dual.venue} · ${dual.user}` : dual.venue;

          return (
            <div
              key={flight.id}
              className={cn(
                "border-line bg-surface flex items-center gap-3 rounded-md border px-3.5 py-3",
                past && "opacity-50",
              )}
              data-testid="flight-row"
              data-flight-id={flight.id}
            >
              {!singleUnlabeled ? (
                <span
                  className={cn(
                    "border-line-strong bg-surface-2 text-ink-2 inline-flex h-[30px] shrink-0 items-center justify-center rounded-[9px] border px-3 text-xs font-extrabold",
                    active &&
                      "bg-gold-grad text-ink-ongold shadow-sheen-soft rotate-[-2deg] border-transparent",
                  )}
                >
                  {flight.label ?? "Flight"}
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{formatDayListTitle(dayIso)}</div>
                <div className="num text-ink-3 text-xs">{timeLine}</div>
              </div>
              <ReminderBell
                flightId={flight.id}
                disabled={past}
                disabledReason={PAST_FLIGHT_HINT}
                mode="inline"
                onBookmarkChange={(bookmarked) => {
                  if (bookmarked) {
                    onSettingsFlightIdChange(flight.id);
                  } else if (settingsFlightId === flight.id) {
                    onSettingsFlightIdChange(null);
                  }
                }}
              />
            </div>
          );
        })}
      </div>

      {settingsFlight ? <ReminderSettings flight={settingsFlight} /> : null}
    </section>
  );
}
