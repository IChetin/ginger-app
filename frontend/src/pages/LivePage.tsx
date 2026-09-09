import { Drawer } from "@base-ui/react/drawer";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useEvent } from "@/api/series";
import type { LiveCandidateRead } from "@/api/types/live";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { LadderNumberStepper } from "@/components/ui/NumberStepper";
import { AuthGate } from "@/features/auth/AuthGate";
import { useMe } from "@/features/auth/hooks";
import { EditEventSheet } from "@/features/live/components/EditEventSheet";
import { EventTimeline } from "@/features/live/components/EventTimeline";
import { NoteSheet } from "@/features/live/components/NoteSheet";
import {
  useActiveLiveSession,
  useLiveActions,
  useLiveCandidates,
  useLivePendingCount,
  visibleEvents,
  type LocalLiveSession,
} from "@/features/live/hooks";
import { entriesCount, formatDuration, investedTotal } from "@/features/live/lib/calc";
import { fromLocalParts, timeLabel, toDatetimeLocalParts } from "@/features/live/lib/datetimeLocal";
import {
  isSameLiveTournament,
  linkedStartFromCandidate,
  linkedStartFromEvent,
  pickLiveCandidate,
  pickLiveFlight,
} from "@/features/live/lib/pickLiveFlight";
import { registerLiveSyncTriggers } from "@/features/live/lib/sync";
import { useResultCurrencies } from "@/features/tracker/hooks";
import { formatMoney } from "@/features/schedule/lib/format";
import { formatNumberRu, signPrefix } from "@/lib/money";
import { cn } from "@/lib/utils";

const iconClass =
  "h-[18px] w-[18px] stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

