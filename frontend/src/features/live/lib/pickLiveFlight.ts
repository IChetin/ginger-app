import type { LiveCandidateRead } from "@/api/types/live";
import type { EventDetail } from "@/api/types/schedule";

export type FlightLike = {
  id: string;
  label: string | null;
  start_at: { utc: string };
};

export type LinkedStartInput = {
  event_id: string;
  flight_id: string;
  buyin: string;
  currency_code: string;
  currency_symbol: string;
  display_name: string;
  display_series: string;
  reentry_allowed: boolean;
};

/** Explicit flight if present, otherwise the start closest to `now`. */
export function pickLiveFlight<T extends FlightLike>(
  flights: T[],
  now: Date = new Date(),
  preferredId?: string | null,
): T | null {
  if (flights.length === 0) {
    return null;
  }
  if (preferredId) {
    const match = flights.find((flight) => flight.id === preferredId);
    if (match) {
      return match;
    }
  }
  const nowMs = now.getTime();
  let best = flights[0];
  let bestDiff = Math.abs(new Date(best.start_at.utc).getTime() - nowMs);
  for (let i = 1; i < flights.length; i += 1) {
    const flight = flights[i];
    const diff = Math.abs(new Date(flight.start_at.utc).getTime() - nowMs);
    if (diff < bestDiff) {
      best = flight;
      bestDiff = diff;
    }
  }
  return best;
}

export function pickLiveCandidate(
  candidates: LiveCandidateRead[],
  eventId: string,
  flightId?: string | null,
  now: Date = new Date(),
): LiveCandidateRead | null {
  const forEvent = candidates.filter((item) => item.event_id === eventId);
  if (forEvent.length === 0) {
    return null;
  }
  if (flightId) {
    const match = forEvent.find((item) => item.flight_id === flightId);
    if (match) {
      return match;
    }
  }
  const nowMs = now.getTime();
  return forEvent.reduce((best, item) => {
    const diff = Math.abs(new Date(item.start_at).getTime() - nowMs);
    const bestDiff = Math.abs(new Date(best.start_at).getTime() - nowMs);
    return diff < bestDiff ? item : best;
  });
}

export function linkedStartFromCandidate(candidate: LiveCandidateRead): LinkedStartInput {
  return {
    event_id: candidate.event_id,
    flight_id: candidate.flight_id,
    buyin: candidate.buyin,
    currency_code: candidate.currency.code,
    currency_symbol: candidate.currency.symbol,
    display_name: candidate.name,
    display_series: candidate.series_name,
    reentry_allowed: candidate.reentry_unlimited || (candidate.reentry_count ?? 0) > 0,
  };
}

export function eventDisplayName(event: Pick<EventDetail, "number" | "name">, flightLabel?: string | null): string {
  const base = event.number != null ? `#${event.number} ${event.name}` : event.name;
  return flightLabel ? `${base} · ${flightLabel}` : base;
}

export function linkedStartFromEvent(event: EventDetail, flight: FlightLike): LinkedStartInput {
  return {
    event_id: event.id,
    flight_id: flight.id,
    buyin: event.buyin,
    currency_code: event.currency.code,
    currency_symbol: event.currency.symbol,
    display_name: eventDisplayName(event, flight.label),
    display_series: event.series.name,
    reentry_allowed: event.reentry_unlimited || (event.reentry_count ?? 0) > 0,
  };
}

export function isSameLiveTournament(
  session: { event_id: string | null },
  eventId: string,
): boolean {
  return session.event_id === eventId;
}
