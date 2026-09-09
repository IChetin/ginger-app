import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type { SeriesAdmin } from "@/api/types/admin";
import type { SeriesStatus } from "@/api/types/schedule";
import { ApiError } from "@/api/client";
import { AdminCardList, AdminCardListStack } from "@/components/admin/AdminCardList";
import { AdminTable } from "@/components/admin/AdminTable";
import { adminInputClass } from "@/components/admin/FlightRowsEditor";
import { Modal } from "@/components/admin/Modal";
import { Pagination } from "@/components/admin/Pagination";
import { SearchInput } from "@/components/admin/SearchInput";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Toolbar, ToolbarHint, ToolbarSpacer } from "@/components/admin/Toolbar";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { SEED_COUNTRIES } from "@/features/admin/constants";
import {
  useCreateSeries,
  useOrganizersAdmin,
  useSeriesAdmin,
  useVenuesAdmin,
} from "@/features/admin/hooks";
import { formatDateRange } from "@/features/schedule/lib/format";
import { countryFlag } from "@/components/series/seriesDisplay";
import { SERIES_STATUS_LABELS } from "@/lib/statusLabels";
import { seriesPath } from "@/lib/paths";
import { cn } from "@/lib/utils";

const LIMIT_OPTIONS = [20, 50, 100] as const;
const SERIES_STATUSES: SeriesStatus[] = [
  "announced",
  "schedule_published",
  "running",
  "finished",
  "cancelled",
];

function parseLimit(raw: string | null): number {
  const value = Number(raw);
  if (LIMIT_OPTIONS.includes(value as (typeof LIMIT_OPTIONS)[number])) {
    return value;
  }
  return 20;
}

function parseOffset(raw: string | null): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function parseStatus(raw: string | null): SeriesStatus | "all" {
  if (raw && SERIES_STATUSES.includes(raw as SeriesStatus)) {
    return raw as SeriesStatus;
  }
  return "all";
}

function formatRange(offset: number, limit: number, total: number): string {
  if (total === 0) {
    return "Показано 0 из 0";
  }
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return `Показано ${from.toLocaleString("ru-RU")}–${to.toLocaleString("ru-RU")} из ${total.toLocaleString("ru-RU")}`;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) {
    return `сегодня ${time}`;
  }
  if (isYesterday) {
    return `вчера ${time}`;
  }
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function needsGrid(series: SeriesAdmin): boolean {
  return series.status === "announced" && series.events_count === 0;
}

function CreateSeriesDialog({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  onError: (message: string) => void;
}) {
  const createSeries = useCreateSeries();
  const venuesQuery = useVenuesAdmin({ limit: 100, offset: 0 });
  const organizersQuery = useOrganizersAdmin({ limit: 100, offset: 0 });

  const [organizerId, setOrganizerId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setOrganizerId("");
    setVenueId("");
    setName("");
    setStartsOn("");
    setEndsOn("");
  }, [open]);

  async function submit() {
    if (!organizerId || !venueId || !name.trim() || !startsOn || !endsOn) {
      onError("Заполните обязательные поля");
      return;
    }
    if (startsOn > endsOn) {
      onError("Дата начала не может быть позже окончания");
      return;
    }
    try {
      const created = await createSeries.mutateAsync({
        organizer_id: organizerId,
        venue_id: venueId,
        name: name.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
        links: {},
      });
      onCreated(created.id);
      onClose();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Не удалось создать серию");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новая серия"
      subtitle="Создаётся в статусе «Анонс»"
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
            disabled={createSeries.isPending}
            onClick={() => void submit()}
            className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center justify-center rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-45"
          >
            Создать
          </button>
        </>
      }
    >
      <div className="mb-3">
        <label className="text-ink-2 mb-1 block text-xs font-semibold">Название</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={adminInputClass} />
      </div>
      <div className="mb-3">
        <label className="text-ink-2 mb-1 block text-xs font-semibold">Организатор</label>
        <select
          value={organizerId}
          onChange={(e) => setOrganizerId(e.target.value)}
          className={adminInputClass}
        >
          <option value="">Выберите…</option>
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
          onChange={(e) => setVenueId(e.target.value)}
          className={adminInputClass}
        >
          <option value="">Выберите…</option>
          {(venuesQuery.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.city}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2.5">
        <div className="mb-1 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Начало</label>
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className={cn(adminInputClass, "num")}
          />
        </div>
        <div className="mb-1 min-w-0 flex-1">
          <label className="text-ink-2 mb-1 block text-xs font-semibold">Конец</label>
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className={cn(adminInputClass, "num")}
          />
        </div>
      </div>
    </Modal>
  );
}

