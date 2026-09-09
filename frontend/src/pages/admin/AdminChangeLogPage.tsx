import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { ChangeLogAdmin, ChangeType } from "@/api/types/admin";
import { ApiError } from "@/api/client";
import { SearchInput } from "@/components/admin/SearchInput";
import { Toolbar, ToolbarHint, ToolbarSpacer } from "@/components/admin/Toolbar";
import { isAdminUser, useAdminChangeLog, useMe, useUsersAdmin } from "@/features/admin/hooks";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const selectClass =
  "h-9 cursor-pointer rounded-[10px] border border-line-strong bg-surface px-2.5 text-[13px] font-semibold text-ink-2";

type IconKind = "edit" | "new" | "del" | "pub" | "imp";

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const datePart = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  if (sameDay(d, today)) return `Сегодня, ${datePart}`;
  if (sameDay(d, yesterday)) return `Вчера, ${datePart}`;
  return datePart;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function actorInitials(entry: ChangeLogAdmin): string {
  const source = (entry.actor_nickname || entry.actor_email || "?").trim();
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function entityName(entry: ChangeLogAdmin): string {
  if (entry.event_name) return entry.event_name;
  if (entry.series_name) return entry.series_name;
  const fromNew = entry.new_value?.name;
  const fromOld = entry.old_value?.name;
  if (typeof fromNew === "string") return fromNew;
  if (typeof fromOld === "string") return fromOld;
  return entry.entity_type;
}

function actionSuffix(entry: ChangeLogAdmin): string {
  if (entry.via_import) {
    const created = entry.new_value?.events_created;
    if (typeof created === "number") return `· ${created} турниров`;
    return "· импорт расписания";
  }
  if (entry.change_type === "cancelled") {
    return entry.entity_type === "event" || entry.entity_type === "flight"
      ? "· турнир отменён"
      : "· отменено";
  }
  if (entry.change_type === "schedule_published") return "· опубликована сетка";
  if (entry.change_type === "created") {
    if (entry.entity_type === "event") return "· добавлен турнир";
    if (entry.entity_type === "flight") return "· добавлен флайт";
    return "· создано";
  }
  if (entry.old_value?.start_at != null || entry.new_value?.start_at != null) {
    return "· перенесено время старта";
  }
  if (entry.old_value?.guarantee != null || entry.new_value?.guarantee != null) {
    return "· изменена гарантия";
  }
  return "· изменено";
}

function contextLine(entry: ChangeLogAdmin): string {
  const parts: string[] = [];
  if (entry.series_name) parts.push(entry.series_name);
  if (entry.event_number != null) parts.push(`турнир #${entry.event_number}`);
  else if (entry.event_name && entry.series_name) parts.push(entry.event_name);
  if (entry.flight_label) parts.push(entry.flight_label);
  if (entry.via_import && typeof entry.new_value?.import_job_id === "string") {
    parts.push("через импорт");
  }
  if (entry.change_type === "schedule_published" && !entry.via_import) {
    const statusOld = entry.old_value?.status;
    const statusNew = entry.new_value?.status;
    if (typeof statusOld === "string" && typeof statusNew === "string") {
      parts.push(`Статус: ${statusOld} → ${statusNew}`);
    }
  }
  return parts.join(" · ") || "—";
}

function formatScalar(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return value;
  }
  if (typeof value === "number") return String(value);
  return null;
}

function diffPairs(entry: ChangeLogAdmin): { old: string; next: string } | null {
  const keys = ["start_at", "guarantee", "buyin", "status", "name"] as const;
  for (const key of keys) {
    const oldRaw = entry.old_value?.[key];
    const newRaw = entry.new_value?.[key];
    if (oldRaw === undefined && newRaw === undefined) continue;
    if (oldRaw === newRaw) continue;
    const oldText = formatScalar(oldRaw);
    const newText = formatScalar(newRaw);
    if (!oldText && !newText) continue;
    return { old: oldText ?? "—", next: newText ?? "—" };
  }
  return null;
}

