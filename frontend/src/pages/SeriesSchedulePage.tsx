import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useSeriesSchedule } from "@/api/series";
import type { BlindLevelRead, SeriesScheduleRow } from "@/api/types/schedule";
import { STICKY_BELOW_HEADER_TOP, StickyHeader } from "@/components/layout/StickyHeader";
import { formatGameType } from "@/features/schedule/lib/format";
import {
  canSharePdfFiles,
  downloadSeriesPdf,
  shareSeriesPdf,
} from "@/features/schedule/shareSeriesPdf";
import { tournamentsWord } from "@/lib/plural";
import { eventPath, seriesPath, seriesSchedulePath } from "@/lib/paths";
import { formatDualTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const iconClass =
  "h-5 w-5 stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

/** Высота панели PDF/Структуры (~ h-11 + py-2.5×2). */
const SCHEDULE_TOOLS_H = "3.75rem";
const SCHEDULE_DAY_TOP = `calc(${STICKY_BELOW_HEADER_TOP} + ${SCHEDULE_TOOLS_H})` as const;

function ScheduleSkeleton() {
  return (
    <div data-testid="schedule-skeleton" className="px-4 pt-4">
      <div className="bg-surface-2 mb-4 h-11 w-40 rounded-full" />
      <div className="bg-surface-2 mb-3 h-10 rounded-md" />
      <div className="space-y-2">
        <div className="bg-surface h-16 rounded-md" />
        <div className="bg-surface h-16 rounded-md" />
        <div className="bg-surface h-16 rounded-md" />
        <div className="bg-surface h-16 rounded-md" />
      </div>
    </div>
  );
}

function metaLine(row: SeriesScheduleRow): string {
  const parts = [
    row.buyin_display === "closed" ? "closed" : row.buyin_display,
    row.guarantee_display ? `${row.guarantee_display} GTD` : null,
    formatGameType(row.game_type),
  ].filter(Boolean);
  return parts.join(" · ");
}

function BlindInline({ levels }: { levels: BlindLevelRead[] }) {
  const play = levels.filter((level) => !level.is_break).slice(0, 12);
  if (play.length === 0) {
    return <p className="text-ink-3 mt-2 text-xs">Структура не загружена</p>;
  }
  return (
    <div className="text-ink-2 mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px]">
      {play.map((level) => (
        <span key={`${level.structure_set_label}-${level.level_no}`} className="num">
          L{level.level_no} {level.sb}/{level.bb}
          {level.ante ? ` (${level.ante})` : ""} · {level.minutes}′
        </span>
      ))}
      {levels.filter((level) => !level.is_break).length > 12 ? (
        <span className="text-ink-3">…</span>
      ) : null}
    </div>
  );
}

function ScheduleRow({
  row,
  seriesSlug,
  showBlinds,
  blinds,
  siblingFlights,
}: {
  row: SeriesScheduleRow;
  seriesSlug: string;
  showBlinds: boolean;
  blinds: BlindLevelRead[] | undefined;
  siblingFlights: string[];
}) {
  const dual = formatDualTime(row.start_at.utc, row.start_at.venue_timezone);
  const titlePrefix = row.number != null ? `#${row.number} ` : "";
  const flightSuffix = row.flight_label ? ` · ${row.flight_label}` : "";

  return (
    <Link
      to={eventPath({ slug: row.event_slug }, { slug: seriesSlug })}
      state={{ flightId: row.flight_id }}
      className={cn(
        "border-line bg-surface hover:bg-surface-2 block rounded-md border px-3.5 py-3",
        row.highlight === "main" && "border-gold/40 bg-gold-soft/40",
        row.highlight === "champ" && "bg-gold-soft/20",
        row.highlight === "sat" && "opacity-90",
        row.highlight === "closed" && "opacity-60",
      )}
      data-testid="schedule-row"
    >
      <div className="flex items-start gap-3">
        <div className="num min-w-[52px] text-center">
          <div className="text-[17px] font-extrabold">{dual.venue}</div>
          {dual.user ? <div className="text-ink-3 text-[11px]">{dual.user}</div> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[15px] font-bold",
              (row.highlight === "main" || row.highlight === "champ") && "font-extrabold",
              row.highlight === "closed" && "text-ink-3 italic",
              row.highlight === "sat" && "text-ink-2 font-semibold",
            )}
          >
            {titlePrefix}
            {row.name}
            {flightSuffix}
          </div>
          <div className="num text-ink-2 mt-0.5 text-[13px]">{metaLine(row)}</div>
          {siblingFlights.length > 0 || row.pdf_tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {siblingFlights.map((label) => (
                <span
                  key={label}
                  className="border-line-strong bg-surface-2 text-ink-2 inline-flex h-[22px] items-center rounded-[6px] border px-2 text-[10px] font-extrabold"
                >
                  {label}
                </span>
              ))}
              {row.pdf_tags.map((tag) => (
                <span
                  key={tag}
                  className="border-line-strong bg-surface-2 text-ink-2 inline-flex h-[22px] items-center rounded-[6px] border px-2 text-[10px] font-extrabold"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {showBlinds ? <BlindInline levels={blinds ?? []} /> : null}
        </div>
        {row.number != null ? (
          <div className="num text-ink-3 text-xs font-bold">#{row.number}</div>
        ) : null}
      </div>
    </Link>
  );
}

export function SeriesSchedulePage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();
  const [showBlinds, setShowBlinds] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const query = useSeriesSchedule(seriesId, showBlinds);
  const schedule = query.data;

  useEffect(() => {
    if (!schedule || !seriesId || schedule.slug === seriesId) {
      return;
    }
    navigate(seriesSchedulePath(schedule), { replace: true });
  }, [schedule, seriesId, navigate]);

  useEffect(() => {
    setShowShare(canSharePdfFiles());
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleDownloadPdf() {
    if (!seriesId || pdfBusy) {
      return;
    }
    setPdfBusy(true);
    setToast(null);
    try {
      const outcome = await downloadSeriesPdf(seriesId);
      if (outcome === "error") {
        setToast("Не удалось создать PDF, попробуйте позже");
      }
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleSharePdf() {
    if (!seriesId || shareBusy) {
      return;
    }
    setShareBusy(true);
    try {
      await shareSeriesPdf(seriesId);
    } finally {
      setShareBusy(false);
    }
  }

  if (!seriesId) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-semibold">Не указан идентификатор серии</p>
      </div>
    );
  }

  if (query.isLoading) {
    return <ScheduleSkeleton />;
  }

  if (query.isError) {
    const is404 = query.error instanceof ApiError && query.error.status === 404;
    if (is404) {
      return (
        <div className="px-4 py-16 text-center" data-testid="schedule-not-found">
          <p className="text-lg font-extrabold">Серия не найдена</p>
          <Link
            to="/"
            className="bg-gold-grad text-ink-ongold mt-5 inline-flex h-11 items-center rounded-full px-5 text-[13px] font-bold"
          >
            На главную
          </Link>
        </div>
      );
    }
    return (
      <div
        className="border-line bg-surface mx-4 mt-8 rounded-lg border px-4 py-8 text-center"
        data-testid="schedule-error"
      >
        <p className="font-semibold">Не удалось загрузить расписание</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="bg-gold-soft text-gold mt-4 inline-flex h-11 items-center rounded-full px-5 text-[13px] font-bold"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!schedule) {
    return null;
  }

  const siblingsByEvent = new Map<string, string[]>();
  for (const day of schedule.days) {
    for (const row of day.rows) {
      if (!row.flight_label) {
        continue;
      }
      const list = siblingsByEvent.get(row.event_id) ?? [];
      if (!list.includes(row.flight_label)) {
        list.push(row.flight_label);
      }
      siblingsByEvent.set(row.event_id, list);
    }
  }

  return (
    <div data-testid="series-schedule-page" className="pb-10">
      <StickyHeader
        title={schedule.name}
        subtitle="Всё расписание"
        backFallback={seriesPath(schedule)}
        actions={
          <button
            type="button"
            aria-label="Скачать PDF"
            disabled={pdfBusy}
            onClick={() => void handleDownloadPdf()}
            className="bg-surface-2 text-ink inline-flex h-[38px] min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-extrabold disabled:opacity-60"
          >
            {pdfBusy ? (
              <span
                className="border-ink/20 border-t-ink size-4 animate-spin rounded-full border-2"
                aria-hidden
              />
            ) : (
              <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12M12 15l-4-4M12 15l4-4" />
                <path d="M5 19h14" />
              </svg>
            )}
            <span className="hidden min-[360px]:inline">PDF</span>
          </button>
        }
        compactActions={
          <button
            type="button"
            aria-label="Скачать PDF"
            disabled={pdfBusy}
            onClick={() => void handleDownloadPdf()}
            className="bg-surface-2 text-ink inline-flex h-[38px] min-h-11 w-[38px] min-w-11 items-center justify-center rounded-md disabled:opacity-60"
          >
            {pdfBusy ? (
              <span
                className="border-ink/20 border-t-ink size-4 animate-spin rounded-full border-2"
                aria-hidden
              />
            ) : (
              <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12M12 15l-4-4M12 15l4-4" />
                <path d="M5 19h14" />
              </svg>
            )}
          </button>
        }
      />

      <div
        className="border-line bg-bg/90 sticky z-10 border-b px-4 py-2.5 backdrop-blur-[14px]"
        style={{ top: STICKY_BELOW_HEADER_TOP }}
      >
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pdfBusy}
            onClick={() => void handleDownloadPdf()}
            className="bg-gold-grad text-ink-ongold inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[13px] font-extrabold disabled:opacity-60"
          >
            {pdfBusy ? (
              <>
                <span
                  className="border-ink-ongold/30 border-t-ink-ongold size-4 animate-spin rounded-full border-2"
                  aria-hidden
                />
                Готовим PDF…
              </>
            ) : (
              "Скачать PDF"
            )}
          </button>
          {showShare ? (
            <button
              type="button"
              disabled={shareBusy || pdfBusy}
              aria-label="Поделиться PDF"
              onClick={() => void handleSharePdf()}
              className="border-line-strong bg-surface text-ink inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-60"
            >
              <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12M12 3l-4 4M12 3l4 4" />
                <path d="M5 13v6h14v-6" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowBlinds((value) => !value)}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center rounded-full border text-[13px] font-bold",
              showBlinds
                ? "border-gold bg-gold-soft text-gold"
                : "border-line-strong bg-surface text-ink",
            )}
          >
            Структуры
          </button>
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          className="border-line-strong bg-surface-2 text-ink shadow-elevated fixed bottom-[92px] left-1/2 z-50 w-[calc(100%-32px)] max-w-[388px] -translate-x-1/2 rounded-md border px-3.5 py-3 text-[13px] font-semibold"
        >
          {toast}
        </div>
      ) : null}

      <div className="flex flex-col gap-1 px-4 pt-3">
        {schedule.days.map((day) => (
          <section key={day.date} className="mb-2">
            <div
              className="sticky z-[5] -mx-4 border-y border-[#2B2410] bg-[#2B2410] px-4 py-2"
              style={{ top: SCHEDULE_DAY_TOP }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[13px] font-extrabold tracking-wide text-[#F1D68E] uppercase">
                  {day.label}
                </h2>
                <span className="num text-[11px] font-semibold text-[#B79C63]">
                  {day.events_count} {tournamentsWord(day.events_count)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {day.rows.map((row) => {
                const allFlights = siblingsByEvent.get(row.event_id) ?? [];
                const siblings = allFlights.filter((label) => label !== row.flight_label);
                return (
                  <ScheduleRow
                    key={row.flight_id}
                    row={row}
                    seriesSlug={schedule.slug}
                    showBlinds={showBlinds}
                    blinds={schedule.blinds_by_event?.[row.event_id]}
                    siblingFlights={siblings}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
