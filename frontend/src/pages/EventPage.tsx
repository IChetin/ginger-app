import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useEvent } from "@/api/series";
import { BlindStructure } from "@/components/event/BlindStructure";
import { EventHeader, type EventLocationState } from "@/components/event/EventHeader";
import { FactsGrid } from "@/components/event/FactsGrid";
import { FlightList } from "@/components/event/FlightList";
import { VenueCard } from "@/components/event/VenueCard";
import { useMe } from "@/features/auth/hooks";
import { useFirstBookmarkedFlight } from "@/features/bookmarks/hooks";
import { useActiveLiveSession } from "@/features/live/hooks";
import { isSameLiveTournament, pickLiveFlight } from "@/features/live/lib/pickLiveFlight";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { hasFutureFlights, venueLocalDate } from "@/lib/time";
import { eventPath, liveSessionPath } from "@/lib/paths";
import { cn } from "@/lib/utils";

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
  const stateFlightId = locationState?.flightId ?? null;
  const query = useEvent(eventId);
  const { data: user } = useMe();
  const liveQuery = useActiveLiveSession();
  const confirm = useConfirm();
  const liveSession =
    liveQuery.data && liveQuery.data.status === "active" ? liveQuery.data : null;

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

  const showCta = event.status !== "cancelled" && !hasFutureFlights(event.flights, now);
  const resultPath = `/tracker/results/new?event_id=${encodeURIComponent(event.id)}`;

  const venueTz = event.venue.timezone;
  const todayLocal = venueLocalDate(now.toISOString(), venueTz);
  const hasFlightToday = event.flights.some(
    (flight) => venueLocalDate(flight.start_at.utc, venueTz) === todayLocal,
  );
  const anyFlightStarted = event.flights.some(
    (flight) => new Date(flight.start_at.utc).getTime() <= now.getTime(),
  );
  const seriesRunning = event.series.status === "running";
  const showLiveCta =
    event.status !== "cancelled" &&
    event.series.status !== "finished" &&
    event.series.status !== "cancelled" &&
    (hasFlightToday || (seriesRunning && anyFlightStarted));

  const liveFlight = pickLiveFlight(event.flights, now, stateFlightId);
  const livePath = liveSessionPath(event.id, liveFlight?.id);
  const sameLiveSession = liveSession ? isSameLiveTournament(liveSession, event.id) : false;

  const handleLiveClick = async () => {
    if (!user) {
      navigate("/login", { state: { returnTo: livePath } });
      return;
    }
    if (liveSession && !sameLiveSession) {
      const ok = await confirm({
        title: "Уже есть активная сессия",
        description: "Сначала завершите текущий турнир",
        confirmLabel: "К текущему турниру",
      });
      if (ok) navigate("/live");
      return;
    }
    navigate(sameLiveSession ? "/live" : livePath);
  };

  return (
    <div
      className={cn("pb-8", (showCta || showLiveCta) && "pb-40")}
      data-testid="event-page"
    >
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

      {showLiveCta || showCta ? (
        <div className="via-stage/90 to-stage/95 fixed bottom-0 left-1/2 z-30 w-full max-w-[420px] -translate-x-1/2 bg-gradient-to-b from-transparent px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {showLiveCta ? (
            <>
              <button
                type="button"
                className="bg-gold-grad text-ink-ongold shadow-sheen-glow flex h-[52px] w-full items-center justify-center gap-2 rounded-md text-base font-extrabold tracking-[0.01em] active:translate-y-px"
                data-testid="live-session-cta"
                onClick={() => void handleLiveClick()}
              >
                <svg
                  className="h-5 w-5 fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round]"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {sameLiveSession ? "Продолжить турнир" : "Я в игре · вести турнир"}
              </button>
              <p className="text-ink-3 mt-2 text-center text-xs">
                Входы и ре-энтри → результат сам уйдёт в трекер
              </p>
            </>
          ) : null}
          {showCta && !showLiveCta ? (
            <Link
              to={user ? resultPath : "/login"}
              state={user ? undefined : { returnTo: resultPath }}
              className="bg-gold-grad text-ink-ongold shadow-sheen-glow flex h-[52px] w-full items-center justify-center gap-2 rounded-md text-base font-extrabold tracking-[0.01em] active:translate-y-px motion-reduce:transition-none"
              data-testid="add-result-cta"
            >
              <svg
                className="h-5 w-5 fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round]"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Добавить результат
            </Link>
          ) : null}
          {showCta && showLiveCta ? (
            <Link
              to={user ? resultPath : "/login"}
              state={user ? undefined : { returnTo: resultPath }}
              className="text-ink-2 mt-2 flex h-11 w-full items-center justify-center text-[13px] font-bold"
              data-testid="add-result-cta"
            >
              Добавить результат вручную
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
