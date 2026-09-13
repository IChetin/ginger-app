import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { ChangeLogAdmin, EventAdmin, SeriesUpdatePayload } from "@/api/types/admin";
import type { NotificationPreviewResponse } from "@/api/types/notifications";
import type { SeriesStatus } from "@/api/types/schedule";
import { ApiError } from "@/api/client";
import { AdminCardList, AdminCardListStack } from "@/components/admin/AdminCardList";
import { AdminTable } from "@/components/admin/AdminTable";
import { EventEditModal } from "@/components/admin/EventEditModal";
import { OpenInAppLink } from "@/components/admin/OpenInAppLink";
import { SlugField } from "@/components/admin/SlugField";
import { adminInputClass } from "@/components/admin/FlightRowsEditor";
import { Modal } from "@/components/admin/Modal";
import { NotificationNotice } from "@/components/admin/NotificationNotice";
import { SearchInput } from "@/components/admin/SearchInput";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Toolbar, ToolbarHint, ToolbarSpacer } from "@/components/admin/Toolbar";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { SEED_CURRENCIES, SERIES_STATUS_TRANSITIONS } from "@/features/admin/constants";
import {
  useCreateEvent,
  useDeleteSeries,
  useOrganizersAdmin,
  usePreviewAdminSeries,
  useSeriesChangesAdmin,
  useSeriesDetailAdmin,
  useSeriesEventsAdmin,
  useUpdateSeries,
  useVenuesAdmin,
} from "@/features/admin/hooks";
import { isPreviewTokenError, previewTokenErrorMessage } from "@/features/admin/lib/previewSave";
import { downloadSeriesPdf } from "@/features/schedule/shareSeriesPdf";
import { formatGameType, formatMoney } from "@/features/schedule/lib/format";
import { SERIES_STATUS_LABELS } from "@/lib/statusLabels";
import { seriesPath } from "@/lib/paths";
import { buildSeriesSlugBase } from "@/lib/slugify";
import { cn } from "@/lib/utils";