function iconKind(entry: ChangeLogAdmin): IconKind {
  if (entry.via_import) return "imp";
  if (entry.change_type === "cancelled") return "del";
  if (entry.change_type === "created") return "new";
  if (entry.change_type === "schedule_published") return "pub";
  return "edit";
}

function Icon({ kind }: { kind: IconKind }) {
  const paths: Record<IconKind, ReactNode> = {
    edit: <path d="M4 20h4L19 9l-4-4L4 16v4z" />,
    new: <path d="M12 5v14M5 12h14" />,
    del: <path d="M6 6l12 12M18 6L6 18" />,
    pub: <path d="M5 13l4 4L19 7" />,
    imp: (
      <>
        <path d="M12 15V3M12 3 8 7M12 3l4 4" />
        <path d="M5 15v4h14v-4" />
      </>
    ),
  };
  return (
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
      {paths[kind]}
    </svg>
  );
}

function DeliveryBadge({ entry }: { entry: ChangeLogAdmin }) {
  const sent = entry.notifications_sent ?? 0;
  const failed = entry.notifications_failed ?? 0;
  if (failed > 0) {
    return (
      <span className="bg-danger-soft text-danger inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-bold">
        {failed} ошибки доставки
      </span>
    );
  }
  if (sent > 0) {
    return (
      <span className="bg-live-soft text-live inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-bold">
        {sent} уведомлений
      </span>
    );
  }
  return (
    <span className="bg-surface-3 text-ink-3 inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-bold">
      без рассылки
    </span>
  );
}

function groupByDay(
  items: ChangeLogAdmin[],
): { key: string; label: string; items: ChangeLogAdmin[] }[] {
  const groups: { key: string; label: string; items: ChangeLogAdmin[] }[] = [];
  for (const item of items) {
    const key = dayKey(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: dayLabel(item.created_at), items: [item] });
    }
  }
  return groups;
}

