import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type {
  BlindLevelUpsert,
  ChangeLogAdmin,
  EventAdmin,
  EventUpdatePayload,
  FlightUpsert,
} from "@/api/types/admin";
import type {
  NotificationPreviewImpact,
  NotificationPreviewResponse,
} from "@/api/types/notifications";
import type { EventStatus, GameType } from "@/api/types/schedule";
import { ApiError } from "@/api/client";
import { adminInputClass } from "@/components/admin/FlightRowsEditor";
import { Modal } from "@/components/admin/Modal";
import { SlugField } from "@/components/admin/SlugField";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { useConfirm, usePrompt } from "@/components/ui/ConfirmDialog";
import { countryFlag } from "@/components/series/seriesDisplay";
import {
  isSeriesPublished,
  SEED_CURRENCIES,
  SUGGESTED_EVENT_TAGS,
} from "@/features/admin/constants";
import {
  useDuplicateEvent,
  useEventAdmin,
  useEventChangesAdmin,
  usePreviewAdminEvent,
  usePreviewAdminFlights,
  useReplaceBlindLevels,
  useReplaceFlights,
  useSeriesDetailAdmin,
  useSeriesEventsAdmin,
  useUpdateEvent,
} from "@/features/admin/hooks";
import { useUploadImport } from "@/features/admin/import/hooks";
import { fromDatetimeLocalInput, toDatetimeLocalInput } from "@/features/admin/lib/datetime";
import { isPreviewTokenError, previewTokenErrorMessage } from "@/features/admin/lib/previewSave";
import { formatDateRange, formatGameType } from "@/features/schedule/lib/format";
import {
  normalizeStructureSetLabel,
  structureSetLabels,
} from "@/features/schedule/lib/structureSets";
import { formatUtcOffset } from "@/lib/timezoneOffset";
import { eventPath } from "@/lib/paths";
import { buildEventSlugBase } from "@/lib/slugify";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

import { runEventChecks } from "@/pages/admin/event-detail/eventChecks";

type EventTab = "params" | "structure" | "history";

type ReentryMode = "1" | "2" | "unlimited" | "freezeout";

interface FlightRowValue {
  id?: string;
  label: string;
  date: string;
  time: string;
  bookmarks_count: number;
}

interface BlindRowValue {
  id?: string;
  structure_set_label: string;
  level_no: number;
  sb: string;
  bb: string;
  ante: string;
  minutes: number;
  is_break: boolean;
  is_late_reg_end: boolean;
}

const TAB_LABELS: Record<EventTab, string> = {
  params: "Параметры",
  structure: "Структура",
  history: "История",
};

const cellInputClass =
  "h-8 w-full rounded-[8px] border border-transparent bg-transparent px-2 text-[13px] text-ink num outline-none hover:border-line-strong hover:bg-surface-2 focus:border-gold focus:bg-surface-2 disabled:pointer-events-none disabled:opacity-70";

