import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { EventAdmin, EventUpdatePayload, FlightUpsert } from "@/api/types/admin";
import type {
  NotificationPreviewImpact,
  NotificationPreviewResponse,
} from "@/api/types/notifications";
import type { EventStatus, GameType } from "@/api/types/schedule";
import { ApiError } from "@/api/client";
import {
  adminInputClass,
  FlightRowsEditor,
  type FlightRowValue,
} from "@/components/admin/FlightRowsEditor";
import { Modal } from "@/components/admin/Modal";
import { NotificationNotice } from "@/components/admin/NotificationNotice";
import { OpenInAppLink } from "@/components/admin/OpenInAppLink";
import { SEED_CURRENCIES } from "@/features/admin/constants";
import {
  usePreviewAdminEvent,
  usePreviewAdminFlights,
  useReplaceFlights,
  useUpdateEvent,
} from "@/features/admin/hooks";
import { fromDatetimeLocalInput, toDatetimeLocalInput } from "@/features/admin/lib/datetime";
import { isPreviewTokenError, previewTokenErrorMessage } from "@/features/admin/lib/previewSave";
import { formatGameType, formatMoney } from "@/features/schedule/lib/format";
import { eventPath } from "@/lib/paths";
import { cn } from "@/lib/utils";

interface Props {
  event: EventAdmin | null;
  seriesSlug: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}

function flightToRow(flight: EventAdmin["flights"][number]): FlightRowValue {
  const local = toDatetimeLocalInput(flight.start_at.venue_local);
  const [date = "", time = ""] = local.split("T");
  return {
    id: flight.id,
    label: flight.label ?? "",
    date,
    time: time.slice(0, 5),
  };
}

function rowsToUpserts(rows: FlightRowValue[]): FlightUpsert[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.label.trim() || null,
    start_at: fromDatetimeLocalInput(`${row.date}T${row.time || "00:00"}`),
  }));
}

function buildEventPayload(
  _event: EventAdmin,
  form: {
    number: string;
    name: string;
    buyin: string;
    currency_code: string;
    guarantee: string;
    game_type: GameType;
    start_stack: string;
    start_blinds: string;
    late_reg_level: string;
    status: EventStatus;
  },
): EventUpdatePayload {
  return {
    number: form.number.trim() ? Number(form.number) : null,
    name: form.name.trim(),
    buyin: form.buyin.trim(),
    currency_code: form.currency_code,
    guarantee: form.guarantee.trim() || null,
    game_type: form.game_type,
    start_stack: form.start_stack.trim() ? Number(form.start_stack) : null,
    start_blinds: form.start_blinds.trim() || null,
    late_reg_level: form.late_reg_level.trim() ? Number(form.late_reg_level) : null,
    status: form.status,
  };
}

function eventChanged(original: EventAdmin, payload: EventUpdatePayload): boolean {
  return (
    (payload.number ?? null) !== (original.number ?? null) ||
    payload.name !== original.name ||
    payload.buyin !== original.buyin ||
    payload.currency_code !== original.currency_code ||
    (payload.guarantee ?? null) !== (original.guarantee ?? null) ||
    payload.game_type !== original.game_type ||
    (payload.start_stack ?? null) !== (original.start_stack ?? null) ||
    (payload.start_blinds ?? null) !== (original.start_blinds ?? null) ||
    (payload.late_reg_level ?? null) !== (original.late_reg_level ?? null) ||
    payload.status !== original.status
  );
}

function flightsChanged(original: EventAdmin, items: FlightUpsert[]): boolean {
  if (original.flights.length !== items.length) {
    return true;
  }
  return items.some((item, index) => {
    const prev = original.flights[index];
    if (!prev) {
      return true;
    }
    const prevLocal = toDatetimeLocalInput(prev.start_at.venue_local);
    const nextLocal = item.start_at.length === 19 ? item.start_at.slice(0, 16) : item.start_at;
    return (
      (item.id ?? undefined) !== prev.id ||
      (item.label ?? null) !== (prev.label ?? null) ||
      nextLocal !== prevLocal
    );
  });
}