export function LivePage() {
  const { data: user, isPending: authPending } = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const preselectEventId = params.get("event_id");
  const preselectFlightId = params.get("flight_id");
  const returnTo = `${location.pathname}${location.search}`;
  const activeQuery = useActiveLiveSession();
  const actions = useLiveActions();
  const { count: pendingCount, refresh: refreshPending } = useLivePendingCount();
  const confirm = useConfirm();

  useEffect(() => {
    return registerLiveSyncTriggers(() => {
      refreshPending();
      void activeQuery.refetch();
    });
  }, [activeQuery, refreshPending]);

  if (!user) {
    if (authPending) {
      return <p className="text-ink-2 px-4 py-16 text-center text-sm">Загрузка…</p>;
    }
    return (
      <div data-testid="live-guest">
        <header className="border-line flex items-center gap-2.5 border-b px-3.5 py-3">
          <div className="min-w-0 flex-1 text-[15px] font-extrabold">Текущий турнир</div>
        </header>
        <AuthGate
          icon={
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="fill-none stroke-current [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
          title="Текущий турнир"
          description="Отмечайте входы и ре-энтри — результат сам уйдёт в трекер."
          returnTo={returnTo}
        />
      </div>
    );
  }

  const session = activeQuery.data ?? null;

  if (session?.conflict) {
    return (
      <div className="px-4 pt-16 text-center" data-testid="live-conflict">
        <h1 className="text-xl font-extrabold">Сессия уже закрыта на сервере</h1>
        <p className="text-ink-2 mt-2 text-sm">
          События остались на устройстве. Данные не потеряны — сбросьте локальную копию.
        </p>
        <button
          type="button"
          className="bg-gold-grad text-ink-ongold mt-6 inline-flex h-12 items-center rounded-md px-6 text-[15px] font-extrabold"
          onClick={() => void actions.dismissConflict.mutateAsync()}
        >
          Понятно
        </button>
      </div>
    );
  }

  if (session && session.status === "active") {
    if (preselectEventId && !isSameLiveTournament(session, preselectEventId)) {
      return (
        <OtherSessionGate
          onStay={() => navigate("/live", { replace: true })}
        />
      );
    }
    return (
      <ActiveSessionView
        session={session}
        pendingCount={pendingCount}
        online={typeof navigator === "undefined" ? true : navigator.onLine}
        onBack={() => navigate(-1)}
        actions={actions}
        confirm={confirm}
      />
    );
  }

  if (preselectEventId) {
    return (
      <DirectStartView
        eventId={preselectEventId}
        flightId={preselectFlightId}
        onBack={() => navigate(-1)}
        actions={actions}
      />
    );
  }

  return <StartSessionView onBack={() => navigate(-1)} actions={actions} />;
}

function OtherSessionGate({ onStay }: { onStay: () => void }) {
  return (
    <div className="px-4 pt-16 text-center" data-testid="live-other-session">
      <h1 className="text-xl font-extrabold">Уже есть активная сессия</h1>
      <p className="text-ink-2 mt-2 text-sm">Сначала завершите текущий турнир</p>
      <button
        type="button"
        className="bg-gold-grad text-ink-ongold mt-6 inline-flex h-12 items-center rounded-md px-6 text-[15px] font-extrabold"
        onClick={onStay}
      >
        К текущему турниру
      </button>
    </div>
  );
}

function DirectStartView({
  eventId,
  flightId,
  onBack,
  actions,
}: {
  eventId: string;
  flightId: string | null;
  onBack: () => void;
  actions: ReturnType<typeof useLiveActions>;
}) {
  const navigate = useNavigate();
  const candidatesQuery = useLiveCandidates(true, { eventId, flightId });
  const eventQuery = useEvent(eventId);
  const [error, setError] = useState<string | null>(null);
  const startedKey = useRef<string | null>(null);

  useEffect(() => {
    if (actions.startLinked.isPending) {
      return;
    }
    if (candidatesQuery.isLoading) {
      return;
    }
    const candidate = pickLiveCandidate(candidatesQuery.data ?? [], eventId, flightId);
    let payload = candidate ? linkedStartFromCandidate(candidate) : null;
    if (!payload && eventQuery.data) {
      const flight = pickLiveFlight(eventQuery.data.flights, new Date(), flightId);
      payload = flight ? linkedStartFromEvent(eventQuery.data, flight) : null;
    }
    if (!payload) {
      if (eventQuery.isLoading) {
        return;
      }
      setError("Не удалось определить турнир");
      return;
    }
    const key = `${payload.event_id}:${payload.flight_id}`;
    if (startedKey.current === key) {
      return;
    }
    startedKey.current = key;
    setError(null);
    void actions.startLinked.mutateAsync(payload).catch((err: unknown) => {
      startedKey.current = null;
      const resultId =
        err &&
        typeof err === "object" &&
        "resultId" in err &&
        typeof (err as { resultId: unknown }).resultId === "string"
          ? (err as { resultId: string }).resultId
          : null;
      if (resultId) {
        navigate(`/tracker/results/${resultId}/edit`, { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Не удалось начать турнир");
    });
  }, [
    actions.startLinked,
    candidatesQuery.data,
    candidatesQuery.isLoading,
    eventId,
    eventQuery.data,
    eventQuery.isLoading,
    flightId,
    navigate,
  ]);

  return (
    <div className="px-4 pt-16 text-center" data-testid="live-direct-start" data-event-id={eventId} data-flight-id={flightId ?? ""}>
      <button
        type="button"
        aria-label="Назад"
        className="bg-surface-2 text-ink-2 absolute top-3 left-3.5 inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
        onClick={onBack}
      >
        <svg className={iconClass} viewBox="0 0 24 24">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      {error ? (
        <>
          <h1 className="text-xl font-extrabold">Не удалось начать турнир</h1>
          <p className="text-danger mt-2 text-sm">{error}</p>
        </>
      ) : (
        <p className="text-ink-2 text-sm">Открываем турнир…</p>
      )}
    </div>
  );
}

function StartSessionView({
  onBack,
  actions,
}: {
  onBack: () => void;
  actions: ReturnType<typeof useLiveActions>;
}) {
  const navigate = useNavigate();
  const candidatesQuery = useLiveCandidates(true);
  const candidates = candidatesQuery.data ?? [];
  const [selected, setSelected] = useState<LiveCandidateRead | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (!candidates.length) return;
    if (selected) return;
    setSelected(candidates[0]);
  }, [candidates, selected]);

  return (
    <div className="flex min-h-screen flex-col" data-testid="live-start">
      <header className="border-line flex items-center gap-2.5 border-b px-3.5 py-3">
        <button
          type="button"
          aria-label="Назад"
          className="bg-surface-2 text-ink-2 inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
          onClick={onBack}
        >
          <svg className={iconClass} viewBox="0 0 24 24">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 text-[15px] font-extrabold">Текущий турнир</div>
      </header>

      <div className="flex-1 overflow-y-auto pb-4">
        <div className="px-5 pt-7 text-center">
          <div className="bg-gold-soft text-gold mx-auto mb-3.5 flex h-[60px] w-[60px] -rotate-[4deg] items-center justify-center rounded-[18px]">
            <svg className="h-[26px] w-[26px]" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r="9"
                className="fill-none stroke-current [stroke-width:1.8]"
              />
              <path d="M12 7v5l3 2" className="fill-none stroke-current [stroke-width:1.8]" />
            </svg>
          </div>
          <h1 className="text-[19px] font-extrabold">Отметьте вход в турнир</h1>
          <p className="text-ink-2 mt-1.5 text-[13.5px]">
            Входы, ре-энтри и заметки сохранятся,
            <br />а результат сам уйдёт в трекер
          </p>
        </div>

        <div className="border-line bg-surface mx-3.5 mt-[18px] rounded-lg border p-3.5">
          <div className="text-ink-3 mb-2 text-[11px] font-bold tracking-[0.06em] uppercase">
            Сегодня на вашей серии
          </div>
          {candidatesQuery.isLoading ? (
            <p className="text-ink-3 py-4 text-center text-sm">Загрузка…</p>
          ) : candidatesQuery.isError ? (
            <p className="text-danger py-4 text-center text-sm">Не удалось загрузить турниры</p>
          ) : candidates.length === 0 ? (
            <p className="text-ink-3 py-4 text-center text-sm">Нет турниров на сегодня</p>
          ) : (
            candidates.map((c) => (
              <button
                key={c.flight_id}
                type="button"
                className={cn(
                  "border-line-strong bg-surface-2 mb-2 flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left",
                  selected?.flight_id === c.flight_id && "border-line-gold bg-gold-soft",
                )}
                onClick={() => setSelected(c)}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{c.name}</div>
                  <div className="text-ink-3 mt-0.5 text-xs">
                    {c.series_name} · {timeLabel(c.start_at)}
                  </div>
                </div>
                <span className="text-gold num shrink-0 text-[13px] font-extrabold">
                  {formatMoney(c.buyin, c.currency.symbol)}
                </span>
              </button>
            ))
          )}
          <button
            type="button"
            className="text-gold flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-[13.5px] font-bold"
            onClick={() => setManualOpen(true)}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" className="fill-none stroke-current [stroke-width:1.8]" />
            </svg>
            Другой турнир (вручную)
          </button>
        </div>
      </div>

      <div className="border-line bg-surface border-t px-3.5 pt-2.5 pb-[calc(12px+env(safe-area-inset-bottom))]">
        {startError ? <p className="text-danger mb-2 text-center text-sm">{startError}</p> : null}
        <button
          type="button"
          disabled={!selected || actions.startLinked.isPending}
          className="bg-gold-grad text-ink-ongold shadow-sheen flex h-[58px] w-full items-center justify-center rounded-md text-base font-extrabold disabled:opacity-50"
          onClick={() => {
            if (!selected) return;
            setStartError(null);
            void actions.startLinked
              .mutateAsync({
                event_id: selected.event_id,
                flight_id: selected.flight_id,
                buyin: selected.buyin,
                currency_code: selected.currency.code,
                currency_symbol: selected.currency.symbol,
                display_name: selected.name,
                display_series: selected.series_name,
                reentry_allowed: selected.reentry_unlimited || (selected.reentry_count ?? 0) > 0,
              })
              .catch((error: unknown) => {
                const resultId =
                  error &&
                  typeof error === "object" &&
                  "resultId" in error &&
                  typeof (error as { resultId: unknown }).resultId === "string"
                    ? (error as { resultId: string }).resultId
                    : null;
                if (resultId) {
                  navigate(`/tracker/results/${resultId}/edit`, { replace: true });
                  return;
                }
                setStartError(error instanceof Error ? error.message : "Не удалось начать турнир");
              });
          }}
        >
          {selected
            ? `Я в игре · вход ${formatMoney(selected.buyin, selected.currency.symbol)}`
            : "Выберите турнир"}
        </button>
      </div>

      <ManualTournamentSheet
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSubmit={(values) => {
          void actions.startManual.mutateAsync(values).then(() => setManualOpen(false));
        }}
      />
    </div>
  );
}

function ActiveSessionView({
  session,
  pendingCount,
  online,
  onBack,
  actions,
  confirm,
}: {
  session: LocalLiveSession;
  pendingCount: number;
  online: boolean;
  onBack: () => void;
  actions: ReturnType<typeof useLiveActions>;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const navigate = useNavigate();
  const events = visibleEvents(session);
  const invested = investedTotal(events);
  const entries = entriesCount(events);
  const [now, setNow] = useState(Date.now());
  const [noteOpen, setNoteOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const editEvent = events.find((e) => e.id === editId) ?? null;

  const handleReentry = async () => {
    if (!session.reentry_allowed) {
      const ok = await confirm({
        title: "В турнире нет ре-энтри",
        description: "По данным расписания это фризаут. Всё равно отметить ре-энтри?",
        confirmLabel: "Отметить",
        variant: "default",
      });
      if (!ok) return;
    }
    await actions.addReentry.mutateAsync(session);
  };

  return (
    <div className="flex min-h-screen flex-col" data-testid="live-active">
      <header className="border-line flex items-center gap-2.5 border-b px-3.5 py-3">
        <button
          type="button"
          aria-label="Назад"
          className="bg-surface-2 text-ink-2 inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
          onClick={onBack}
        >
          <svg className={iconClass} viewBox="0 0 24 24">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold">{session.display_name}</div>
          <div className="text-ink-3 mt-px text-[11.5px]">
            {session.display_series}
            {session.display_series ? " · " : ""}
            старт {timeLabel(session.started_at)}
          </div>
        </div>
        <span className="bg-live-soft text-live inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-extrabold">
          <span className="bg-live h-1.5 w-1.5 animate-pulse rounded-full" />В ИГРЕ
        </span>
      </header>

      <div className="flex-1 overflow-y-auto pb-4">
        <div className="border-line-gold bg-surface mx-3.5 mt-3.5 rounded-lg border px-4 pt-4 pb-3.5 text-center">
          <div className="text-gold text-[11px] font-extrabold tracking-[0.12em] uppercase">
            Вложено в турнир
          </div>
          <div className="num mt-1 text-[38px] leading-none font-extrabold tracking-tight">
            {formatMoney(String(invested), session.currency.symbol)}
          </div>
          <div className="text-ink-2 num mt-1.5 text-[12.5px]">
            Бай-ин {formatMoney(session.buyin, session.currency.symbol)} ·{" "}
            <b className="text-ink font-bold">{entries} входа</b> · в игре{" "}
            {formatDuration(session.started_at, now)}
          </div>
        </div>

        <div className="mx-3.5 mt-3 flex gap-2.5">
          <button
            type="button"
            className="bg-gold-grad text-ink-ongold shadow-sheen flex h-14 flex-1 items-center justify-center gap-2 rounded-md text-[15.5px] font-extrabold"
            onClick={() => void handleReentry()}
          >
            <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" className="fill-none stroke-current [stroke-width:1.8]" />
            </svg>
            Ре-энтри
          </button>
          <button
            type="button"
            className="border-line-gold text-ink flex h-14 flex-1 items-center justify-center gap-2 rounded-md border text-[15.5px] font-extrabold"
            onClick={() => setNoteOpen(true)}
          >
            <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24">
              <path
                d="M4 20h4L19 9l-4-4L4 16v4z"
                className="fill-none stroke-current [stroke-width:1.8]"
              />
            </svg>
            Заметка
          </button>
        </div>

        {!online || pendingCount > 0 ? (
          <div className="bg-info-soft text-info mx-3.5 mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs">
            <svg className="h-[15px] w-[15px] shrink-0" viewBox="0 0 24 24">
              <path
                d="M3 12a9 9 0 0 1 9-9m0 18a9 9 0 0 1-9-9"
                className="fill-none stroke-current [stroke-width:1.8]"
              />
              <path d="M16 8l5 4-5 4" className="fill-none stroke-current [stroke-width:1.8]" />
            </svg>
            {!online
              ? `Нет сети · сохранено на устройстве${pendingCount ? `, ${pendingCount} событий ждут отправки` : ""}`
              : `Сохранено на устройстве, ${pendingCount} событий ждут отправки`}
          </div>
        ) : null}

        {Date.now() - new Date(session.started_at).getTime() > 24 * 60 * 60 * 1000 ? (
          <div className="bg-warn-soft text-warn mx-3.5 mt-3 rounded-md px-3 py-2 text-xs">
            Турнир ещё идёт? Завершите или отмените
          </div>
        ) : null}

        <div className="mx-3.5 mt-5">
          <EventTimeline
            events={events}
            currencySymbol={session.currency.symbol}
            onEdit={setEditId}
          />
        </div>
      </div>

      <div className="border-line bg-surface border-t px-3.5 pt-2.5 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="text-danger border-danger/40 flex h-12 w-full items-center justify-center rounded-md border text-[14.5px] font-extrabold"
          onClick={() => {
            actions.finish.reset();
            setFinishOpen(true);
          }}
        >
          Завершить турнир
        </button>
      </div>

      <NoteSheet
        open={noteOpen}
        onOpenChange={setNoteOpen}
        onSave={(text, occurredAt) => {
          void actions.addNote
            .mutateAsync({ session, text, occurred_at: occurredAt })
            .then(() => setNoteOpen(false));
        }}
      />
      <EditEventSheet
        open={Boolean(editEvent)}
        event={editEvent}
        events={events}
        currencySymbol={session.currency.symbol}
        onOpenChange={(open) => {
          if (!open) setEditId(null);
        }}
        onSave={(patch) => {
          if (!editEvent) return;
          void actions.patchEvent
            .mutateAsync({ session, eventId: editEvent.id, patch })
            .then(() => setEditId(null));
        }}
        onDelete={() => {
          if (!editEvent) return;
          void actions.removeEvent
            .mutateAsync({ session, eventId: editEvent.id })
            .then(() => setEditId(null));
        }}
      />
      <FinishSheet
        open={finishOpen}
        onOpenChange={setFinishOpen}
        session={session}
        invested={invested}
        entries={entries}
        pending={actions.finish.isPending}
        error={
          actions.finish.isError
            ? actions.finish.error instanceof Error
              ? actions.finish.error.message
              : "Не удалось сохранить результат"
            : null
        }
        onFinish={async (body) => {
          await actions.finish.mutateAsync({ session, body });
          navigate("/tracker");
        }}
        onCancel={async () => {
          const ok = await confirm({
            title: "Отменить сессию?",
            description: "Результат не сохранится в трекер",
            confirmLabel: "Отменить сессию",
            variant: "danger",
          });
          if (!ok) return;
          await actions.cancel.mutateAsync(session);
          setFinishOpen(false);
          navigate("/");
        }}
      />
    </div>
  );
}

function ManualTournamentSheet({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    name: string;
    venue?: string;
    buyin: string;
    currency_code: string;
    currency_symbol: string;
    started_at: string;
  }) => void;
}) {
  const currencies = useResultCurrencies({ enabled: open });
  const nowParts = toDatetimeLocalParts(new Date().toISOString());
  const [name, setName] = useState("");
  const [buyin, setBuyin] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState(nowParts.date);
  const [time, setTime] = useState(nowParts.time);

  useEffect(() => {
    if (open) {
      const parts = toDatetimeLocalParts(new Date().toISOString());
      setDate(parts.date);
      setTime(parts.time);
    }
  }, [open]);

  const symbol =
    currencies.data?.find((c) => c.code === currency)?.symbol ??
    (currency === "RUB" ? "₽" : currency);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Popup className="border-line-strong bg-surface fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92%] w-full max-w-[420px] rounded-t-[20px] border-t px-[18px] pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="bg-line-strong mx-auto mb-3 h-1 w-9 rounded-full" />
          <h2 className="text-lg font-extrabold">Турнир вручную</h2>
          <p className="text-ink-2 mb-3.5 text-[12.5px]">Если турнира нет в нашем расписании</p>
          <label className="mb-3 block">
            <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Название</span>
            <input
              className="border-line-strong bg-surface-2 h-12 w-full rounded-md border px-3.5 text-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Sunday Special"
            />
          </label>
          <div className="mb-3 flex gap-2.5">
            <div className="min-w-0 flex-1">
              <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Бай-ин</span>
              <LadderNumberStepper
                aria-label="Бай-ин"
                min={0}
                value={buyin}
                frameClassName="border-line-strong bg-surface-2 num h-12 w-full min-w-0 rounded-md border"
                className="text-base"
                onChange={setBuyin}
              />
            </div>
            <label className="w-[112px]">
              <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Валюта</span>
              <select
                className="border-line-strong bg-surface-2 h-12 w-full rounded-md border px-2 text-base"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {(currencies.data ?? [{ code: "RUB", symbol: "₽" }]).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mb-3 block">
            <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">
              Площадка <span className="text-ink-3 font-normal">· необязательно</span>
            </span>
            <input
              className="border-line-strong bg-surface-2 h-12 w-full rounded-md border px-3.5 text-base"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Клуб, казино, город"
            />
          </label>
          <div className="mb-4 flex gap-2.5">
            <label className="min-w-0 flex-1">
              <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Дата</span>
              <input
                type="date"
                className="border-line-strong bg-surface-2 num h-12 w-full rounded-md border px-3.5 text-base"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="w-[112px]">
              <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Старт</span>
              <input
                type="time"
                className="border-line-strong bg-surface-2 num h-12 w-full rounded-md border px-3.5 text-base"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              className="border-line-strong text-ink-2 flex h-[46px] flex-1 items-center justify-center rounded-md border text-[14.5px] font-extrabold"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!name.trim() || !buyin}
              className="bg-gold-grad text-ink-ongold flex h-[46px] flex-1 items-center justify-center rounded-md text-[14.5px] font-extrabold disabled:opacity-50"
              onClick={() =>
                onSubmit({
                  name: name.trim(),
                  venue: venue.trim() || undefined,
                  buyin,
                  currency_code: currency,
                  currency_symbol: symbol,
                  started_at: fromLocalParts(date, time),
                })
              }
            >
              Начать турнир
            </button>
          </div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function FinishSheet({
  open,
  onOpenChange,
  session,
  invested,
  entries,
  pending = false,
  error = null,
  onFinish,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: LocalLiveSession;
  invested: number;
  entries: number;
  pending?: boolean;
  error?: string | null;
  onFinish: (body: {
    in_the_money: boolean;
    place?: number | null;
    field_size?: number | null;
    payout: string;
  }) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [itm, setItm] = useState(true);
  const [place, setPlace] = useState("");
  const [field, setField] = useState("");
  const [payout, setPayout] = useState("");

  useEffect(() => {
    if (open) {
      setItm(true);
      setPlace("");
      setField("");
      setPayout("");
    }
  }, [open]);

  const payoutNum = itm ? Number(payout.replace(/\s/g, "") || 0) : 0;
  const profitValue = payoutNum - invested;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Popup className="border-line-strong bg-surface fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92%] w-full max-w-[420px] overflow-y-auto rounded-t-[20px] border-t px-[18px] pt-2.5 pb-[calc(18px+env(safe-area-inset-bottom))]">
          <div className="bg-line-strong mx-auto mb-3 h-1 w-9 rounded-full" />
          <h2 className="text-[19px] font-extrabold">Завершить турнир</h2>
          <p className="text-ink-2 mb-4 text-[13px]">
            Результат сохранится в трекер · {entries} входа,{" "}
            {formatMoney(String(invested), session.currency.symbol)}
          </p>
          <div className="mb-3.5 flex gap-2">
            <button
              type="button"
              className={cn(
                "border-line-strong bg-surface-2 text-ink-2 h-11 flex-1 rounded-md border text-sm font-bold",
                itm && "border-line-gold bg-gold-soft text-gold",
              )}
              onClick={() => setItm(true)}
            >
              В призах
            </button>
            <button
              type="button"
              className={cn(
                "border-line-strong bg-surface-2 text-ink-2 h-11 flex-1 rounded-md border text-sm font-bold",
                !itm && "border-line-gold bg-gold-soft text-gold",
              )}
              onClick={() => setItm(false)}
            >
              Без призов
            </button>
          </div>
          {itm ? (
            <>
              <div className="mb-3 flex gap-2.5">
                <label className="flex-1">
                  <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Место</span>
                  <input
                    className="border-line-strong bg-surface-2 num h-[50px] w-full rounded-md border px-3.5 text-base"
                    inputMode="numeric"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                  />
                </label>
                <label className="flex-1">
                  <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">
                    Из скольких
                  </span>
                  <input
                    className="border-line-strong bg-surface-2 num h-[50px] w-full rounded-md border px-3.5 text-base"
                    inputMode="numeric"
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                  />
                </label>
              </div>
              <div className="mb-3.5">
                <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Выплата</span>
                <LadderNumberStepper
                  aria-label="Выплата"
                  min={0}
                  value={payout}
                  frameClassName="border-line-strong bg-surface-2 num h-[50px] w-full min-w-0 rounded-md border"
                  className="text-base"
                  onChange={setPayout}
                />
              </div>
            </>
          ) : null}
          <div className="border-line-gold bg-surface-2 mb-3.5 flex items-center gap-2.5 rounded-md border px-3.5 py-3">
            <span className="text-ink-2 text-[12.5px]">Профит по турниру</span>
            <span
              className={cn(
                "num ml-auto text-[19px] font-extrabold",
                profitValue >= 0 ? "text-live" : "text-danger",
              )}
            >
              {signPrefix(profitValue)}
              {formatNumberRu(Math.abs(profitValue))} {session.currency.symbol}
            </span>
          </div>
          {error ? <p className="text-danger mb-3 text-sm">{error}</p> : null}
          <button
            type="button"
            disabled={pending}
            className="bg-gold-grad text-ink-ongold mb-2.5 flex h-[58px] w-full items-center justify-center rounded-md text-base font-extrabold disabled:opacity-50"
            onClick={() =>
              void onFinish({
                in_the_money: itm,
                place: itm && place ? Number(place) : null,
                field_size: itm && field ? Number(field) : null,
                payout: itm ? payout || "0" : "0",
              })
            }
          >
            {pending ? "Сохранение…" : "Завершить и сохранить"}
          </button>
          <button
            type="button"
            className="border-line-strong text-ink-2 flex h-[46px] w-full items-center justify-center rounded-md border text-[14.5px] font-extrabold"
            onClick={() => void onCancel()}
          >
            Отменить сессию без результата
          </button>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