function useWideLayout(minWidth = 1000): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.matchMedia(`(min-width: ${minWidth}px)`).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${minWidth}px)`);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [minWidth]);

  return matches;
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  return Number(value.replace(/\s/g, ""));
}

function tagLabel(value: string): string {
  return SUGGESTED_EVENT_TAGS.find((item) => item.value === value)?.label ?? value;
}

function reentryFromEvent(event: EventAdmin): ReentryMode {
  if (event.reentry_unlimited) {
    return "unlimited";
  }
  if (event.reentry_count === 0) {
    return "freezeout";
  }
  if (event.reentry_count === 1) {
    return "1";
  }
  if (event.reentry_count === 2) {
    return "2";
  }
  return "1";
}

function reentryToPayload(
  mode: ReentryMode,
): Pick<EventUpdatePayload, "reentry_count" | "reentry_unlimited"> {
  switch (mode) {
    case "unlimited":
      return { reentry_count: null, reentry_unlimited: true };
    case "freezeout":
      return { reentry_count: 0, reentry_unlimited: false };
    case "2":
      return { reentry_count: 2, reentry_unlimited: false };
    default:
      return { reentry_count: 1, reentry_unlimited: false };
  }
}

function flightToRow(flight: EventAdmin["flights"][number]): FlightRowValue {
  const local = toDatetimeLocalInput(flight.start_at.venue_local);
  const [date = "", time = ""] = local.split("T");
  return {
    id: flight.id,
    label: flight.label ?? "",
    date,
    time: time.slice(0, 5),
    bookmarks_count: flight.bookmarks_count,
  };
}

function rowsToUpserts(rows: FlightRowValue[], multiple: boolean): FlightUpsert[] {
  return rows.map((row) => ({
    id: row.id || undefined,
    label: multiple ? row.label.trim() || null : null,
    start_at: fromDatetimeLocalInput(`${row.date}T${row.time || "00:00"}`),
  }));
}

function blindsToPayload(rows: BlindRowValue[]): BlindLevelUpsert[] {
  return rows.map((row) => ({
    id: row.id || undefined,
    structure_set_label: normalizeStructureSetLabel(row.structure_set_label),
    level_no: row.level_no,
    sb: row.is_break ? null : parseOptionalInt(row.sb),
    bb: row.is_break ? null : parseOptionalInt(row.bb),
    ante: row.is_break ? null : parseOptionalInt(row.ante),
    minutes: row.minutes,
    is_break: row.is_break,
    is_late_reg_end: row.is_late_reg_end,
  }));
}

function renumberBlindLevels(rows: BlindRowValue[]): BlindRowValue[] {
  return rows.map((row, index) => ({ ...row, level_no: index + 1 }));
}

function displayLevelAt(rows: BlindRowValue[], index: number): number | null {
  let level = 0;
  for (let i = 0; i <= index; i += 1) {
    const row = rows[i];
    if (!row || row.is_break) {
      continue;
    }
    level += 1;
    if (i === index) {
      return level;
    }
  }
  return null;
}

function countNonBreakLevels(rows: BlindRowValue[]): number {
  return rows.filter((row) => !row.is_break).length;
}

function buildEventPayload(params: {
  slug: string;
  number: string;
  name: string;
  buyin: string;
  buyinBounty: string;
  currencyCode: string;
  guarantee: string;
  gameType: GameType;
  tags: string[];
  startStack: string;
  startBlinds: string;
  lateRegLevel: string;
  dayEndNote: string;
  reentryMode: ReentryMode;
  status: EventStatus;
  notes: string;
}): EventUpdatePayload {
  return {
    slug: params.slug.trim() || null,
    number: params.number.trim() ? Number(params.number) : null,
    name: params.name.trim(),
    buyin: params.buyin.trim(),
    buyin_bounty: params.buyinBounty.trim() || null,
    currency_code: params.currencyCode.toUpperCase(),
    guarantee: params.guarantee.trim() || null,
    game_type: params.gameType,
    tags: params.tags,
    start_stack: params.startStack.trim() ? Number(params.startStack) : null,
    start_blinds: params.startBlinds.trim() || null,
    late_reg_level: params.lateRegLevel.trim() ? Number(params.lateRegLevel) : null,
    day_end_note: params.dayEndNote.trim() || null,
    ...reentryToPayload(params.reentryMode),
    status: params.status,
    notes: params.notes.trim() || null,
  };
}

function eventPayloadChanged(original: EventAdmin, payload: EventUpdatePayload): boolean {
  const tagsEqual = JSON.stringify(payload.tags ?? []) === JSON.stringify(original.tags);
  return (
    (payload.slug ?? null) !== (original.slug ?? null) ||
    (payload.number ?? null) !== (original.number ?? null) ||
    payload.name !== original.name ||
    payload.buyin !== original.buyin ||
    (payload.buyin_bounty ?? null) !== (original.buyin_bounty ?? null) ||
    payload.currency_code !== original.currency_code ||
    (payload.guarantee ?? null) !== (original.guarantee ?? null) ||
    payload.game_type !== original.game_type ||
    !tagsEqual ||
    (payload.start_stack ?? null) !== (original.start_stack ?? null) ||
    (payload.start_blinds ?? null) !== (original.start_blinds ?? null) ||
    (payload.reentry_count ?? null) !== (original.reentry_count ?? null) ||
    payload.reentry_unlimited !== original.reentry_unlimited ||
    (payload.late_reg_level ?? null) !== (original.late_reg_level ?? null) ||
    (payload.day_end_note ?? null) !== (original.day_end_note ?? null) ||
    payload.status !== original.status ||
    (payload.notes ?? null) !== (original.notes ?? null)
  );
}

function flightsPayloadChanged(original: EventAdmin, items: FlightUpsert[]): boolean {
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

function blindsPayloadChanged(original: EventAdmin, rows: BlindRowValue[]): boolean {
  const payload = blindsToPayload(rows);
  if (original.blind_levels.length !== payload.length) {
    return true;
  }
  return payload.some((item, index) => {
    const prev = original.blind_levels[index];
    if (!prev) {
      return true;
    }
    return (
      (item.id ?? undefined) !== prev.id ||
      item.level_no !== prev.level_no ||
      normalizeStructureSetLabel(item.structure_set_label) !==
        normalizeStructureSetLabel(prev.structure_set_label) ||
      (item.sb ?? null) !== (prev.sb ?? null) ||
      (item.bb ?? null) !== (prev.bb ?? null) ||
      (item.ante ?? null) !== (prev.ante ?? null) ||
      item.minutes !== prev.minutes ||
      item.is_break !== prev.is_break ||
      Boolean(item.is_late_reg_end) !== prev.is_late_reg_end
    );
  });
}

function formatChangeWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) {
    return `сегодня ${time}`;
  }
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatChangeTitle(entry: ChangeLogAdmin): string {
  if (entry.entity_type === "flight") {
    const label = entry.flight_label ?? "флайт";
    if (entry.change_type === "created") {
      return `Добавлен флайт ${label}`;
    }
    if (entry.old_value?.start_at != null || entry.new_value?.start_at != null) {
      return `Перенесено время ${label}`;
    }
  }
  if (entry.change_type === "cancelled") {
    return "Турнир отменён";
  }
  if (entry.change_type === "created" && entry.via_import) {
    return "Турнир создан импортом";
  }
  if (entry.old_value?.guarantee != null || entry.new_value?.guarantee != null) {
    return "Изменена гарантия";
  }
  if (entry.old_value?.blind_levels != null || entry.new_value?.blind_levels != null) {
    return "Загружена структура блайндов";
  }
  if (entry.old_value?.start_at != null || entry.new_value?.start_at != null) {
    const label = entry.flight_label ?? "флайта";
    return `Перенесено время ${label}`;
  }
  if (entry.change_type === "created") {
    return "Турнир создан";
  }
  return "Изменение турнира";
}

function formatScalar(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function formatChangeDiff(entry: ChangeLogAdmin, symbol: string): string {
  const keys = ["start_at", "guarantee", "buyin", "name"] as const;
  for (const key of keys) {
    const oldRaw = entry.old_value?.[key];
    const newRaw = entry.new_value?.[key];
    if (oldRaw === undefined && newRaw === undefined) {
      continue;
    }
    if (oldRaw === newRaw) {
      continue;
    }
    const oldText = formatScalar(oldRaw);
    const newText = formatScalar(newRaw);
    if (key === "guarantee" && (oldText || newText)) {
      return `${oldText ? `${oldText} ${symbol}` : "—"} → ${newText ? `${newText} ${symbol}` : "—"}`;
    }
    if (oldText || newText) {
      return `${oldText ?? "—"} → ${newText ?? "—"}`;
    }
  }
  if (entry.change_type === "created" && entry.entity_type === "flight") {
    const start = formatScalar(entry.new_value?.start_at);
    if (start) {
      const date =
        typeof entry.new_value?.start_at === "string" ? new Date(entry.new_value.start_at) : null;
      const datePart =
        date && !Number.isNaN(date.getTime())
          ? date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
          : "";
      return `${datePart}${datePart ? ", " : ""}${start}`;
    }
  }
  if (entry.new_value?.blind_levels != null) {
    const count = Array.isArray(entry.new_value.blind_levels)
      ? entry.new_value.blind_levels.length
      : null;
    if (count != null) {
      return `${count} уровней`;
    }
  }
  if (entry.via_import) {
    const filename =
      (typeof entry.new_value?.source_filename === "string" && entry.new_value.source_filename) ||
      "";
    const parser = (typeof entry.new_value?.parser === "string" && entry.new_value.parser) || "";
    return [filename, parser ? `парсер ${parser}` : ""].filter(Boolean).join(" · ");
  }
  return "";
}

function formatNotificationStatus(entry: ChangeLogAdmin): string {
  const sent = entry.notifications_sent ?? 0;
  if (sent > 0) {
    return `отправлено ${sent} уведомлений`;
  }
  if (entry.notified_at) {
    return "отправлено";
  }
  if (entry.change_type === "created" && entry.via_import) {
    return "";
  }
  return "без рассылки";
}

function CopyStructureModal({
  open,
  events,
  currentEventId,
  onClose,
  onSelect,
}: {
  open: boolean;
  events: EventAdmin[];
  currentEventId: string;
  onClose: () => void;
  onSelect: (event: EventAdmin) => void;
}) {
  const candidates = events.filter(
    (item) => item.id !== currentEventId && item.blind_levels.length > 0,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Скопировать структуру"
      className="w-[min(480px,92vw)]"
    >
      {candidates.length === 0 ? (
        <p className="text-ink-2 text-sm">В серии нет других турниров со структурой.</p>
      ) : (
        <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
          {candidates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="border-line hover:bg-surface-2 rounded-[10px] border px-3 py-2.5 text-left"
            >
              <div className="text-sm font-bold">
                {item.number != null ? `#${item.number} ` : ""}
                {item.name}
              </div>
              <div className="text-ink-3 text-xs">
                {item.blind_levels.filter((level) => !level.is_break).length} уровней
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function AdminEventDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdminDesktop = useAdminDesktop();
  const isWide = useWideLayout(1000);

  const eventQuery = useEventAdmin(id);
  const event = eventQuery.data;
  const seriesQuery = useSeriesDetailAdmin(event?.series_id ?? "");
  const series = seriesQuery.data;
  const eventsQuery = useSeriesEventsAdmin(event?.series_id ?? "");
  const changesQuery = useEventChangesAdmin(id);
  const published = series ? isSeriesPublished(series.status) : false;

  const updateEvent = useUpdateEvent();
  const previewEvent = usePreviewAdminEvent();
  const replaceFlights = useReplaceFlights();
  const previewFlights = usePreviewAdminFlights();
  const replaceBlinds = useReplaceBlindLevels();
  const duplicateEvent = useDuplicateEvent();
  const uploadImport = useUploadImport();

  const importInputRef = useRef<HTMLInputElement>(null);
  const previewRequestRef = useRef(0);

  const tabParam = searchParams.get("tab");
  const activeTab: EventTab =
    tabParam === "structure" || tabParam === "history" ? tabParam : "params";

  const [number, setNumber] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [buyin, setBuyin] = useState("");
  const [buyinBounty, setBuyinBounty] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [guarantee, setGuarantee] = useState("");
  const [gameType, setGameType] = useState<GameType>("nlh");
  const [tags, setTags] = useState<string[]>([]);
  const [startStack, setStartStack] = useState("");
  const [startBlinds, setStartBlinds] = useState("");
  const [lateRegLevel, setLateRegLevel] = useState("");
  const [dayEndNote, setDayEndNote] = useState("");
  const [reentryMode, setReentryMode] = useState<ReentryMode>("1");
  const [status, setStatus] = useState<EventStatus>("scheduled");
  const [notes, setNotes] = useState("");
  const [flightRows, setFlightRows] = useState<FlightRowValue[]>([
    { label: "", date: "", time: "", bookmarks_count: 0 },
  ]);
  const [blindRows, setBlindRows] = useState<BlindRowValue[]>([]);
  const [activeStructureSet, setActiveStructureSet] = useState("default");

  const [notify, setNotify] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyStructureOpen, setCopyStructureOpen] = useState(false);
  const [previewState, setPreviewState] = useState<{
    eventPreview?: NotificationPreviewResponse;
    flightsPreview?: NotificationPreviewResponse;
    eventBody?: EventUpdatePayload;
    flightItems?: FlightUpsert[];
  } | null>(null);

  const resetFromEvent = useCallback((source: EventAdmin) => {
    setNumber(source.number != null ? String(source.number) : "");
    setSlug(source.slug);
    setName(source.name);
    setBuyin(source.buyin);
    setBuyinBounty(source.buyin_bounty ?? "");
    setCurrencyCode(source.currency_code);
    setGuarantee(source.guarantee ?? "");
    setGameType(source.game_type);
    setTags([...source.tags]);
    setStartStack(source.start_stack != null ? String(source.start_stack) : "");
    setStartBlinds(source.start_blinds ?? "");
    setLateRegLevel(source.late_reg_level != null ? String(source.late_reg_level) : "");
    setDayEndNote(source.day_end_note ?? "");
    setReentryMode(reentryFromEvent(source));
    setStatus(source.status);
    setNotes(source.notes ?? "");
    setFlightRows(
      source.flights.length > 0
        ? source.flights.map(flightToRow)
        : [{ label: "", date: "", time: "", bookmarks_count: 0 }],
    );
    setBlindRows(
      source.blind_levels.map((level) => ({
        id: level.id,
        structure_set_label: normalizeStructureSetLabel(level.structure_set_label),
        level_no: level.level_no,
        sb: level.sb?.toString() ?? "",
        bb: level.bb?.toString() ?? "",
        ante: level.ante?.toString() ?? "",
        minutes: level.minutes,
        is_break: level.is_break,
        is_late_reg_end: level.is_late_reg_end,
      })),
    );
    const labels = structureSetLabels(source.blind_levels);
    setActiveStructureSet(labels[0] ?? "default");
    setPreviewState(null);
    setNotify(true);
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (!event) {
      return;
    }
    resetFromEvent(event);
  }, [event, resetFromEvent]);

  const eventBody = useMemo(
    () =>
      buildEventPayload({
        slug,
        number,
        name,
        buyin,
        buyinBounty,
        currencyCode,
        guarantee,
        gameType,
        tags,
        startStack,
        startBlinds,
        lateRegLevel,
        dayEndNote,
        reentryMode,
        status,
        notes,
      }),
    [
      slug,
      number,
      name,
      buyin,
      buyinBounty,
      currencyCode,
      guarantee,
      gameType,
      tags,
      startStack,
      startBlinds,
      lateRegLevel,
      dayEndNote,
      reentryMode,
      status,
      notes,
    ],
  );

  const multipleFlights = flightRows.length > 1;
  const flightItems = useMemo(
    () => rowsToUpserts(flightRows, multipleFlights),
    [flightRows, multipleFlights],
  );

  const eventDirty = event ? eventPayloadChanged(event, eventBody) : false;
  const flightsDirty = event ? flightsPayloadChanged(event, flightItems) : false;
  const blindsDirty = event ? blindsPayloadChanged(event, blindRows) : false;
  const dirty = eventDirty || flightsDirty || blindsDirty;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // BrowserRouter has no data-router useBlocker — intercept in-app link clicks instead.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash !== window.location.hash
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        const ok = await confirmRef.current({
          title: "Уйти без сохранения?",
          description: "Несохранённые правки турнира будут потеряны.",
          confirmLabel: "Уйти",
          cancelLabel: "Остаться",
          variant: "danger",
        });
        if (!ok) {
          return;
        }
        dirtyRef.current = false;
        navigate(`${url.pathname}${url.search}${url.hash}`);
      })();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);

  useEffect(() => {
    if (!event || !dirty || (!eventDirty && !flightsDirty)) {
      return;
    }
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    const timer = window.setTimeout(async () => {
      try {
        let eventPreview: NotificationPreviewResponse | undefined;
        let flightsPreview: NotificationPreviewResponse | undefined;
        if (eventDirty) {
          eventPreview = await previewEvent.mutateAsync({ id: event.id, body: eventBody });
        }
        if (flightsDirty) {
          flightsPreview = await previewFlights.mutateAsync({
            eventId: event.id,
            items: flightItems,
          });
        }
        if (previewRequestRef.current !== requestId) {
          return;
        }
        setPreviewState({
          eventPreview,
          flightsPreview,
          eventBody: eventDirty ? eventBody : undefined,
          flightItems: flightsDirty ? flightItems : undefined,
        });
      } catch {
        if (previewRequestRef.current === requestId) {
          setPreviewState(null);
        }
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    dirty,
    event,
    eventDirty,
    flightsDirty,
    eventBody,
    flightItems,
    previewEvent,
    previewFlights,
  ]);

  const impacts = useMemo((): NotificationPreviewImpact[] => {
    if (!previewState) {
      return [];
    }
    return [
      ...(previewState.eventPreview?.impacts ?? []),
      ...(previewState.flightsPreview?.impacts ?? []),
    ];
  }, [previewState]);

  const totalRecipients = useMemo(() => {
    if (!previewState) {
      return 0;
    }
    return Math.max(
      previewState.eventPreview?.total_recipients ?? 0,
      previewState.flightsPreview?.total_recipients ?? 0,
    );
  }, [previewState]);

  const previewNoticeText = useMemo(() => {
    if (impacts.length === 0) {
      if (totalRecipients > 0) {
        return `${totalRecipients} подписчиков получат уведомление`;
      }
      return null;
    }
    const first = impacts[0]!;
    const detail = first.body ? `: ${first.body}` : "";
    return `${first.title}${detail}`;
  }, [impacts, totalRecipients]);

  const checks = useMemo(() => {
    if (!event || !series) {
      return [];
    }
    return runEventChecks({
      flights: flightRows,
      seriesStartsOn: series.starts_on,
      seriesEndsOn: series.ends_on,
      eventNumber: number.trim() ? Number(number) : null,
      eventId: event.id,
      siblingEvents: eventsQuery.data ?? [],
      blindLevels: blindRows,
    });
  }, [event, series, flightRows, number, blindRows, eventsQuery.data]);

  const nearestFlightBookmarks = useMemo(() => {
    const now = Date.now();
    const upcoming = flightRows
      .filter((row) => row.date)
      .map((row) => ({
        row,
        ts: new Date(`${row.date}T${row.time || "00:00"}`).getTime(),
      }))
      .filter((item) => !Number.isNaN(item.ts) && item.ts >= now)
      .sort((a, b) => a.ts - b.ts);
    return upcoming[0]?.row.bookmarks_count ?? flightRows[0]?.bookmarks_count ?? 0;
  }, [flightRows]);

  const totalBookmarks = event?.bookmarks_count ?? 0;
  const activeSetLabel = normalizeStructureSetLabel(activeStructureSet);
  const visibleBlindIndexes = blindRows
    .map((row, index) =>
      normalizeStructureSetLabel(row.structure_set_label) === activeSetLabel ? index : -1,
    )
    .filter((index) => index >= 0);
  const structureLevelCount = countNonBreakLevels(
    visibleBlindIndexes.map((index) => blindRows[index]!),
  );
  const setLabels = structureSetLabels(blindRows);
  const lateRegLevelNum = lateRegLevel.trim() ? Number(lateRegLevel) : null;
  const currencySymbol = event?.currency.symbol ?? currencyCode;

  function setTab(next: EventTab) {
    setSearchParams({ tab: next }, { replace: true });
  }

  function markDirtyResetPreview() {
    setPreviewState(null);
    setSaveError(null);
  }

  function updateFlightRow(index: number, patch: Partial<FlightRowValue>) {
    setFlightRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    markDirtyResetPreview();
  }

  function removeFlightRow(index: number) {
    if (flightRows.length <= 1) {
      return;
    }
    setFlightRows((rows) => rows.filter((_, i) => i !== index));
    markDirtyResetPreview();
  }

  function addFlightRow() {
    setFlightRows((rows) => [...rows, { label: "", date: "", time: "", bookmarks_count: 0 }]);
    markDirtyResetPreview();
  }

  function updateBlindRow(index: number, patch: Partial<BlindRowValue>) {
    setBlindRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    markDirtyResetPreview();
  }

  function insertBlindRow(afterIndex: number | null, isBreak: boolean) {
    setBlindRows((rows) => {
      const insertAt = afterIndex == null ? rows.length : afterIndex + 1;
      const next = [...rows];
      next.splice(insertAt, 0, {
        structure_set_label: activeSetLabel,
        level_no: insertAt + 1,
        sb: "",
        bb: "",
        ante: "",
        minutes: isBreak ? 15 : 40,
        is_break: isBreak,
        is_late_reg_end: false,
      });
      return renumberBlindLevels(next);
    });
    markDirtyResetPreview();
  }

  function removeBlindRow(index: number) {
    setBlindRows((rows) => renumberBlindLevels(rows.filter((_, i) => i !== index)));
    markDirtyResetPreview();
  }

  function fillAllDurations() {
    void (async () => {
      const raw = await prompt({
        title: "Длительность уровня",
        description: "Одинаковая длительность для всех уровней активного сета, в минутах.",
        defaultValue: "40",
        confirmLabel: "Применить",
        cancelLabel: "Отмена",
        inputType: "number",
        inputMode: "numeric",
      });
      if (raw === null || !raw.trim()) {
        return;
      }
      const minutes = Number(raw);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return;
      }
      setBlindRows((rows) =>
        rows.map((row) =>
          normalizeStructureSetLabel(row.structure_set_label) === activeSetLabel
            ? { ...row, minutes }
            : row,
        ),
      );
      markDirtyResetPreview();
    })();
  }

  function addTag(value: string) {
    const trimmed = value.trim();
    if (!trimmed || tags.includes(trimmed)) {
      return;
    }
    setTags((prev) => [...prev, trimmed]);
    markDirtyResetPreview();
  }

  function removeTag(value: string) {
    setTags((prev) => prev.filter((tag) => tag !== value));
    markDirtyResetPreview();
  }

  function handleAddTagClick() {
    void (async () => {
      const suggested = SUGGESTED_EVENT_TAGS.filter((item) => !tags.includes(item.value));
      const labels = suggested.map((item) => `${item.label} (${item.value})`).join(", ");
      const raw = await prompt({
        title: "Добавить тег",
        description: labels
          ? `Подсказки: ${labels}`
          : "Введите value тега (латиница, без пробелов).",
        defaultValue: suggested[0]?.value ?? "",
        confirmLabel: "Добавить",
        cancelLabel: "Отмена",
      });
      if (raw) {
        addTag(raw);
      }
    })();
  }

  async function handleSave() {
    if (!event) {
      return;
    }
    setSaveError(null);

    if (!name.trim() || !buyin.trim()) {
      setSaveError("Заполните название и бай-ин");
      return;
    }
    for (const row of flightRows) {
      if (!row.date || !row.time) {
        setSaveError("Укажите дату и время каждого флайта");
        return;
      }
    }

    try {
      if (blindsDirty) {
        await replaceBlinds.mutateAsync({
          eventId: event.id,
          seriesId: event.series_id,
          items: blindsToPayload(blindRows),
        });
      }

      const needEvent = eventDirty;
      const needFlights = flightsDirty;

      if (needEvent || needFlights) {
        let eventPreview: NotificationPreviewResponse | undefined;
        let flightsPreview: NotificationPreviewResponse | undefined;

        // Always refresh preview tokens at save time to avoid stale tokens.
        if (needEvent) {
          eventPreview = await previewEvent.mutateAsync({ id: event.id, body: eventBody });
        }
        if (needFlights) {
          flightsPreview = await previewFlights.mutateAsync({
            eventId: event.id,
            items: flightItems,
          });
        }

        const recipients = Math.max(
          eventPreview?.total_recipients ?? 0,
          flightsPreview?.total_recipients ?? 0,
        );

        if (needEvent && eventPreview) {
          await updateEvent.mutateAsync({
            id: event.id,
            body: eventBody,
            previewToken: eventPreview.preview_token,
            notify: notify && recipients > 0,
          });
        }
        if (needFlights && flightsPreview) {
          await replaceFlights.mutateAsync({
            eventId: event.id,
            seriesId: event.series_id,
            items: flightItems,
            previewToken: flightsPreview.preview_token,
            notify: notify && recipients > 0,
          });
        }
      }

      setPreviewState(null);
    } catch (error) {
      setSaveError(
        isPreviewTokenError(error)
          ? previewTokenErrorMessage(error)
          : error instanceof ApiError
            ? error.message
            : "Не удалось сохранить",
      );
      setPreviewState(null);
    }
  }

  async function handleCancelEvent() {
    if (!event || status === "cancelled") {
      return;
    }
    setSaveError(null);
    const body: EventUpdatePayload = { ...eventBody, status: "cancelled" };
    try {
      const preview = await previewEvent.mutateAsync({ id: event.id, body });
      const recipients = preview.total_recipients;
      const recipientsPhrase =
        recipients > 0
          ? `${recipients} ${pluralRu(recipients, "подписчик", "подписчика", "подписчиков")} получат уведомление.`
          : "Подписчиков нет — уведомление никому не уйдёт.";
      const ok = await confirm({
        title: "Отменить турнир?",
        description: `Турнир будет отмечен как отменённый. ${recipientsPhrase}`,
        confirmLabel: "Отменить турнир",
        cancelLabel: "Не отменять",
        variant: "danger",
        onConfirm: async () => {
          await updateEvent.mutateAsync({
            id: event.id,
            body,
            previewToken: preview.preview_token,
            notify: recipients > 0 && notify,
          });
        },
      });
      if (!ok) {
        return;
      }
      setStatus("cancelled");
      setPreviewState(null);
    } catch (error) {
      setSaveError(
        isPreviewTokenError(error)
          ? previewTokenErrorMessage(error)
          : error instanceof ApiError
            ? error.message
            : "Не удалось отменить турнир",
      );
    }
  }

  async function handleDuplicate() {
    if (!event) {
      return;
    }
    try {
      const copy = await duplicateEvent.mutateAsync(event.id);
      navigate(`/admin/events/${copy.id}`);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : "Не удалось дублировать");
    }
  }

  async function handleImportFile(file: File) {
    if (!event) {
      return;
    }
    try {
      const job = await uploadImport.mutateAsync({
        file,
        importKind: "structures",
        seriesId: event.series_id,
      });
      navigate(`/admin/import/${job.id}`);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : "Не удалось загрузить файл");
    }
  }

  function handleCopyStructure(source: EventAdmin) {
    setBlindRows(
      source.blind_levels.map((level) => ({
        structure_set_label: normalizeStructureSetLabel(level.structure_set_label),
        level_no: level.level_no,
        sb: level.sb?.toString() ?? "",
        bb: level.bb?.toString() ?? "",
        ante: level.ante?.toString() ?? "",
        minutes: level.minutes,
        is_break: level.is_break,
        is_late_reg_end: level.is_late_reg_end,
      })),
    );
    const labels = structureSetLabels(source.blind_levels);
    setActiveStructureSet(labels[0] ?? "default");
    setCopyStructureOpen(false);
    markDirtyResetPreview();
    setTab("structure");
  }

  if (eventQuery.isLoading || (event && seriesQuery.isLoading)) {
    return <div className="text-ink-3 px-6 py-8">Загрузка…</div>;
  }

  if (eventQuery.isError || !event || !series) {
    return (
      <div className="px-6 py-8">
        <div className="border-danger-soft bg-danger-soft text-danger rounded-[14px] border px-4 py-3 text-sm">
          {eventQuery.error instanceof ApiError ? eventQuery.error.message : "Турнир не найден"}
        </div>
        <Link to="/admin/series" className="text-gold mt-4 inline-block text-sm font-semibold">
          ← К сериям
        </Link>
      </div>
    );
  }

  const saving =
    updateEvent.isPending ||
    replaceFlights.isPending ||
    replaceBlinds.isPending ||
    previewEvent.isPending ||
    previewFlights.isPending;

  const saveLabel =
    notify && totalRecipients > 0 && (eventDirty || flightsDirty)
      ? "Сохранить и уведомить"
      : "Сохранить";

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 border-b">
        <div className="px-6 pt-4">
          <div className="text-ink-3 mb-1 flex items-center gap-1.5 text-[12.5px]">
            <Link to="/admin/series" className="text-gold font-bold">
              Серии
            </Link>
            <span>/</span>
            <Link to={`/admin/series/${series.id}`} className="text-gold font-bold">
              {series.name}
            </Link>
            <span>/</span>
            <span>Турнир{event.number != null ? ` #${event.number}` : ""}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 pb-3">
            <h1 className="text-xl font-extrabold tracking-tight">
              {event.number != null ? `#${event.number} ` : ""}
              {name || event.name}
            </h1>
            <StatusBadge kind="event" status={status} />
            <div className="flex-1" />
            <a
              href={eventPath(event, series)}
              target="_blank"
              rel="noopener"
              className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex h-8 items-center gap-[7px] rounded-[8px] border bg-transparent px-[11px] text-[13px] font-bold"
            >
              <svg
                className="size-[15px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M14 4h6v6M20 4l-9 9" />
                <path d="M18 14v5H5V6h5" />
              </svg>
              В приложении
            </a>
            <button
              type="button"
              onClick={() => void handleDuplicate()}
              disabled={duplicateEvent.isPending}
              className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex h-8 items-center justify-center gap-[7px] rounded-[8px] border bg-transparent px-[11px] text-[13px] font-bold disabled:opacity-45"
            >
              Дублировать
            </button>
            <button
              type="button"
              onClick={() => void handleCancelEvent()}
              disabled={status === "cancelled"}
              className="border-danger-soft text-danger hover:bg-danger-soft inline-flex h-8 items-center justify-center rounded-[8px] border bg-transparent px-[11px] text-[13px] font-bold disabled:opacity-45"
            >
              Отменить турнир
            </button>
          </div>
          <div className="flex gap-0.5">
            {(Object.keys(TAB_LABELS) as EventTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTab(tab)}
                className={cn(
                  "h-[38px] border-b-2 px-3.5 text-sm font-bold",
                  activeTab === tab
                    ? "border-gold text-gold"
                    : "text-ink-2 hover:text-ink border-transparent",
                )}
              >
                {TAB_LABELS[tab]}
                {tab === "structure" && structureLevelCount > 0 ? (
                  <span className="text-ink-3 num ml-1.5 text-[11px] font-normal">
                    {structureLevelCount} уровней
                  </span>
                ) : null}
                {tab === "history" && (changesQuery.data?.length ?? 0) > 0 ? (
                  <span className="text-ink-3 num ml-1.5 text-[11px] font-normal">
                    {changesQuery.data?.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 pt-5 pb-24 max-[1000px]:pb-28">
        <div
          className={cn(
            "grid items-start gap-[18px]",
            isWide ? "grid-cols-[1fr_316px]" : "grid-cols-1",
          )}
        >
          <div>
            {activeTab === "params" ? (
              <>
                <div className="border-line bg-surface mb-3.5 rounded-[14px] border p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-extrabold">
                    <svg
                      className="text-gold size-[18px]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M4 6h16M4 12h16M4 18h10" />
                    </svg>
                    Основное
                  </div>
                  <div className="flex gap-2.5">
                    <div className="mb-3 min-w-0 flex-[3]">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Название
                      </label>
                      <input
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          markDirtyResetPreview();
                        }}
                        className={adminInputClass}
                      />
                    </div>
                    <div className="mb-3 w-[90px] shrink-0">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        № в сетке
                      </label>
                      <input
                        value={number}
                        onChange={(e) => {
                          setNumber(e.target.value);
                          markDirtyResetPreview();
                        }}
                        className={cn(adminInputClass, "num")}
                      />
                    </div>
                  </div>
                  <SlugField
                    value={slug}
                    onChange={setSlug}
                    onSuggest={() =>
                      buildEventSlugBase({
                        number: number.trim() ? Number(number) : null,
                        name: name.trim() || event.name,
                      })
                    }
                    onDirty={markDirtyResetPreview}
                  />
                  <div className="flex gap-2.5">
                    <div className="mb-3 min-w-0 flex-1">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Бай-ин (всего)
                      </label>
                      <input
                        value={buyin}
                        onChange={(e) => {
                          setBuyin(e.target.value);
                          markDirtyResetPreview();
                        }}
                        className={cn(adminInputClass, "num")}
                      />
                    </div>
                    <div className="mb-3 min-w-0 flex-1">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Баунти (отображение)
                      </label>
                      <input
                        value={buyinBounty}
                        onChange={(e) => {
                          setBuyinBounty(e.target.value);
                          markDirtyResetPreview();
                        }}
                        placeholder="для 14k+6k"
                        className={cn(adminInputClass, "num")}
                      />
                    </div>
                    <div className="mb-3 w-[120px] shrink-0">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">Валюта</label>
                      <select
                        value={currencyCode}
                        onChange={(e) => {
                          setCurrencyCode(e.target.value);
                          markDirtyResetPreview();
                        }}
                        className={adminInputClass}
                      >
                        {SEED_CURRENCIES.map((code) => (
                          <option key={code} value={code}>
                            {code}
                            {event.currency_code === code && event.currency.symbol
                              ? ` ${event.currency.symbol}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3 min-w-0 flex-1">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Гарантия
                      </label>
                      <input
                        value={guarantee}
                        onChange={(e) => {
                          setGuarantee(e.target.value);
                          markDirtyResetPreview();
                        }}
                        placeholder="нет"
                        className={cn(adminInputClass, "num")}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="mb-3 min-w-0 flex-1">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Дисциплина
                      </label>
                      <select
                        value={gameType}
                        onChange={(e) => {
                          setGameType(e.target.value as GameType);
                          markDirtyResetPreview();
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
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Стартовый стек
                      </label>
                      <input
                        value={startStack}
                        onChange={(e) => {
                          setStartStack(e.target.value);
                          markDirtyResetPreview();
                        }}
                        placeholder="—"
                        className={cn(adminInputClass, "num")}
                      />
                    </div>
                    <div className="mb-3 min-w-0 flex-1">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Стартовые блайнды
                      </label>
                      <input
                        value={startBlinds}
                        onChange={(e) => {
                          setStartBlinds(e.target.value);
                          markDirtyResetPreview();
                        }}
                        placeholder="100/200/200"
                        className={cn(adminInputClass, "num")}
                      />
                    </div>
                    <div className="mb-3 min-w-0 flex-1">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Поздняя рег. до уровня
                      </label>
                      <input
                        value={lateRegLevel}
                        onChange={(e) => {
                          setLateRegLevel(e.target.value);
                          markDirtyResetPreview();
                        }}
                        placeholder="—"
                        className={cn(adminInputClass, "num")}
                      />
                    </div>
                    <div className="mb-3 min-w-0 flex-1">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Уровень в день
                      </label>
                      <input
                        value={dayEndNote}
                        onChange={(e) => {
                          setDayEndNote(e.target.value);
                          markDirtyResetPreview();
                        }}
                        placeholder="till 12% / final table"
                        maxLength={40}
                        className={adminInputClass}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="mb-3 min-w-0 flex-1">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">
                        Ре-энтри
                      </label>
                      <select
                        value={reentryMode}
                        onChange={(e) => {
                          setReentryMode(e.target.value as ReentryMode);
                          markDirtyResetPreview();
                        }}
                        className={adminInputClass}
                      >
                        <option value="1">×1</option>
                        <option value="2">×2</option>
                        <option value="unlimited">Без лимита</option>
                        <option value="freezeout">Фризаут</option>
                      </select>
                    </div>
                    <div className="mb-3 min-w-0 flex-1">
                      <label className="text-ink-2 mb-1 block text-xs font-semibold">Статус</label>
                      <select
                        value={status}
                        onChange={(e) => {
                          setStatus(e.target.value as EventStatus);
                          markDirtyResetPreview();
                        }}
                        className={adminInputClass}
                      >
                        <option value="scheduled">Опубликован</option>
                        <option value="changed">Изменён</option>
                        <option value="cancelled">Отменён</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="text-ink-2 mb-1 block text-xs font-semibold">Теги</label>
                    <div className="border-line-strong bg-surface-2 flex min-h-11 flex-wrap items-center gap-[7px] rounded-[10px] border p-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="border-line-gold bg-gold-soft text-gold inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold"
                        >
                          {tagLabel(tag)}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="flex text-inherit"
                            aria-label={`Удалить тег ${tag}`}
                          >
                            <svg
                              className="size-[11px]"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            >
                              <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddTagClick}
                        className="border-line-strong text-ink-3 h-[26px] rounded-full border border-dashed px-2.5 text-xs font-bold"
                      >
                        + тег
                      </button>
                    </div>
                    <p className="text-ink-3 mt-1 text-[11px]">
                      Турбо, баунти, сателлит, дипстек — влияют на фильтры в приложении
                    </p>
                  </div>
                  <div className="mb-3">
                    <label className="text-ink-2 mb-1 block text-xs font-semibold">
                      Примечание
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        markDirtyResetPreview();
                      }}
                      placeholder="Видно игрокам в карточке турнира"
                      rows={3}
                      className={cn(adminInputClass, "h-[70px] resize-y py-2")}
                    />
                  </div>
                </div>

                <div className="border-line bg-surface mb-3.5 rounded-[14px] border p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-extrabold">
                    <svg
                      className="text-gold size-[18px]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="3" y="4" width="18" height="17" rx="3" />
                      <path d="M3 9h18M8 3v4M16 3v4" />
                    </svg>
                    Флайты
                    <span className="text-ink-3 ml-auto text-[11px] font-semibold">
                      напоминания ставятся на каждый отдельно
                    </span>
                  </div>
                  {flightRows.map((row, index) => {
                    const canRemove = flightRows.length > 1 && (!published || !row.id);
                    return (
                      <div
                        key={row.id ?? `flight-${index}`}
                        className="mb-2 flex items-center gap-2"
                      >
                        <span className="border-line-strong bg-surface-3 text-ink-3 inline-flex size-[26px] shrink-0 items-center justify-center rounded-[8px] border text-[11px] font-extrabold">
                          {index + 1}
                        </span>
                        <input
                          value={row.label}
                          onChange={(e) => updateFlightRow(index, { label: e.target.value })}
                          placeholder="без метки"
                          className={cn(adminInputClass, "max-w-[104px]")}
                        />
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateFlightRow(index, { date: e.target.value })}
                          className={cn(adminInputClass, "num min-w-0 flex-1")}
                        />
                        <input
                          type="time"
                          value={row.time}
                          onChange={(e) => updateFlightRow(index, { time: e.target.value })}
                          className={cn(adminInputClass, "num w-[88px] shrink-0")}
                        />
                        <span className="text-gold num min-w-[34px] shrink-0 text-right text-[11px] font-bold">
                          {row.bookmarks_count > 0 ? (
                            <>
                              {row.bookmarks_count}{" "}
                              <svg
                                className="inline size-[11px]"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden
                              >
                                <path d="M6 4h12v17l-6-4-6 4z" />
                              </svg>
                            </>
                          ) : (
                            "—"
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFlightRow(index)}
                          disabled={!canRemove}
                          className="border-line-strong text-ink-2 hover:bg-surface-2 inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] border disabled:opacity-40"
                          aria-label="Удалить флайт"
                        >
                          <svg
                            className="size-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={addFlightRow}
                    className="border-line-strong text-ink-2 hover:bg-surface-2 mt-1 inline-flex h-8 items-center rounded-[8px] border px-[11px] text-[13px] font-bold"
                  >
                    + Добавить флайт
                  </button>
                  <p className="text-ink-3 mt-2 text-[11px]">
                    Время указывается в поясе площадки —{" "}
                    <b className="text-ink-2">
                      {series.venue.timezone} ({formatUtcOffset(series.venue.timezone)})
                    </b>
                    . Игрокам показывается местное время площадки и их собственное.
                  </p>
                </div>
              </>
            ) : null}

            {activeTab === "structure" ? (
              <div className="border-line bg-surface mb-3.5 rounded-[14px] border p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-extrabold">
                  <svg
                    className="text-gold size-[18px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M4 20h4V10H4zM10 20h4V4h-4zM16 20h4v-6h-4z" />
                  </svg>
                  Структура блайндов
                  {setLabels.length > 1 ? (
                    <select
                      value={activeSetLabel}
                      onChange={(e) => setActiveStructureSet(e.target.value)}
                      disabled={!isWide}
                      className="border-line-strong bg-surface-2 text-ink-2 ml-auto h-8 rounded-[8px] border px-2 text-xs font-semibold"
                    >
                      {setLabels.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-ink-3 text-left text-[11px] font-bold tracking-wide uppercase">
                        <th className="border-line w-[38px] border-b px-2.5 py-2">Ур.</th>
                        <th className="border-line border-b px-2.5 py-2">Small blind</th>
                        <th className="border-line border-b px-2.5 py-2">Big blind</th>
                        <th className="border-line border-b px-2.5 py-2">Анте</th>
                        <th className="border-line w-[86px] border-b px-2.5 py-2">Минут</th>
                        <th className="border-line w-[120px] border-b px-2.5 py-2" />
                      </tr>
                    </thead>
                    <tbody className="num">
                      {visibleBlindIndexes.map((index) => {
                        const row = blindRows[index]!;
                        const displayNo = displayLevelAt(blindRows, index);
                        const isLateRegEnd =
                          !row.is_break &&
                          ((lateRegLevelNum != null && displayNo === lateRegLevelNum) ||
                            row.is_late_reg_end);
                        const levelId = row.id;
                        const canRemove = isWide && (!published || !levelId);

                        if (row.is_break) {
                          return (
                            <tr key={row.id ?? `break-${index}`} className="bg-surface-2">
                              <td className="border-line text-ink-3 border-b px-2.5 py-1 text-center text-[13px] font-extrabold">
                                —
                              </td>
                              <td
                                colSpan={3}
                                className="border-line text-ink-3 border-b px-2.5 py-1 text-center text-xs font-bold"
                              >
                                Перерыв
                              </td>
                              <td className="border-line border-b px-2.5 py-1">
                                <input
                                  type="number"
                                  value={row.minutes}
                                  disabled={!isWide}
                                  onChange={(e) =>
                                    updateBlindRow(index, {
                                      minutes: Number(e.target.value) || 0,
                                    })
                                  }
                                  className={cellInputClass}
                                />
                              </td>
                              <td className="border-line border-b px-2.5 py-1">
                                {canRemove ? (
                                  <button
                                    type="button"
                                    onClick={() => removeBlindRow(index)}
                                    className="text-danger text-xs"
                                  >
                                    ✕
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr
                            key={row.id ?? `level-${index}`}
                            className={isLateRegEnd ? "border-line-gold border-b-2" : undefined}
                          >
                            <td className="border-line text-ink-3 border-b px-2.5 py-1 text-center text-[13px] font-extrabold">
                              {displayNo}
                            </td>
                            <td className="border-line border-b px-2.5 py-1">
                              <input
                                value={row.sb}
                                disabled={!isWide}
                                onChange={(e) => updateBlindRow(index, { sb: e.target.value })}
                                className={cellInputClass}
                              />
                            </td>
                            <td className="border-line border-b px-2.5 py-1">
                              <input
                                value={row.bb}
                                disabled={!isWide}
                                onChange={(e) => updateBlindRow(index, { bb: e.target.value })}
                                className={cellInputClass}
                              />
                            </td>
                            <td className="border-line border-b px-2.5 py-1">
                              <input
                                value={row.ante}
                                disabled={!isWide}
                                onChange={(e) => updateBlindRow(index, { ante: e.target.value })}
                                className={cellInputClass}
                              />
                            </td>
                            <td className="border-line border-b px-2.5 py-1">
                              <input
                                type="number"
                                value={row.minutes}
                                disabled={!isWide}
                                onChange={(e) =>
                                  updateBlindRow(index, {
                                    minutes: Number(e.target.value) || 0,
                                  })
                                }
                                className={cellInputClass}
                              />
                            </td>
                            <td className="border-line border-b px-2.5 py-1">
                              {isLateRegEnd ? (
                                <span className="text-gold text-[10px] font-extrabold whitespace-nowrap">
                                  ← конец поздней рег.
                                </span>
                              ) : canRemove ? (
                                <button
                                  type="button"
                                  onClick={() => removeBlindRow(index)}
                                  className="text-danger text-xs"
                                >
                                  ✕
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {isWide ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => insertBlindRow(visibleBlindIndexes.at(-1) ?? null, false)}
                      className="border-line-strong text-ink-2 hover:bg-surface-2 inline-flex h-8 items-center rounded-[8px] border px-[11px] text-[13px] font-bold"
                    >
                      + Уровень
                    </button>
                    <button
                      type="button"
                      onClick={() => insertBlindRow(visibleBlindIndexes.at(-1) ?? null, true)}
                      className="border-line-strong text-ink-2 hover:bg-surface-2 inline-flex h-8 items-center rounded-[8px] border px-[11px] text-[13px] font-bold"
                    >
                      + Перерыв
                    </button>
                    <button
                      type="button"
                      onClick={fillAllDurations}
                      className="border-line-gold text-ink hover:bg-gold-soft inline-flex h-8 items-center rounded-[8px] border px-[11px] text-[13px] font-bold"
                    >
                      Заполнить длительность всем
                    </button>
                    <button
                      type="button"
                      onClick={() => importInputRef.current?.click()}
                      disabled={uploadImport.isPending}
                      className="border-line-strong text-ink-2 hover:bg-surface-2 inline-flex h-8 items-center rounded-[8px] border px-[11px] text-[13px] font-bold disabled:opacity-45"
                    >
                      Импорт из файла
                    </button>
                    <button
                      type="button"
                      onClick={() => setCopyStructureOpen(true)}
                      className="border-line-strong text-ink-2 hover:bg-surface-2 inline-flex h-8 items-center rounded-[8px] border px-[11px] text-[13px] font-bold"
                    >
                      Скопировать из другого турнира
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setBlindRows((rows) =>
                          rows.filter(
                            (row) =>
                              normalizeStructureSetLabel(row.structure_set_label) !==
                              activeSetLabel,
                          ),
                        );
                        markDirtyResetPreview();
                      }}
                      className="border-danger-soft text-danger hover:bg-danger-soft inline-flex h-8 items-center rounded-[8px] border px-[11px] text-[13px] font-bold"
                    >
                      Очистить структуру
                    </button>
                  </div>
                ) : (
                  <p className="text-ink-3 mt-3 text-xs">
                    Редактирование структуры доступно на экране шире 1000px.
                  </p>
                )}
                <p className="text-ink-3 mt-2.5 text-[11px]">
                  Структура необязательна. Если её нет — секция просто не показывается игрокам.
                </p>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,.txt,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) {
                      void handleImportFile(file);
                    }
                  }}
                />
              </div>
            ) : null}

            {activeTab === "history" ? (
              <div className="border-line bg-surface mb-3.5 rounded-[14px] border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-extrabold">
                  <svg
                    className="text-gold size-[18px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  История изменений турнира
                </div>
                {changesQuery.isLoading ? (
                  <p className="text-ink-3 text-sm">Загрузка…</p>
                ) : (changesQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-ink-3 text-sm">Изменений пока нет</p>
                ) : (
                  <div className="text-ink-2 flex flex-col gap-2 text-xs">
                    {(changesQuery.data ?? []).map((entry) => {
                      const diff = formatChangeDiff(entry, currencySymbol);
                      const notifyStatus = formatNotificationStatus(entry);
                      return (
                        <div key={entry.id}>
                          <b className="text-ink">{formatChangeTitle(entry)}</b>
                          {diff ? (
                            <>
                              {" "}
                              {diff.includes("→") ? (
                                <>
                                  <span className="text-ink-3 line-through">
                                    {diff.split(" → ")[0]}
                                  </span>{" "}
                                  <span className="text-gold">→</span> {diff.split(" → ")[1]}
                                </>
                              ) : (
                                diff
                              )}
                            </>
                          ) : null}
                          {" · "}
                          {formatChangeWhen(entry.created_at)}
                          {entry.actor_email ? ` · ${entry.actor_email}` : ""}
                          {notifyStatus ? ` · ${notifyStatus}` : ""}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="border-line bg-surface rounded-[14px] border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-extrabold">
                <svg
                  className="text-gold size-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M6 4h12v17l-6-4-6 4z" />
                </svg>
                Подписчики
              </div>
              <div className="flex gap-4">
                <div>
                  <b className="num block text-xl font-extrabold">{totalBookmarks}</b>
                  <span className="text-ink-3 text-[11px]">всего на турнир</span>
                </div>
                <div>
                  <b className="num block text-xl font-extrabold">{nearestFlightBookmarks}</b>
                  <span className="text-ink-3 text-[11px]">на ближайший флайт</span>
                </div>
              </div>
              <p className="text-ink-3 mt-2 text-[11px]">
                Любое изменение времени, гарантии или статуса уйдёт им push-уведомлением.
              </p>
            </div>

            <div className="border-line bg-surface rounded-[14px] border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                <svg
                  className="text-gold size-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="4" y="5" width="16" height="15" rx="3" />
                  <path d="M8 3v4M16 3v4M4 10h16" />
                </svg>
                Серия
              </div>
              <div className="text-sm font-bold">{series.name}</div>
              <div className="text-ink-3 mt-0.5 text-xs">
                {formatDateRange(series.starts_on, series.ends_on)} · {series.venue.name}
              </div>
              <div className="text-ink-3 text-xs">
                {countryFlag(series.country.code) ? `${countryFlag(series.country.code)} ` : ""}
                {series.venue.city} · {formatUtcOffset(series.venue.timezone)}
              </div>
              <StatusBadge kind="series" status={series.status} className="mt-2" />
              <Link
                to={`/admin/series/${series.id}`}
                className="border-line-strong text-ink-2 hover:bg-surface-2 mt-2.5 inline-flex h-8 w-full items-center justify-center rounded-[8px] border text-[13px] font-bold"
              >
                Все турниры серии
              </Link>
            </div>

            <div className="border-line bg-surface rounded-[14px] border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                <svg
                  className="text-gold size-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 8v5M12 17h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                Проверка
              </div>
              <div className="text-ink-2 flex flex-col gap-1.5 text-[12.5px]">
                {checks.map((check) => (
                  <div key={check.message} className={check.ok ? undefined : "text-warn"}>
                    {check.ok ? "✓" : "!"} {check.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {dirty ? (
        <div
          className={cn(
            "border-line-strong bg-surface fixed right-0 bottom-0 z-20 flex flex-wrap items-center gap-3 border-t px-6 py-3",
            isAdminDesktop ? "left-[236px]" : "left-0",
          )}
        >
          {(previewNoticeText || totalRecipients > 0) && (eventDirty || flightsDirty) ? (
            <div className="border-warn/30 bg-warn-soft text-ink-2 flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border px-3 py-2 text-[12.5px]">
              <svg
                className="text-warn size-[18px] shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path d="M12 3a6 6 0 0 0-6 6v4l-1.5 3h15L18 13V9a6 6 0 0 0-6-6z" />
                <path d="M10 19a2 2 0 0 0 4 0" />
              </svg>
              <span>
                {previewNoticeText ? (
                  <>
                    {previewNoticeText.split(":")[0]}
                    {totalRecipients > 0 ? (
                      <>
                        {" · "}
                        <b>{totalRecipients} подписчиков</b>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <b>{totalRecipients} подписчиков</b> получат уведомление
                  </>
                )}
              </span>
            </div>
          ) : blindsDirty && !eventDirty && !flightsDirty ? (
            <div className="text-ink-2 flex-1 text-[12.5px]">Изменена структура блайндов</div>
          ) : (
            <div className="text-ink-2 flex-1 text-[12.5px]">Есть несохранённые изменения</div>
          )}
          {(eventDirty || flightsDirty) && totalRecipients > 0 ? (
            <label className="text-ink-2 flex cursor-pointer items-center gap-[7px] text-[12.5px]">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                className="accent-[var(--gold)]"
              />
              Отправить уведомление
            </label>
          ) : null}
          <div className="flex-1 max-[1000px]:hidden" />
          {saveError ? (
            <span className="text-danger text-xs max-[1000px]:w-full">{saveError}</span>
          ) : null}
          <button
            type="button"
            onClick={() => resetFromEvent(event)}
            disabled={saving}
            className="border-line-strong text-ink-2 hover:bg-surface-2 inline-flex h-9 items-center rounded-[10px] border px-4 text-sm font-bold disabled:opacity-45"
          >
            Отменить правки
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="bg-gold-grad text-ink-ongold inline-flex h-9 items-center rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-45"
          >
            {saveLabel}
          </button>
        </div>
      ) : null}

      <CopyStructureModal
        open={copyStructureOpen}
        events={eventsQuery.data ?? []}
        currentEventId={event.id}
        onClose={() => setCopyStructureOpen(false)}
        onSelect={handleCopyStructure}
      />
    </>
  );
}
