import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useEvent } from "@/api/series";
import { BlindStructure } from "@/components/event/BlindStructure";
import { EventHeader, type EventLocationState } from "@/components/event/EventHeader";
import { FactsGrid } from "@/components/event/FactsGrid";
import { FlightList } from "@/components/event/FlightList";
import { VenueCard } from "@/components/event/VenueCard";
import { useFirstBookmarkedFlight } from "@/features/bookmarks/hooks";
import { eventPath } from "@/lib/paths";

function EventSkeleton() {
  return (
    <div data-testid="event-skeleton">
      <div className="border-line flex items-center gap-2.5 border-b px-4 py-3">
        <div className="bg-surface-2 h-[38px] w-[38px] rounded-md" />
        <div className="bg-surface-2 h-4 w-32 rounded-sm" />
        <span className="flex-1" />
        <div className="bg-surface-2 h-[38px] w-[38px] rounded-md" />
      </div>
      <div className="space-y-2 px-4 pt-5">
        <div className="bg-surface-2 h-7 w-2/3 rounded-sm" />
        <div className="bg-surface-2 h-4 w-[80%] rounded-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-surface h-[68px] rounded-md" />
        ))}
      </div>
      <div className="space-y-2 px-4">
        <div className="bg-surface h-[58px] rounded-md" />
        <div className="bg-surface h-[58px] rounded-md" />
        <div className="bg-surface h-[58px] rounded-md" />
      </div>
    </div>
  );
}

export function EventPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as EventLocationState | null;
  const seriesDay = locationState?.seriesDay;
  const query = useEvent(eventId);

  const [settingsFlightId, setSettingsFlightId] = useState<string | null>(null);

  const event = query.data;
  const now = useMemo(() => new Date(), []);

  const flightIds = useMemo(() => (event ? event.flights.map((flight) => flight.id) : []), [event]);
  const bookmarkedFlightId = useFirstBookmarkedFlight(flightIds);

  useEffect(() => {
    setSettingsFlightId(null);
  }, [eventId]);

  // Bootstrap once: open reminder settings for an already-bookmarked flight.
  useEffect(() => {
    if (!bookmarkedFlightId) {
      return;
    }
    setSettingsFlightId((current) => current ?? bookmarkedFlightId);
  }, [bookmarkedFlightId]);

  useEffect(() => {
    if (!event || !eventId) {
      return;
    }
    const canonicalKey = eventPath(event, event.series).replace(/^\/events\//, "");
    if (eventId === canonicalKey) {
      return;
    }
    navigate(`${eventPath(event, event.series)}${location.search}`, { replace: true });
  }, [event, eventId, location.search, navigate]);

  if (!eventId) {
    return (
      <div className="text-ink-2 px-4 py-10 text-center" data-testid="event-missing-id">
        Не указан идентификатор турнира
      </div>
    );
  }

  if (query.isLoading) {
    return <EventSkeleton />;
  }

  if (query.isError) {
    const apiError = query.error instanceof ApiError ? query.error : null;
    if (apiError?.status === 404) {
      return (
        <div className="px-4 py-16 text-center" data-testid="event-not-found">
          <h1 className="text-xl font-extrabold">Турнир не найден</h1>
          <p className="text-ink-2 mt-2 text-sm">Возможно, он был удалён или ссылка устарела.</p>
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
      <div className="px-4 py-16 text-center" data-testid="event-error">
        <h1 className="text-xl font-extrabold">Не удалось загрузить</h1>
        <p className="text-ink-2 mt-2 text-sm">
          {apiError?.message ?? "Проверьте соединение и попробуйте снова."}
        </p>
        <button
          type="button"
          className="border-line-strong bg-surface-2 text-ink-2 mt-5 inline-flex h-11 min-h-11 items-center justify-center rounded-full border px-5 text-[13px] font-bold"
          onClick={() => void query.refetch()}
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!event) {
    return null;
  }

  return (
    <div className="pb-8" data-testid="event-page">
      <EventHeader event={event} seriesDay={seriesDay} now={now} />
      <FactsGrid event={event} />
      <FlightList
        event={event}
        now={now}
        settingsFlightId={settingsFlightId}
        onSettingsFlightIdChange={setSettingsFlightId}
      />
      <BlindStructure levels={event.blind_levels} />
      <VenueCard venue={event.venue} />
    </div>
  );
}