export function EventEditModal({ event, seriesSlug, open, onClose, onSaved, onError, onSuccess }: Props) {
  const updateEvent = useUpdateEvent();
  const replaceFlights = useReplaceFlights();
  const previewEvent = usePreviewAdminEvent();
  const previewFlights = usePreviewAdminFlights();

  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [buyin, setBuyin] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [guarantee, setGuarantee] = useState("");
  const [gameType, setGameType] = useState<GameType>("nlh");
  const [startStack, setStartStack] = useState("");
  const [startBlinds, setStartBlinds] = useState("");
  const [lateRegLevel, setLateRegLevel] = useState("");
  const [status, setStatus] = useState<EventStatus>("scheduled");
  const [flightRows, setFlightRows] = useState<FlightRowValue[]>([
    { label: "", date: "", time: "" },
  ]);

  const [notify, setNotify] = useState(true);
  const [pendingPreview, setPendingPreview] = useState<{
    eventPreview?: NotificationPreviewResponse;
    flightsPreview?: NotificationPreviewResponse;
    eventBody?: EventUpdatePayload;
    flightItems?: FlightUpsert[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!event || !open) {
      return;
    }
    setNumber(event.number != null ? String(event.number) : "");
    setName(event.name);
    setBuyin(event.buyin);
    setCurrencyCode(event.currency_code);
    setGuarantee(event.guarantee ?? "");
    setGameType(event.game_type);
    setStartStack(event.start_stack != null ? String(event.start_stack) : "");
    setStartBlinds(event.start_blinds ?? "");
    setLateRegLevel(event.late_reg_level != null ? String(event.late_reg_level) : "");
    setStatus(event.status);
    setFlightRows(
      event.flights.length > 0
        ? event.flights.map(flightToRow)
        : [{ label: "", date: "", time: "" }],
    );
    setNotify(true);
    setPendingPreview(null);
  }, [event, open]);

  const impacts = useMemo((): NotificationPreviewImpact[] => {
    if (!pendingPreview) {
      return [];
    }
    return [
      ...(pendingPreview.eventPreview?.impacts ?? []),
      ...(pendingPreview.flightsPreview?.impacts ?? []),
    ];
  }, [pendingPreview]);

  const totalRecipients = useMemo(() => {
    if (!pendingPreview) {
      return 0;
    }
    return Math.max(
      pendingPreview.eventPreview?.total_recipients ?? 0,
      pendingPreview.flightsPreview?.total_recipients ?? 0,
    );
  }, [pendingPreview]);

  function close() {
    setPendingPreview(null);
    onClose();
  }

  async function commitSave(options: {
    eventBody?: EventUpdatePayload;
    flightItems?: FlightUpsert[];
    eventToken?: string;
    flightsToken?: string;
    notifyFlag: boolean;
  }) {
    if (!event) {
      return;
    }
    setSaving(true);
    try {
      if (options.eventBody && options.eventToken) {
        await updateEvent.mutateAsync({
          id: event.id,
          body: options.eventBody,
          previewToken: options.eventToken,
          notify: options.notifyFlag,
        });
      }
      if (options.flightItems && options.flightsToken) {
        await replaceFlights.mutateAsync({
          eventId: event.id,
          seriesId: event.series_id,
          items: options.flightItems,
          previewToken: options.flightsToken,
          notify: options.notifyFlag,
        });
      }
      onSuccess?.("Турнир сохранён");
      onSaved?.();
      close();
    } catch (error) {
      const message = isPreviewTokenError(error)
        ? previewTokenErrorMessage(error)
        : error instanceof ApiError
          ? error.message
          : "Не удалось сохранить турнир";
      onError?.(message);
      setPendingPreview(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!event) {
      return;
    }
    if (pendingPreview) {
      await commitSave({
        eventBody: pendingPreview.eventBody,
        flightItems: pendingPreview.flightItems,
        eventToken: pendingPreview.eventPreview?.preview_token,
        flightsToken: pendingPreview.flightsPreview?.preview_token,
        notifyFlag: notify && totalRecipients > 0,
      });
      return;
    }

    const form = {
      number,
      name,
      buyin,
      currency_code: currencyCode,
      guarantee,
      game_type: gameType,
      start_stack: startStack,
      start_blinds: startBlinds,
      late_reg_level: lateRegLevel,
      status,
    };
    if (!form.name.trim() || !form.buyin.trim()) {
      onError?.("Заполните название и бай-ин");
      return;
    }
    for (const row of flightRows) {
      if (!row.date || !row.time) {
        onError?.("Укажите дату и время каждого флайта");
        return;
      }
    }

    const eventBody = buildEventPayload(event, form);
    const flightItems = rowsToUpserts(flightRows);
    const needEvent = eventChanged(event, eventBody);
    const needFlights = flightsChanged(event, flightItems);

    if (!needEvent && !needFlights) {
      close();
      return;
    }

    setSaving(true);
    try {
      let eventPreview: NotificationPreviewResponse | undefined;
      let flightsPreview: NotificationPreviewResponse | undefined;

      if (needEvent) {
        eventPreview = await previewEvent.mutateAsync({ id: event.id, body: eventBody });
      }
      if (needFlights) {
        flightsPreview = await previewFlights.mutateAsync({
          eventId: event.id,
          items: flightItems,
        });
      }

      const requiresConfirmation =
        Boolean(eventPreview?.requires_confirmation) ||
        Boolean(flightsPreview?.requires_confirmation);
      const recipients = Math.max(
        eventPreview?.total_recipients ?? 0,
        flightsPreview?.total_recipients ?? 0,
      );

      if (requiresConfirmation || recipients > 0) {
        setPendingPreview({
          eventPreview,
          flightsPreview,
          eventBody: needEvent ? eventBody : undefined,
          flightItems: needFlights ? flightItems : undefined,
        });
        setNotify(recipients > 0);
        return;
      }

      await commitSave({
        eventBody: needEvent ? eventBody : undefined,
        flightItems: needFlights ? flightItems : undefined,
        eventToken: eventPreview?.preview_token,
        flightsToken: flightsPreview?.preview_token,
        notifyFlag: false,
      });
    } catch (error) {
      onError?.(error instanceof ApiError ? error.message : "Не удалось получить превью изменений");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelEvent() {
    if (!event || event.status === "cancelled") {
      return;
    }
    setStatus("cancelled");
    setPendingPreview(null);
  }

  if (!event) {
    return null;
  }

  const title = `Турнир${event.number != null ? ` #${event.number}` : ""} · ${event.name}`;
  const busy = saving || updateEvent.isPending || replaceFlights.isPending;

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      titleAction={
        <OpenInAppLink
          href={eventPath(event, { slug: seriesSlug })}
          className="size-8 shrink-0 rounded-[8px]"
        />
      }
      className="w-[min(560px,92vw)]"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleCancelEvent()}
            disabled={busy || status === "cancelled"}
            className="border-danger-soft text-danger inline-flex h-8 items-center justify-center rounded-[8px] border bg-transparent px-[11px] text-[13px] font-bold disabled:opacity-45"
          >
            Отменить турнир
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={close}
            className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex h-[38px] items-center justify-center rounded-[10px] border bg-transparent px-4 text-sm font-bold"
          >
            Закрыть
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center justify-center rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-45"
          >
            {pendingPreview
              ? notify && totalRecipients > 0
                ? "Сохранить и уведомить"
                : "Сохранить"
              : "Сохранить"}
          </button>
        </div>
      }
    >
      <div className="flex gap-2.5">
        <div className="mb-3 flex-[2] flex-col gap-[5px]">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Название</label>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setPendingPreview(null);
            }}
            className={adminInputClass}
          />
        </div>
        <div className="mb-3 max-w-[80px] flex-col gap-[5px]">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">№</label>
          <input
            value={number}
            onChange={(event) => {
              setNumber(event.target.value);
              setPendingPreview(null);
            }}
            className={cn(adminInputClass, "num")}
          />
        </div>
      </div>

      <div className="flex gap-2.5">
        <div className="mb-3 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Бай-ин</label>
          <input
            value={buyin}
            onChange={(event) => {
              setBuyin(event.target.value);
              setPendingPreview(null);
            }}
            className={cn(adminInputClass, "num")}
          />
        </div>
        <div className="mb-3 max-w-[110px]">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Валюта</label>
          <select
            value={currencyCode}
            onChange={(event) => {
              setCurrencyCode(event.target.value);
              setPendingPreview(null);
            }}
            className={adminInputClass}
          >
            {SEED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Гарантия</label>
          <input
            value={guarantee}
            onChange={(event) => {
              setGuarantee(event.target.value);
              setPendingPreview(null);
            }}
            className={cn(adminInputClass, "num")}
          />
        </div>
      </div>

      <div className="flex gap-2.5">
        <div className="mb-3 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Дисциплина</label>
          <select
            value={gameType}
            onChange={(event) => {
              setGameType(event.target.value as GameType);
              setPendingPreview(null);
            }}
            className={adminInputClass}
          >
            {(["nlh", "plo", "plo5", "mixed", "other"] as const).map((value) => (
              <option key={value} value={value}>
                {formatGameType(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Стек</label>
          <input
            value={startStack}
            onChange={(event) => {
              setStartStack(event.target.value);
              setPendingPreview(null);
            }}
            className={cn(adminInputClass, "num")}
          />
        </div>
        <div className="mb-3 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Стартовые блайнды</label>
          <input
            value={startBlinds}
            onChange={(event) => {
              setStartBlinds(event.target.value);
              setPendingPreview(null);
            }}
            placeholder="100/200/200"
            className={cn(adminInputClass, "num")}
          />
        </div>
        <div className="mb-3 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Late reg до ур.</label>
          <input
            value={lateRegLevel}
            onChange={(event) => {
              setLateRegLevel(event.target.value);
              setPendingPreview(null);
            }}
            className={cn(adminInputClass, "num")}
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="text-ink-2 mb-1 block text-xs font-semibold">Статус</label>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as EventStatus);
            setPendingPreview(null);
          }}
          className={adminInputClass}
        >
          <option value="scheduled">Опубликован</option>
          <option value="changed">Изменён</option>
          <option value="cancelled">Отменён</option>
        </select>
      </div>

      <div className="mb-1">
        <label className="text-ink-2 mb-1 block text-xs font-semibold">Флайты</label>
        <FlightRowsEditor
          rows={flightRows}
          onChange={(rows) => {
            setFlightRows(rows);
            setPendingPreview(null);
          }}
        />
      </div>

      <div className="mt-3">
        <Link
          to={`/admin/events/${event.id}`}
          className="text-gold text-[13px] font-semibold hover:underline"
          onClick={close}
        >
          Открыть полностью
        </Link>
        <div className="text-ink-3 mt-1 text-[11px]">
          Сейчас: {formatMoney(event.buyin, event.currency.symbol)} ·{" "}
          {event.bookmarks_count.toLocaleString("ru-RU")} в закладках
        </div>
      </div>

      {pendingPreview ? (
        <NotificationNotice
          impacts={impacts}
          totalRecipients={totalRecipients}
          notify={notify}
          onNotifyChange={setNotify}
        />
      ) : null}
    </Modal>
  );
}
