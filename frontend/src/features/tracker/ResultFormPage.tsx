import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { LiveEventRead } from "@/api/types/live";
import type { ResultEvent, ResultEventWrite } from "@/api/types/tracker";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { LadderNumberStepper } from "@/components/ui/NumberStepper";
import { EditEventSheet } from "@/features/live/components/EditEventSheet";
import { EventTimeline } from "@/features/live/components/EventTimeline";
import { NoteSheet } from "@/features/live/components/NoteSheet";
import { entriesCount, investedTotal } from "@/features/live/lib/calc";
import { eventDetailQueryOptions } from "@/features/schedule/api/queries";
import { formatMoney } from "@/features/schedule/lib/format";
import {
  useCreateResult,
  useDeleteResult,
  useResult,
  useResultCurrencies,
  useUpdateResult,
} from "@/features/tracker/hooks";
import { formatNumberRu, signPrefix } from "@/lib/money";
import { cn } from "@/lib/utils";

const iconClass =
  "h-[18px] w-[18px] stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

function newId(): string {
  return crypto.randomUUID();
}

function toTimelineEvents(events: ResultEvent[]): LiveEventRead[] {
  return events;
}

function makeEntryEvent(
  amount: string,
  currencyCode: string,
  occurredAt = new Date().toISOString(),
): ResultEvent {
  const now = new Date().toISOString();
  return {
    id: newId(),
    type: "entry",
    amount,
    currency_code: currencyCode,
    text: null,
    occurred_at: occurredAt,
    created_at: now,
  };
}

function makeReentryEvent(
  amount: string,
  currencyCode: string,
  occurredAt = new Date().toISOString(),
): ResultEvent {
  const now = new Date().toISOString();
  return {
    id: newId(),
    type: "reentry",
    amount,
    currency_code: currencyCode,
    text: null,
    occurred_at: occurredAt,
    created_at: now,
  };
}

function makeNoteEvent(text: string, occurredAt: string): ResultEvent {
  const now = new Date().toISOString();
  return {
    id: newId(),
    type: "note",
    amount: null,
    currency_code: null,
    text,
    occurred_at: occurredAt,
    created_at: now,
  };
}

function eventsToWrite(events: ResultEvent[]): ResultEventWrite[] {
  return events.map((item) => ({
    id: item.id,
    type: item.type,
    occurred_at: item.occurred_at,
    ...(item.amount != null ? { amount: item.amount } : {}),
    ...(item.currency_code ? { currency_code: item.currency_code } : {}),
    ...(item.text ? { text: item.text } : {}),
  }));
}