function formatFlightStart(event: EventAdmin): string {
  const flight = event.flights[0];
  if (!flight) {
    return "—";
  }
  const date = new Date(flight.start_at.venue_local);
  if (Number.isNaN(date.getTime())) {
    return flight.start_at.venue_local.slice(0, 16);
  }
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventDayKey(event: EventAdmin): string | null {
  const flight = event.flights[0];
  if (!flight) {
    return null;
  }
  return flight.start_at.venue_local.slice(0, 10);
}

function formatDayOption(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function eventSubtitle(event: EventAdmin): string {
  const parts = [formatGameType(event.game_type), ...event.tags];
  if (event.flights.length > 1) {
    parts.push(`${event.flights.length} флайта`);
  }
  if (event.bookmarks_count > 0) {
    parts.push(`${event.bookmarks_count} в закладках`);
  }
  return parts.join(" · ");
}

function formatChangeTitle(entry: ChangeLogAdmin): string {
  const name =
    (typeof entry.new_value?.name === "string" && entry.new_value.name) ||
    (typeof entry.old_value?.name === "string" && entry.old_value.name) ||
    null;
  if (entry.change_type === "cancelled") {
    return name ? `${name} отменён` : "Отмена";
  }
  if (entry.change_type === "schedule_published") {
    return "Импорт / публикация сетки";
  }
  if (entry.change_type === "created") {
    return name ? `Создан: ${name}` : "Создание";
  }
  return name ? `${name} изменён` : `Обновление · ${entry.entity_type}`;
}

function formatChangeDetail(entry: ChangeLogAdmin): string {
  const bits: string[] = [];
  const oldStart = entry.old_value?.start_at;
  const newStart = entry.new_value?.start_at;
  if (typeof oldStart === "string" && typeof newStart === "string") {
    bits.push(`${oldStart.slice(11, 16)} → ${newStart.slice(11, 16)}`);
  }
  const when = new Date(entry.created_at);
  if (!Number.isNaN(when.getTime())) {
    bits.push(
      when.toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }
  if (entry.actor_email) {
    bits.push(entry.actor_email);
  }
  return bits.join(" · ") || "—";
}

function CreateEventDialog({
  seriesId,
  open,
  onClose,
  onCreated,
  onError,
}: {
  seriesId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const createEvent = useCreateEvent();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [buyin, setBuyin] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [guarantee, setGuarantee] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setName("");
    setNumber("");
    setBuyin("");
    setCurrencyCode("RUB");
    setGuarantee("");
  }, [open]);

  async function submit() {
    if (!name.trim() || !buyin.trim()) {
      onError("Укажите название и бай-ин");
      return;
    }
    try {
      await createEvent.mutateAsync({
        seriesId,
        body: {
          name: name.trim(),
          number: number.trim() ? Number(number) : null,
          buyin: buyin.trim(),
          currency_code: currencyCode,
          guarantee: guarantee.trim() || null,
        },
      });
      onCreated();
      onClose();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Не удалось создать турнир");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новый турнир"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="border-line-strong text-ink-2 hover:bg-surface-2 inline-flex h-[38px] items-center justify-center rounded-[10px] border bg-transparent px-4 text-sm font-bold"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={createEvent.isPending}
            onClick={() => void submit()}
            className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center justify-center rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-45"
          >
            Создать
          </button>
        </>
      }
    >
      <div className="flex gap-2.5">
        <div className="mb-3 flex-[2]">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Название</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={adminInputClass}
          />
        </div>
        <div className="mb-3 max-w-[80px]">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">№</label>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={cn(adminInputClass, "num")}
          />
        </div>
      </div>
      <div className="flex gap-2.5">
        <div className="mb-1 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Бай-ин</label>
          <input
            value={buyin}
            onChange={(e) => setBuyin(e.target.value)}
            className={cn(adminInputClass, "num")}
          />
        </div>
        <div className="mb-1 max-w-[110px]">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Валюта</label>
          <select
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            className={adminInputClass}
          >
            {SEED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-1 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Гарантия</label>
          <input
            value={guarantee}
            onChange={(e) => setGuarantee(e.target.value)}
            className={cn(adminInputClass, "num")}
          />
        </div>
      </div>
    </Modal>
  );
}

export function AdminSeriesDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDesktop = useAdminDesktop();

  const seriesQuery = useSeriesDetailAdmin(id);
  const eventsQuery = useSeriesEventsAdmin(id);
  const changesQuery = useSeriesChangesAdmin(id, 10);
  const venuesQuery = useVenuesAdmin({ limit: 100, offset: 0 });
  const organizersQuery = useOrganizersAdmin({ limit: 100, offset: 0 });

  const updateSeries = useUpdateSeries();
  const previewSeries = usePreviewAdminSeries();
  const deleteSeries = useDeleteSeries();

  const [eventSearch, setEventSearch] = useState("");
  const [dayFilter, setDayFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<EventAdmin | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const [name, setName] = useState("");
  const [organizerId, setOrganizerId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [status, setStatus] = useState<SeriesStatus>("announced");
  const [posterUrl, setPosterUrl] = useState("");
  const [slug, setSlug] = useState("");

  const [notify, setNotify] = useState(true);
  const [pendingPreview, setPendingPreview] = useState<{
    body: SeriesUpdatePayload;
    preview: NotificationPreviewResponse;
  } | null>(null);

  const series = seriesQuery.data;

  const deepEventId = searchParams.get("event");
  const dayParam = searchParams.get("day");
  useEffect(() => {
    if (!deepEventId || eventsQuery.isLoading || !eventsQuery.isSuccess) {
      return;
    }
    const found = (eventsQuery.data ?? []).find((event) => event.id === deepEventId);
    if (found) {
      setSelectedEvent(found);
    }
    setSearchParams(
      (prev) => {
        if (!prev.has("event")) {
          return prev;
        }
        const next = new URLSearchParams(prev);
        next.delete("event");
        return next;
      },
      { replace: true },
    );
  }, [
    deepEventId,
    eventsQuery.data,
    eventsQuery.isLoading,
    eventsQuery.isSuccess,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!series) {
      return;
    }
    setName(series.name);
    setOrganizerId(series.organizer_id);
    setVenueId(series.venue_id);
    setStartsOn(series.starts_on);
    setEndsOn(series.ends_on);
    setStatus(series.status);
    setPosterUrl(series.poster_url ?? "");
    setSlug(series.slug);
    setPendingPreview(null);
    setNotify(true);
  }, [series]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const events = eventsQuery.data ?? [];
  const dayOptions = useMemo(() => {
    const days = new Set<string>();
    for (const event of events) {
      const key = eventDayKey(event);
      if (key) {
        days.add(key);
      }
    }
    return [...days].sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase();
    return events.filter((event) => {
      if (dayFilter !== "all" && eventDayKey(event) !== dayFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        event.name.toLowerCase().includes(q) ||
        (event.number != null && String(event.number).includes(q)) ||
        event.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [events, eventSearch, dayFilter]);

  const flightsCount = events.reduce((sum, event) => sum + event.flights.length, 0);
  const selectedBookmarks = selectedEvent?.bookmarks_count ?? 0;
  const maxEventBookmarks = events.reduce((max, event) => Math.max(max, event.bookmarks_count), 0);

  const allowedStatuses = useMemo(() => {
    if (!series) {
      return SERIES_STATUS_TRANSITIONS.announced;
    }
    const next = SERIES_STATUS_TRANSITIONS[series.status] ?? [];
    return [series.status, ...next];
  }, [series]);

  async function saveSeries() {
    if (!series) {
      return;
    }
    if (pendingPreview) {
      try {
        await updateSeries.mutateAsync({
          id: series.id,
          body: pendingPreview.body,
          previewToken: pendingPreview.preview.preview_token,
          notify: notify && pendingPreview.preview.total_recipients > 0,
        });
        setPendingPreview(null);
        setToast("Серия сохранена");
      } catch (error) {
        setToast(
          isPreviewTokenError(error)
            ? previewTokenErrorMessage(error)
            : error instanceof ApiError
              ? error.message
              : "Не удалось сохранить серию",
        );
        setPendingPreview(null);
      }
      return;
    }

    if (!name.trim() || !organizerId || !venueId || !startsOn || !endsOn) {
      setToast("Заполните обязательные поля серии");
      return;
    }
    if (startsOn > endsOn) {
      setToast("Дата начала не может быть позже окончания");
      return;
    }

    const body: SeriesUpdatePayload = {
      name: name.trim(),
      slug: slug.trim() || null,
      organizer_id: organizerId,
      venue_id: venueId,
      starts_on: startsOn,
      ends_on: endsOn,
      status,
      poster_url: posterUrl.trim() || null,
    };

    try {
      const preview = await previewSeries.mutateAsync({ id: series.id, body });
      if (preview.requires_confirmation || preview.total_recipients > 0) {
        setPendingPreview({ body, preview });
        setNotify(preview.total_recipients > 0);
        return;
      }
      await updateSeries.mutateAsync({
        id: series.id,
        body,
        previewToken: preview.preview_token,
        notify: false,
      });
      setToast("Серия сохранена");
    } catch (error) {
      setToast(error instanceof ApiError ? error.message : "Не удалось сохранить серию");
    }
  }

  async function removeSeries() {
    if (!series) {
      return;
    }
    const ok = await confirm({
      title: "Удалить серию?",
      description:
        "Серия и её турниры будут удалены безвозвратно. Если есть закладки или результаты пользователей — удаление будет отклонено.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "danger",
    });
    if (!ok) {
      return;
    }
    try {
      await deleteSeries.mutateAsync(series.id);
      navigate("/admin/series");
    } catch (error) {
      setToast(error instanceof ApiError ? error.message : "Не удалось удалить серию");
    }
  }

  if (seriesQuery.isLoading) {
    return <div className="text-ink-3 px-6 py-8">Загрузка…</div>;
  }

  if (seriesQuery.isError || !series) {
    return (
      <div className="px-6 py-8">
        <div className="border-danger-soft bg-danger-soft text-danger rounded-[14px] border px-4 py-3 text-sm">
          {seriesQuery.error instanceof ApiError ? seriesQuery.error.message : "Серия не найдена"}
        </div>
        <button
          type="button"
          onClick={() => navigate("/admin/series")}
          className="text-gold mt-4 text-sm font-semibold"
        >
          ← К списку серий
        </button>
      </div>
    );
  }

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex items-center gap-3.5 border-b px-6 py-[18px]">
        <button
          type="button"
          onClick={() => navigate("/admin/series")}
          className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex size-[38px] items-center justify-center rounded-[10px] border bg-transparent"
          aria-label="Назад"
        >
          <svg
            className="size-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0">
          <div className="text-ink-3 mb-0.5 flex items-center gap-1.5 text-[13px]">
            <Link to="/admin/series" className="text-gold font-bold">
              Серии
            </Link>
            <span>/</span>
            <span className="truncate">{series.name}</span>
          </div>
          <div className="truncate text-xl font-extrabold">{series.name}</div>
        </div>
        <div className="flex-1" />
        <OpenInAppLink href={seriesPath(series, { day: dayParam })} />
        <button
          type="button"
          disabled={pdfBusy}
          onClick={() => {
            void (async () => {
              setPdfBusy(true);
              try {
                const outcome = await downloadSeriesPdf(series.id);
                if (outcome === "error") {
                  setToast("Не удалось создать PDF, попробуйте позже");
                }
              } finally {
                setPdfBusy(false);
              }
            })();
          }}
          className="border-line-gold text-ink hover:bg-gold-soft inline-flex h-[38px] items-center justify-center gap-[7px] rounded-[10px] border bg-transparent px-4 text-sm font-bold disabled:opacity-60"
        >
          {pdfBusy ? "Готовим PDF…" : "Скачать PDF"}
        </button>
        <Link
          to={`/admin/import?series_id=${series.id}`}
          className="border-line-gold text-ink hover:bg-gold-soft inline-flex h-[38px] items-center justify-center gap-[7px] rounded-[10px] border bg-transparent px-4 text-sm font-bold"
        >
          Догрузить файл
        </Link>
        <button
          type="button"
          onClick={() => setCreateEventOpen(true)}
          className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center justify-center gap-[7px] rounded-[10px] px-4 text-sm font-extrabold"
        >
          <svg
            className="size-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Турнир
        </button>
      </header>

      <div className="flex-1 px-6 pt-5 pb-10">
        <div
          className={cn(
            "grid items-start gap-5",
            isDesktop ? "grid-cols-[1fr_320px]" : "grid-cols-1",
          )}
        >
          <div>
            <Toolbar>
              <SearchInput
                value={eventSearch}
                onChange={setEventSearch}
                placeholder="Поиск по турнирам"
                className="min-w-[180px]"
              />
              <select
                value={dayFilter}
                onChange={(event) => setDayFilter(event.target.value)}
                className="border-line-strong bg-surface text-ink-2 h-9 cursor-pointer rounded-[10px] border px-2.5 text-[13px] font-semibold"
                aria-label="Фильтр по дню"
              >
                <option value="all">Все дни</option>
                {dayOptions.map((day) => (
                  <option key={day} value={day}>
                    {formatDayOption(day)}
                  </option>
                ))}
              </select>
              <ToolbarSpacer />
              <ToolbarHint className="num">
                {filteredEvents.length} турниров · {flightsCount} флайтов
              </ToolbarHint>
            </Toolbar>

            {eventsQuery.isError ? (
              <div className="border-danger-soft bg-danger-soft text-danger rounded-[14px] border px-4 py-3 text-sm">
                Не удалось загрузить турниры
              </div>
            ) : isDesktop ? (
              <AdminTable
                rows={filteredEvents}
                rowKey={(row) => row.id}
                loading={eventsQuery.isLoading}
                empty="Турниры не найдены"
                onRowClick={(row) => setSelectedEvent(row)}
                rowClassName={(row) => (row.status === "changed" ? "bg-warn-soft" : undefined)}
                columns={[
                  {
                    key: "number",
                    header: "№",
                    headerClassName: "w-[46px]",
                    cell: (event) => (
                      <span className="num text-ink-3 font-bold">{event.number ?? "—"}</span>
                    ),
                  },
                  {
                    key: "name",
                    header: "Турнир",
                    cell: (event) => (
                      <div>
                        <div className="text-sm font-bold">{event.name}</div>
                        <div className="text-ink-3 text-xs">{eventSubtitle(event)}</div>
                      </div>
                    ),
                  },
                  {
                    key: "start",
                    header: "Старт",
                    cell: (event) => (
                      <span className="num">
                        {formatFlightStart(event)}
                        {event.status === "changed" ? (
                          <span className="text-warn ml-1.5 text-xs font-semibold">перенесён</span>
                        ) : null}
                      </span>
                    ),
                  },
                  {
                    key: "buyin",
                    header: "Бай-ин",
                    headerClassName: "text-right",
                    className: "text-right",
                    cell: (event) => (
                      <span className="num">{formatMoney(event.buyin, event.currency.symbol)}</span>
                    ),
                  },
                  {
                    key: "guarantee",
                    header: "Гарантия",
                    headerClassName: "text-right",
                    className: "text-right",
                    cell: (event) => (
                      <span className="num text-ink-3">
                        {event.guarantee
                          ? formatMoney(event.guarantee, event.currency.symbol)
                          : "—"}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: "Статус",
                    cell: (event) => <StatusBadge kind="event" status={event.status} />,
                  },
                ]}
              />
            ) : (
              <AdminCardListStack loading={eventsQuery.isLoading} empty="Турниры не найдены">
                {filteredEvents.map((event) => (
                  <AdminCardList
                    key={event.id}
                    title={
                      <span>
                        {event.number != null ? `#${event.number} · ` : ""}
                        {event.name}
                      </span>
                    }
                    subtitle={eventSubtitle(event)}
                    badge={<StatusBadge kind="event" status={event.status} />}
                    className={event.status === "changed" ? "bg-warn-soft" : undefined}
                    fields={[
                      { label: "Старт", value: formatFlightStart(event) },
                      {
                        label: "Бай-ин",
                        value: formatMoney(event.buyin, event.currency.symbol),
                      },
                    ]}
                    onClick={() => setSelectedEvent(event)}
                  />
                ))}
              </AdminCardListStack>
            )}
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="border-line bg-surface rounded-[14px] border p-4">
              <div className="mb-3 text-[15px] font-extrabold">Параметры серии</div>
              <div className="mb-3">
                <label className="text-ink-2 mb-1 block text-xs font-semibold">Название</label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setPendingPreview(null);
                  }}
                  className={adminInputClass}
                />
              </div>
              <div className="mb-3">
                <label className="text-ink-2 mb-1 block text-xs font-semibold">Организатор</label>
                <select
                  value={organizerId}
                  onChange={(e) => {
                    setOrganizerId(e.target.value);
                    setPendingPreview(null);
                  }}
                  className={adminInputClass}
                >
                  {(organizersQuery.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="text-ink-2 mb-1 block text-xs font-semibold">Площадка</label>
                <select
                  value={venueId}
                  onChange={(e) => {
                    setVenueId(e.target.value);
                    setPendingPreview(null);
                  }}
                  className={adminInputClass}
                >
                  {(venuesQuery.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.city}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3 flex gap-2.5">
                <div className="min-w-0 flex-1">
                  <label className="text-ink-2 mb-1 block text-xs font-semibold">Начало</label>
                  <input
                    type="date"
                    value={startsOn}
                    onChange={(e) => {
                      setStartsOn(e.target.value);
                      setPendingPreview(null);
                    }}
                    className={cn(adminInputClass, "num")}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="text-ink-2 mb-1 block text-xs font-semibold">Конец</label>
                  <input
                    type="date"
                    value={endsOn}
                    onChange={(e) => {
                      setEndsOn(e.target.value);
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
                  onChange={(e) => {
                    setStatus(e.target.value as SeriesStatus);
                    setPendingPreview(null);
                  }}
                  className={adminInputClass}
                >
                  {allowedStatuses.map((value) => (
                    <option key={value} value={value}>
                      {SERIES_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <SlugField
                value={slug}
                onChange={setSlug}
                onSuggest={() => {
                  const organizer = (organizersQuery.data?.items ?? []).find(
                    (item) => item.id === organizerId,
                  );
                  const venue = (venuesQuery.data?.items ?? []).find((item) => item.id === venueId);
                  return buildSeriesSlugBase({
                    organizerSlug: organizer?.slug ?? series.organizer.slug,
                    city: venue?.city ?? series.venue.city,
                    startsOn: startsOn || series.starts_on,
                  });
                }}
                onDirty={() => setPendingPreview(null)}
              />
              <div className="mb-3">
                <label className="text-ink-2 mb-1 block text-xs font-semibold">Постер URL</label>
                <input
                  value={posterUrl}
                  onChange={(e) => {
                    setPosterUrl(e.target.value);
                    setPendingPreview(null);
                  }}
                  className={adminInputClass}
                  placeholder="https://…"
                />
              </div>
              {pendingPreview ? (
                <NotificationNotice
                  impacts={pendingPreview.preview.impacts}
                  totalRecipients={pendingPreview.preview.total_recipients}
                  notify={notify}
                  onNotifyChange={setNotify}
                />
              ) : null}
              <button
                type="button"
                disabled={updateSeries.isPending || previewSeries.isPending}
                onClick={() => void saveSeries()}
                className="bg-gold-grad text-ink-ongold mt-1 inline-flex h-[38px] w-full items-center justify-center rounded-[10px] text-sm font-extrabold disabled:opacity-45"
              >
                {pendingPreview
                  ? notify && pendingPreview.preview.total_recipients > 0
                    ? "Сохранить и уведомить"
                    : "Сохранить"
                  : "Сохранить"}
              </button>
              <button
                type="button"
                disabled={deleteSeries.isPending}
                onClick={() => void removeSeries()}
                className="border-danger/40 text-danger hover:bg-danger-soft mt-2.5 inline-flex h-[38px] w-full items-center justify-center rounded-[10px] border bg-transparent text-sm font-bold disabled:opacity-45"
              >
                {deleteSeries.isPending ? "Удаление…" : "Удалить серию"}
              </button>
            </div>

            <div className="border-line bg-surface rounded-[14px] border p-4">
              <div className="mb-3 text-[15px] font-extrabold">Подписчики</div>
              <div className="flex gap-[18px]">
                <div>
                  <div className="num text-xl font-extrabold">
                    {series.bookmarks_count.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-ink-3 text-[11px]">на серию</div>
                </div>
                <div>
                  <div className="num text-xl font-extrabold">
                    {(selectedEvent ? selectedBookmarks : maxEventBookmarks).toLocaleString(
                      "ru-RU",
                    )}
                  </div>
                  <div className="text-ink-3 text-[11px]">
                    {selectedEvent ? `на ${selectedEvent.name}` : "макс. на турнир"}
                  </div>
                </div>
              </div>
              <div className="text-ink-3 mt-2 text-[11px]">
                Изменения расписания уйдут им push-уведомлением
              </div>
            </div>

            <div className="border-line bg-surface rounded-[14px] border p-4">
              <div className="mb-3 text-[15px] font-extrabold">Последние изменения</div>
              {changesQuery.isLoading ? (
                <div className="text-ink-3 text-xs">Загрузка…</div>
              ) : (changesQuery.data ?? []).length === 0 ? (
                <div className="text-ink-3 text-xs">Пока нет записей</div>
              ) : (
                <div className="text-ink-2 flex flex-col gap-2 text-xs">
                  {(changesQuery.data ?? []).map((entry) => (
                    <div key={entry.id}>
                      <b className="text-ink font-bold">{formatChangeTitle(entry)}</b>
                      <br />
                      {formatChangeDetail(entry)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <EventEditModal
        event={selectedEvent}
        seriesSlug={series.slug}
        open={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        onSuccess={setToast}
        onError={setToast}
        onSaved={() => {
          void eventsQuery.refetch();
          void changesQuery.refetch();
          void seriesQuery.refetch();
        }}
      />

      <CreateEventDialog
        seriesId={series.id}
        open={createEventOpen}
        onClose={() => setCreateEventOpen(false)}
        onCreated={() => {
          setToast("Турнир создан");
          void eventsQuery.refetch();
        }}
        onError={setToast}
      />

      {toast ? (
        <div
          role="status"
          className="border-line-strong bg-surface shadow-elevated fixed right-4 bottom-4 z-[60] max-w-sm rounded-[10px] border px-4 py-3 text-sm font-semibold"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