function NoGridMarker() {
  return (
    <span className="text-warn inline-flex items-center gap-1.5 text-xs font-semibold">
      <svg
        className="size-3.5"
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
      нет сетки
    </span>
  );
}

export function AdminSeriesPage() {
  const navigate = useNavigate();
  const isDesktop = useAdminDesktop();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const statusFilter = parseStatus(searchParams.get("status"));
  const countryCode = searchParams.get("country_code") ?? "";
  const organizerId = searchParams.get("organizer_id") ?? "";
  const emptyEvents =
    searchParams.get("empty_events") === "1" || searchParams.get("empty_events") === "true";
  const stale = searchParams.get("stale") === "1" || searchParams.get("stale") === "true";
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));

  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const organizersQuery = useOrganizersAdmin({ limit: 100, offset: 0 });

  useEffect(() => {
    setSearchInput(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.slice(0, 128);
      const current = searchParams.get("search") ?? "";
      if (next === current) {
        return;
      }
      const params = new URLSearchParams(searchParams);
      if (next) {
        params.set("search", next);
      } else {
        params.delete("search");
      }
      params.set("offset", "0");
      setSearchParams(params, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchParams, setSearchParams]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const seriesQuery = useSeriesAdmin({
    limit,
    offset,
    search: searchFromUrl || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    country_code: countryCode || undefined,
    organizer_id: organizerId || undefined,
    empty_events: emptyEvents || undefined,
    stale: stale || undefined,
  });

  const items = seriesQuery.data?.items ?? [];
  const total = seriesQuery.data?.total ?? 0;
  const attentionCount = items.filter(needsGrid).length;
  const runningCount = items.filter((item) => item.status === "running").length;

  function patchParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    setSearchParams(params, { replace: true });
  }

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex items-center gap-3.5 border-b px-6 py-[18px]">
        <div>
          <div className="text-xl font-extrabold">Серии</div>
          <div className="num text-ink-3 text-xs">
            {total.toLocaleString("ru-RU")} всего
            {runningCount > 0 ? ` · ${runningCount} идут` : ""}
            {attentionCount > 0 ? ` · ${attentionCount} требуют внимания` : ""}
          </div>
        </div>
        <div className="flex-1" />
        <Link
          to="/admin/import"
          className="border-line-gold text-ink hover:bg-gold-soft inline-flex h-[38px] items-center justify-center gap-[7px] rounded-[10px] border bg-transparent px-4 text-sm font-bold"
        >
          Импорт файла
        </Link>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center justify-center gap-[7px] rounded-[10px] px-4 text-sm font-extrabold active:translate-y-px"
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
          Новая серия
        </button>
      </header>

      <div className="flex-1 px-6 pt-5 pb-10">
        <Toolbar>
          <SearchInput
            value={searchInput}
            onChange={(value) => setSearchInput(value.slice(0, 128))}
            placeholder="Поиск по названию, площадке, городу"
            maxLength={128}
            className="min-w-[220px]"
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              patchParams({
                status: event.target.value === "all" ? null : event.target.value,
                offset: "0",
              })
            }
            className="border-line-strong bg-surface text-ink-2 h-9 cursor-pointer rounded-[10px] border px-2.5 text-[13px] font-semibold"
            aria-label="Фильтр по статусу"
          >
            <option value="all">Все статусы</option>
            <option value="announced">{SERIES_STATUS_LABELS.announced}</option>
            <option value="schedule_published">{SERIES_STATUS_LABELS.schedule_published}</option>
            <option value="running">Идёт</option>
            <option value="finished">Завершена</option>
            <option value="cancelled">Отменена</option>
          </select>
          <select
            value={countryCode || "all"}
            onChange={(event) =>
              patchParams({
                country_code: event.target.value === "all" ? null : event.target.value,
                offset: "0",
              })
            }
            className="border-line-strong bg-surface text-ink-2 h-9 cursor-pointer rounded-[10px] border px-2.5 text-[13px] font-semibold"
            aria-label="Фильтр по стране"
          >
            <option value="all">Все страны</option>
            {SEED_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name_ru}
              </option>
            ))}
          </select>
          <select
            value={organizerId || "all"}
            onChange={(event) =>
              patchParams({
                organizer_id: event.target.value === "all" ? null : event.target.value,
                offset: "0",
              })
            }
            className="border-line-strong bg-surface text-ink-2 h-9 cursor-pointer rounded-[10px] border px-2.5 text-[13px] font-semibold"
            aria-label="Фильтр по организатору"
          >
            <option value="all">Все организаторы</option>
            {(organizersQuery.data?.items ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <ToolbarSpacer />
          <ToolbarHint>{formatRange(offset, limit, total)}</ToolbarHint>
        </Toolbar>

        {seriesQuery.isError ? (
          <div className="border-danger-soft bg-danger-soft text-danger rounded-[14px] border px-4 py-3 text-sm">
            {seriesQuery.error instanceof ApiError
              ? seriesQuery.error.message
              : "Не удалось загрузить серии"}
          </div>
        ) : isDesktop ? (
          <>
            <AdminTable
              rows={items}
              rowKey={(row) => row.id}
              loading={seriesQuery.isLoading}
              empty="Серии не найдены"
              onRowClick={(row) => navigate(`/admin/series/${row.id}`)}
              columns={[
                {
                  key: "series",
                  header: "Серия",
                  headerClassName: "w-[32%]",
                  cell: (series) => (
                    <div>
                      <div className="text-sm font-bold">{series.name}</div>
                      <div className="text-ink-3 text-xs">
                        {series.organizer.slug.toUpperCase()} · {series.organizer.name}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "venue",
                  header: "Площадка",
                  cell: (series) => {
                    const flag = countryFlag(series.country.code);
                    return (
                      <div>
                        <div>{series.venue.name}</div>
                        <div className="text-ink-3 text-xs">
                          {flag ? `${flag} ` : ""}
                          {series.venue.city}
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "dates",
                  header: "Даты",
                  cell: (series) => (
                    <span className="num">{formatDateRange(series.starts_on, series.ends_on)}</span>
                  ),
                },
                {
                  key: "status",
                  header: "Статус",
                  cell: (series) => <StatusBadge kind="series" status={series.status} />,
                },
                {
                  key: "events",
                  header: "Турниров",
                  headerClassName: "text-right",
                  className: "text-right",
                  cell: (series) => (
                    <span className={cn("num", needsGrid(series) && "text-warn font-semibold")}>
                      {series.events_count}
                    </span>
                  ),
                },
                {
                  key: "updated",
                  header: "Обновлено",
                  cell: (series) => (
                    <span className="num text-ink-3 text-xs">
                      {formatUpdatedAt(series.updated_at)}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "",
                  cell: (series) =>
                    needsGrid(series) ? (
                      <NoGridMarker />
                    ) : (
                      <a
                        href={seriesPath(series)}
                        target="_blank"
                        rel="noopener"
                        onClick={(event) => event.stopPropagation()}
                        className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex size-8 items-center justify-center rounded-[8px] border"
                        title="Открыть в приложении"
                        aria-label="Открыть в приложении"
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
                          <path d="M14 4h6v6M20 4l-9 9" />
                          <path d="M18 14v5H5V6h5" />
                        </svg>
                      </a>
                    ),
                },
              ]}
            />
            <Pagination
              offset={offset}
              limit={limit}
              total={total}
              onOffsetChange={(next) => patchParams({ offset: String(next) })}
              onLimitChange={(next) => patchParams({ limit: String(next), offset: "0" })}
            />
          </>
        ) : (
          <>
            <AdminCardListStack loading={seriesQuery.isLoading} empty="Серии не найдены">
              {items.map((series) => {
                const flag = countryFlag(series.country.code);
                return (
                  <AdminCardList
                    key={series.id}
                    title={series.name}
                    subtitle={`${series.organizer.name} · ${series.venue.name}`}
                    badge={<StatusBadge kind="series" status={series.status} />}
                    fields={[
                      {
                        label: "Город",
                        value: `${flag ? `${flag} ` : ""}${series.venue.city}`,
                      },
                      {
                        label: "Даты",
                        value: formatDateRange(series.starts_on, series.ends_on),
                      },
                      {
                        label: "Турниров",
                        value: (
                          <span className={needsGrid(series) ? "text-warn" : undefined}>
                            {series.events_count}
                          </span>
                        ),
                      },
                      {
                        label: "Обновлено",
                        value: formatUpdatedAt(series.updated_at),
                      },
                    ]}
                    footer={needsGrid(series) ? <NoGridMarker /> : null}
                    onClick={() => navigate(`/admin/series/${series.id}`)}
                  />
                );
              })}
            </AdminCardListStack>
            <Pagination
              offset={offset}
              limit={limit}
              total={total}
              onOffsetChange={(next) => patchParams({ offset: String(next) })}
              onLimitChange={(next) => patchParams({ limit: String(next), offset: "0" })}
            />
          </>
        )}
      </div>

      <CreateSeriesDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setToast("Серия создана");
          void navigate(`/admin/series/${id}`);
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