export function AdminChangeLogPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const canListUsers = isAdminUser(me);
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE_SIZE);

  const q = params.get("q") ?? "";
  const entityType = params.get("entity_type") ?? "";
  const changeType = (params.get("change_type") ?? "") as ChangeType | "";
  const actorId = params.get("actor_id") ?? "";
  const period = (params.get("period") ?? "7") as "7" | "30" | "all";

  const usersQuery = useUsersAdmin({ limit: 100, offset: 0 }, { enabled: canListUsers });

  const query = useAdminChangeLog({
    limit,
    offset: 0,
    q: q || undefined,
    entity_type: entityType || undefined,
    change_type: changeType || undefined,
    actor_id: actorId || undefined,
    period,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const groups = useMemo(() => groupByDay(items), [items]);

  const staffActors = useMemo(() => {
    if (!canListUsers || !usersQuery.data) return [];
    return usersQuery.data.items.filter((user) => user.role === "admin" || user.role === "editor");
  }, [canListUsers, usersQuery.data]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setLimit(PAGE_SIZE);
  };

  const openEntry = (entry: ChangeLogAdmin) => {
    if (entry.event_id) {
      navigate(`/admin/events/${entry.event_id}`);
      return;
    }
    if (entry.series_id) {
      navigate(`/admin/series/${entry.series_id}`);
    }
  };

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex items-center gap-3.5 border-b px-6 py-[18px]">
        <div>
          <div className="text-xl font-extrabold">Журнал изменений</div>
          <div className="text-ink-3 text-xs">Все правки контента и связанные рассылки</div>
        </div>
      </header>

      <div className="flex-1 px-6 pt-5 pb-10">
        <Toolbar>
          <SearchInput
            value={q}
            onChange={(value) => setFilter("q", value)}
            placeholder="Поиск по названию серии или турнира"
          />
          <select
            className={selectClass}
            value={entityType}
            aria-label="Тип объекта"
            onChange={(e) => setFilter("entity_type", e.target.value)}
          >
            <option value="">Все объекты</option>
            <option value="series">Серии</option>
            <option value="event">Турниры</option>
            <option value="flight">Флайты</option>
            <option value="import">Импорт</option>
          </select>
          <select
            className={selectClass}
            value={changeType}
            aria-label="Тип действия"
            onChange={(e) => setFilter("change_type", e.target.value)}
          >
            <option value="">Все действия</option>
            <option value="created">Создание</option>
            <option value="updated">Изменение</option>
            <option value="cancelled">Отмена</option>
            <option value="schedule_published">Публикация сетки</option>
          </select>
          {canListUsers ? (
            <select
              className={selectClass}
              value={actorId}
              aria-label="Автор"
              onChange={(e) => setFilter("actor_id", e.target.value)}
            >
              <option value="">Все авторы</option>
              {staffActors.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className={selectClass}
            value={period}
            aria-label="Период"
            onChange={(e) => setFilter("period", e.target.value)}
          >
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="all">Всё время</option>
          </select>
          <ToolbarSpacer />
          <ToolbarHint>{total} записей</ToolbarHint>
        </Toolbar>

        {query.isError ? (
          <div className="border-danger-soft bg-danger-soft text-danger rounded-[14px] border px-4 py-3 text-sm">
            {query.error instanceof ApiError ? query.error.message : "Не удалось загрузить журнал"}
          </div>
        ) : null}

        {query.isLoading ? <p className="text-ink-3 text-sm">Загрузка…</p> : null}

        {!query.isLoading && items.length === 0 ? (
          <p className="text-ink-3 text-sm">Записей нет</p>
        ) : null}

        {groups.map((group) => (
          <div key={group.key} className="mb-4">
            <div className="text-ink-3 mt-5 mb-2.5 flex items-center gap-2.5 text-xs font-bold tracking-[0.06em] uppercase">
              {group.label}
              <span className="bg-line h-px flex-1" />
            </div>
            <div className="border-line bg-surface overflow-hidden rounded-[14px] border">
              {group.items.map((entry) => {
                const kind = iconKind(entry);
                const diff = diffPairs(entry);
                const titleName = entry.via_import ? "Импорт расписания" : entityName(entry);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => openEntry(entry)}
                    className="border-line hover:bg-surface-2 flex w-full items-start gap-3.5 border-b px-4 py-3.5 text-left last:border-b-0"
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px]",
                        kind === "edit" && "bg-warn-soft text-warn",
                        kind === "new" && "bg-live-soft text-live",
                        kind === "del" && "bg-danger-soft text-danger",
                        kind === "pub" && "bg-gold-soft text-gold",
                        kind === "imp" && "bg-info-soft text-info",
                      )}
                    >
                      <Icon kind={kind} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">
                        {titleName}{" "}
                        <span className="text-ink-3 font-semibold">{actionSuffix(entry)}</span>
                      </div>
                      <div className="text-ink-3 mt-0.5 text-xs">{contextLine(entry)}</div>
                      {diff ? (
                        <div className="border-line-strong bg-surface-3 font-variant-numeric mt-1.5 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] tabular-nums">
                          <span className="text-ink-3 line-through">{diff.old}</span>
                          <span className="text-gold">→</span>
                          <span className="text-ink font-bold">{diff.next}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                      <span className="font-variant-numeric text-ink-3 text-xs tabular-nums">
                        {timeLabel(entry.created_at)}
                      </span>
                      <span className="text-ink-2 inline-flex items-center gap-1.5 text-xs">
                        <span className="border-line-strong bg-surface-3 text-ink-2 inline-flex size-5 items-center justify-center rounded-md border text-[9px] font-extrabold">
                          {actorInitials(entry)}
                        </span>
                        {entry.actor_email ?? "Система"}
                      </span>
                      <DeliveryBadge entry={entry} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {items.length < total ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              className="border-line-strong text-ink-2 hover:bg-surface-2 inline-flex h-[31px] items-center rounded-lg border px-3 text-[13px] font-bold"
              onClick={() => setLimit((value) => value + PAGE_SIZE)}
            >
              Показать ещё
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