function optionalInt(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function ResultFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const { resultId } = useParams<{ resultId: string }>();
  const [searchParams] = useSearchParams();
  const stateEventId = (location.state as { event_id?: string } | null)?.event_id;
  const eventId = searchParams.get("event_id") ?? stateEventId ?? null;
  const isEdit = Boolean(resultId);

  const existing = useResult(resultId, { enabled: isEdit });
  const eventQuery = useQuery({
    ...eventDetailQueryOptions(eventId ?? ""),
    enabled: Boolean(eventId) && !isEdit,
  });
  const currenciesQuery = useResultCurrencies({ enabled: true });

  const createResult = useCreateResult();
  const updateResult = useUpdateResult();
  const deleteResult = useDeleteResult();

  const linked = Boolean(eventId) || Boolean(existing.data?.event_id);
  const [name, setName] = useState("");
  const [venueText, setVenueText] = useState("");
  const [seriesText, setSeriesText] = useState("");
  const [playedOn, setPlayedOn] = useState("");
  const [buyin, setBuyin] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [events, setEvents] = useState<ResultEvent[]>([]);
  const [itm, setItm] = useState(true);
  const [place, setPlace] = useState("");
  const [fieldSize, setFieldSize] = useState("");
  const [payout, setPayout] = useState("0");
  const [noteOpen, setNoteOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(false);
  }, [resultId]);

  useEffect(() => {
    if (isEdit && existing.data && !hydrated) {
      const row = existing.data;
      setName(row.name);
      setVenueText(row.venue_text ?? "");
      setSeriesText(row.series_text ?? "");
      setPlayedOn(row.played_on);
      setBuyin(row.buyin);
      setCurrencyCode(row.currency_code);
      setEvents(row.events?.length ? row.events : [makeEntryEvent(row.buyin, row.currency_code)]);
      const hasPayout = Number(row.payout) > 0 || row.place != null;
      setItm(hasPayout);
      setPlace(row.place?.toString() ?? "");
      setFieldSize(row.field_size?.toString() ?? "");
      setPayout(row.payout);
      setHydrated(true);
    }
  }, [existing.data, hydrated, isEdit]);

  useEffect(() => {
    if (isEdit || hydrated) return;
    if (eventId && eventQuery.data) {
      const event = eventQuery.data;
      setName(event.number != null ? `#${event.number} ${event.name}` : event.name);
      setVenueText(event.venue.name);
      setSeriesText(event.series.name);
      setBuyin(event.buyin);
      setCurrencyCode(event.currency.code);
      setPlayedOn("");
      setEvents([makeEntryEvent(event.buyin, event.currency.code)]);
      setHydrated(true);
      return;
    }
    if (!eventId && !isEdit) {
      setEvents((prev) => (prev.length ? prev : [makeEntryEvent(buyin || "0", currencyCode)]));
      setHydrated(true);
    }
  }, [buyin, currencyCode, eventId, eventQuery.data, hydrated, isEdit]);

  const currencySymbol = useMemo(() => {
    const fromApi = currenciesQuery.data?.find((item) => item.code === currencyCode)?.symbol;
    if (fromApi) return fromApi;
    if (eventQuery.data?.currency.code === currencyCode) return eventQuery.data.currency.symbol;
    return currencyCode;
  }, [currenciesQuery.data, currencyCode, eventQuery.data]);

  const timeline = toTimelineEvents(events);
  const invested = investedTotal(timeline);
  const entries = entriesCount(timeline);
  const editEvent = timeline.find((item) => item.id === editId) ?? null;
  const payoutNum = itm ? Number(payout.replace(/\s/g, "") || 0) : 0;
  const profitValue = payoutNum - invested;

  const mutationError =
    createResult.error instanceof ApiError
      ? createResult.error.message
      : updateResult.error instanceof ApiError
        ? updateResult.error.message
        : deleteResult.error instanceof ApiError
          ? deleteResult.error.message
          : null;

  const syncEntryAmount = (nextBuyin: string, nextCurrency: string) => {
    setEvents((prev) =>
      prev.map((item) =>
        item.type === "entry"
          ? { ...item, amount: nextBuyin || "0", currency_code: nextCurrency }
          : item.type === "reentry" && item.amount === buyin
            ? { ...item, amount: nextBuyin || "0", currency_code: nextCurrency }
            : item.type !== "note"
              ? { ...item, currency_code: nextCurrency }
              : item,
      ),
    );
  };

  const persistChronology = async (next: ResultEvent[]) => {
    const previous = events;
    setEvents(next);
    if (!isEdit || !resultId) return;
    try {
      await updateResult.mutateAsync({
        resultId,
        body: { events: eventsToWrite(next) },
      });
    } catch {
      setEvents(previous);
    }
  };

  const handleSave = async () => {
    setFormError(null);
    if (entries < 1) {
      setFormError("Нужен хотя бы один вход");
      return;
    }
    if (!linked) {
      if (!name.trim()) {
        setFormError("Укажите название");
        return;
      }
      if (!playedOn) {
        setFormError("Укажите дату");
        return;
      }
      if (!buyin.trim()) {
        setFormError("Укажите бай-ин");
        return;
      }
    }
    const placeValue = itm ? optionalInt(place) : null;
    const fieldValue = itm ? optionalInt(fieldSize) : null;
    const payoutValue = itm ? payout || "0" : "0";
    const eventsPayload = eventsToWrite(events);

    try {
      if (isEdit && resultId) {
        if (linked) {
          await updateResult.mutateAsync({
            resultId,
            body: {
              played_on: playedOn || null,
              payout: payoutValue,
              place: placeValue,
              field_size: fieldValue,
              events: eventsPayload,
            },
          });
        } else {
          await updateResult.mutateAsync({
            resultId,
            body: {
              name: name.trim(),
              venue_text: venueText.trim() || null,
              series_text: seriesText.trim() || null,
              played_on: playedOn,
              buyin,
              currency_code: currencyCode,
              payout: payoutValue,
              place: placeValue,
              field_size: fieldValue,
              events: eventsPayload,
            },
          });
        }
      } else if (linked && eventId) {
        await createResult.mutateAsync({
          event_id: eventId,
          played_on: playedOn || null,
          payout: payoutValue,
          place: placeValue,
          field_size: fieldValue,
          events: eventsPayload,
        });
      } else {
        await createResult.mutateAsync({
          name: name.trim(),
          venue_text: venueText.trim() || null,
          series_text: seriesText.trim() || null,
          played_on: playedOn,
          buyin,
          currency_code: currencyCode,
          payout: payoutValue,
          place: placeValue,
          field_size: fieldValue,
          events: eventsPayload,
        });
      }
      void navigate("/tracker");
    } catch {
      // error surfaces via mutationError
    }
  };

  const handleDelete = async () => {
    if (!resultId) return;
    const ok = await confirm({
      title: "Удалить результат?",
      description: "Запись исчезнет из трекера и статистики",
      confirmLabel: "Удалить",
      variant: "danger",
    });
    if (!ok) return;
    await deleteResult.mutateAsync(resultId);
    void navigate("/tracker");
  };

  if (isEdit && existing.isLoading) {
    return <p className="text-ink-2 px-4 py-16 text-center text-sm">Загрузка…</p>;
  }

  if (isEdit && existing.isError) {
    return (
      <div className="px-4 pt-16 text-center">
        <p className="text-danger text-sm">Не удалось загрузить результат</p>
        <Link to="/tracker" className="text-gold mt-4 inline-block text-sm font-bold">
          ← К трекеру
        </Link>
      </div>
    );
  }

  const title = linked ? name || "Результат" : name.trim() || "Новый результат";
  const subtitleParts = [seriesText, venueText, playedOn].filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col" data-testid="result-form-page">
      <header className="border-line flex items-center gap-2.5 border-b px-3.5 py-3">
        <button
          type="button"
          aria-label="Назад"
          className="bg-surface-2 text-ink-2 inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
          onClick={() => navigate("/tracker")}
        >
          <svg className={iconClass} viewBox="0 0 24 24">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold">{title}</div>
          {subtitleParts.length ? (
            <div className="text-ink-3 mt-px truncate text-[11.5px]">
              {subtitleParts.join(" · ")}
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-4">
        {!linked ? (
          <div className="mx-3.5 mt-3.5 space-y-2.5">
            <label className="block">
              <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Название</span>
              <input
                className="border-line-strong bg-surface-2 h-12 w-full rounded-md border px-3.5 text-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название турнира"
              />
            </label>
            <div className="flex gap-2.5">
              <label className="min-w-0 flex-1">
                <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Серия</span>
                <input
                  className="border-line-strong bg-surface-2 h-12 w-full rounded-md border px-3.5 text-base"
                  value={seriesText}
                  onChange={(e) => setSeriesText(e.target.value)}
                />
              </label>
              <label className="min-w-0 flex-1">
                <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">
                  Площадка
                </span>
                <input
                  className="border-line-strong bg-surface-2 h-12 w-full rounded-md border px-3.5 text-base"
                  value={venueText}
                  onChange={(e) => setVenueText(e.target.value)}
                />
              </label>
            </div>
            <div className="flex gap-2.5">
              <div className="min-w-0 flex-1">
                <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Бай-ин</span>
                <LadderNumberStepper
                  aria-label="Бай-ин"
                  min={0}
                  value={buyin}
                  frameClassName="border-line-strong bg-surface-2 num h-12 w-full min-w-0 rounded-md border"
                  className="text-base"
                  onChange={(next) => {
                    setBuyin(next);
                    syncEntryAmount(next, currencyCode);
                  }}
                />
              </div>
              <label className="w-[112px]">
                <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Валюта</span>
                <select
                  className="border-line-strong bg-surface-2 h-12 w-full rounded-md border px-2 text-base"
                  value={currencyCode}
                  onChange={(e) => {
                    setCurrencyCode(e.target.value);
                    syncEntryAmount(buyin, e.target.value);
                  }}
                >
                  {(currenciesQuery.data ?? [{ code: "RUB", symbol: "₽" }]).map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Дата</span>
              <input
                type="date"
                className="border-line-strong bg-surface-2 num h-12 w-full rounded-md border px-3.5 text-base"
                value={playedOn}
                onChange={(e) => setPlayedOn(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="mx-3.5 mt-3.5">
            <label className="block">
              <span className="text-ink-2 mb-1.5 block text-[12.5px] font-semibold">Дата</span>
              <input
                type="date"
                className="border-line-strong bg-surface-2 num h-12 w-full rounded-md border px-3.5 text-base"
                value={playedOn}
                onChange={(e) => setPlayedOn(e.target.value)}
              />
              <p className="text-ink-3 mt-1 text-[11.5px]">
                Пустая дата при создании — сервер подставит дату первого флайта
              </p>
            </label>
          </div>
        )}

        <div className="border-line-gold bg-surface mx-3.5 mt-3.5 rounded-lg border px-4 pt-4 pb-3.5 text-center">
          <div className="text-gold text-[11px] font-extrabold tracking-[0.12em] uppercase">
            Вложено в турнир
          </div>
          <div className="num mt-1 text-[38px] leading-none font-extrabold tracking-tight">
            {formatMoney(String(invested), currencySymbol)}
          </div>
          <div className="text-ink-2 num mt-1.5 text-[12.5px]">
            Бай-ин {formatMoney(buyin || "0", currencySymbol)} ·{" "}
            <b className="text-ink font-bold">{entries} входа</b>
          </div>
        </div>

        <div className="mx-3.5 mt-3 flex gap-2.5">
          <button
            type="button"
            className="bg-gold-grad text-ink-ongold shadow-sheen flex h-14 flex-1 items-center justify-center gap-2 rounded-md text-[15.5px] font-extrabold"
            onClick={() => {
              const next = [...events, makeReentryEvent(buyin || "0", currencyCode)];
              void persistChronology(next).catch(() => undefined);
            }}
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

        <div className="mx-3.5 mt-5">
          <EventTimeline events={timeline} currencySymbol={currencySymbol} onEdit={setEditId} />
        </div>

        <div className="mx-3.5 mt-5">
          <h3 className="text-ink-3 mb-2 text-[13px] font-bold tracking-[0.06em] uppercase">
            Результат
          </h3>
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
                    value={fieldSize}
                    onChange={(e) => setFieldSize(e.target.value)}
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
              {formatNumberRu(Math.abs(profitValue))} {currencySymbol}
            </span>
          </div>
        </div>

        {formError || mutationError ? (
          <p className="text-danger mx-3.5 mb-2 text-sm">{formError ?? mutationError}</p>
        ) : null}
      </div>

      <div className="border-line bg-surface border-t px-3.5 pt-2.5 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={createResult.isPending || updateResult.isPending}
          className="bg-gold-grad text-ink-ongold flex h-12 w-full items-center justify-center rounded-md text-[14.5px] font-extrabold disabled:opacity-50"
          onClick={() => void handleSave()}
        >
          {createResult.isPending || updateResult.isPending ? "Сохранение…" : "Сохранить"}
        </button>
        {isEdit ? (
          <button
            type="button"
            disabled={deleteResult.isPending}
            className="text-danger mt-2 flex h-11 w-full items-center justify-center text-[14px] font-bold disabled:opacity-50"
            onClick={() => void handleDelete()}
          >
            Удалить результат
          </button>
        ) : null}
      </div>

      <NoteSheet
        open={noteOpen}
        onOpenChange={setNoteOpen}
        saveLabel={isEdit ? "Сохранить" : "Добавить"}
        onSave={(text, occurredAt) => {
          const next = [...events, makeNoteEvent(text, occurredAt)];
          setNoteOpen(false);
          void persistChronology(next).catch(() => undefined);
        }}
      />
      <EditEventSheet
        open={Boolean(editEvent)}
        event={editEvent}
        events={timeline}
        currencySymbol={currencySymbol}
        onOpenChange={(open) => {
          if (!open) setEditId(null);
        }}
        onSave={(patch) => {
          if (!editEvent) return;
          const next = events.map((item) =>
            item.id === editEvent.id
              ? {
                  ...item,
                  amount: patch.amount ?? item.amount,
                  text: patch.text ?? item.text,
                  occurred_at: patch.occurred_at ?? item.occurred_at,
                }
              : item,
          );
          setEditId(null);
          void persistChronology(next).catch(() => undefined);
        }}
        onDelete={() => {
          if (!editEvent) return;
          if (editEvent.type === "entry" && events.filter((e) => e.type === "entry").length <= 1) {
            return;
          }
          const next = events.filter((item) => item.id !== editEvent.id);
          setEditId(null);
          void persistChronology(next).catch(() => undefined);
        }}
      />
    </div>
  );
}
