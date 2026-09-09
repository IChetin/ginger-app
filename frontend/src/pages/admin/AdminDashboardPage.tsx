import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { AdminDashboard, ChangeType } from "@/api/types/admin";
import { ApiError } from "@/api/client";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { isAdminUser, useAdminDashboard, useMe } from "@/features/admin/hooks";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={cn("size-[18px] shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function formatHeaderDate(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("ru-RU", { weekday: "long" });
  const day = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${cap}, ${day}`;
}

function attentionTaskCount(data: AdminDashboard): number {
  const a = data.attention;
  return (
    (a.imports_review.count > 0 ? 1 : 0) +
    (a.series_without_schedule.count > 0 ? 1 : 0) +
    (a.push_failed_24h.count > 0 ? 1 : 0) +
    (a.stale_series.count > 0 ? 1 : 0)
  );
}

function tasksPhrase(count: number): string {
  const phrase = pluralRu(count, "задача требует", "задачи требуют", "задач требуют");
  return `${count} ${phrase} внимания`;
}

function formatDelta(delta: number): { text: string; tone: "up" | "down" | "flat" } {
  if (delta > 0) return { text: `+${delta.toLocaleString("ru-RU")} за неделю`, tone: "up" };
  if (delta < 0) return { text: `${delta.toLocaleString("ru-RU")} за неделю`, tone: "down" };
  return { text: "без изменений за неделю", tone: "flat" };
}

function upcomingChip(startAt: string): { primary: string; secondary: string; soon: boolean } {
  const start = new Date(startAt);
  const now = new Date();
  const sameDay =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();
  if (sameDay) {
    const hours = Math.max(1, Math.round((start.getTime() - now.getTime()) / 3_600_000));
    return { primary: `${hours}ч`, secondary: "сегодня", soon: true };
  }
  return {
    primary: String(start.getDate()),
    secondary: start.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
    soon: false,
  };
}

function changeTimeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "вчера";
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function changeIconKind(
  changeType: ChangeType,
  viaImport: boolean,
): "edit" | "new" | "pub" | "imp" {
  if (viaImport) return "imp";
  if (changeType === "created") return "new";
  if (changeType === "schedule_published") return "pub";
  return "edit";
}

function labelsJoin(items: { label: string }[]): string {
  return items.map((item) => item.label).join(" · ") || "—";
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const isDesktop = useAdminDesktop();
  const { data: me } = useMe();
  const canWriteRefs = isAdminUser(me);
  const query = useAdminDashboard();
  const data = query.data;

  const tasks = data ? attentionTaskCount(data) : 0;

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex flex-wrap items-center gap-3.5 border-b px-6 py-[18px]">
        <div>
          <div className="text-xl font-extrabold">Панель управления</div>
          <div className="num text-ink-3 text-xs">
            {data
              ? `${formatHeaderDate(data.generated_at)} · ${tasksPhrase(tasks)}`
              : query.isLoading
                ? "Загрузка…"
                : "—"}
          </div>
        </div>
        <div className="flex-1" />
        {isDesktop ? (
          <>
            <Link
              to="/admin/import"
              className="border-line-gold text-ink hover:bg-gold-soft inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border bg-transparent px-4 text-sm font-bold"
            >
              <Icon>
                <path d="M12 15V3M12 3 8 7M12 3l4 4" />
                <path d="M5 15v4h14v-4" />
              </Icon>
              Импорт файла
            </Link>
            <Link
              to="/admin/series"
              className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center gap-[7px] rounded-[10px] px-4 text-sm font-extrabold"
            >
              <Icon>
                <path d="M12 5v14M5 12h14" />
              </Icon>
              Новая серия
            </Link>
          </>
        ) : null}
      </header>

      <div className="max-w-[1180px] flex-1 px-6 pt-5 pb-10">
        {query.isError ? (
          <div className="border-danger-soft bg-danger-soft text-danger rounded-[14px] border px-4 py-3 text-sm">
            {query.error instanceof ApiError ? query.error.message : "Не удалось загрузить панель"}
          </div>
        ) : null}

        {data ? (
          <>
            <div className="text-ink-3 mb-2.5 text-xs font-bold tracking-[0.07em] uppercase">
              Требует внимания
            </div>
            <div className="mb-1 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
              {data.attention.imports_review.count > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate("/admin/import?status=review")}
                  className="hover:border-line-strong flex gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[linear-gradient(var(--warn-soft),var(--warn-soft)),var(--surface)] p-3.5 text-left transition-colors"
                >
                  <span className="bg-warn-soft text-warn flex size-9 shrink-0 items-center justify-center rounded-[11px]">
                    <Icon>
                      <path d="M12 15V3M12 3 8 7M12 3l4 4" />
                      <path d="M5 15v4h14v-4" />
                    </Icon>
                  </span>
                  <span className="min-w-0">
                    <span className="num block text-[22px] leading-tight font-extrabold">
                      {data.attention.imports_review.count}
                    </span>
                    <span className="mt-0.5 block text-[13px] font-bold">импорта ждут сверки</span>
                    <span className="text-ink-3 mt-0.5 block text-xs">
                      {labelsJoin(data.attention.imports_review.items)}
                    </span>
                  </span>
                  <Icon className="text-ink-3 ml-auto self-center">
                    <path d="M9 6l6 6-6 6" />
                  </Icon>
                </button>
              ) : null}

              {data.attention.series_without_schedule.count > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate("/admin/series?status=announced&empty_events=1")}
                  className="border-line-gold bg-surface hover:border-line-strong flex gap-3 rounded-[14px] border p-3.5 text-left transition-colors"
                >
                  <span className="bg-gold-soft text-gold flex size-9 shrink-0 items-center justify-center rounded-[11px]">
                    <Icon>
                      <rect x="4" y="5" width="16" height="15" rx="3" />
                      <path d="M8 3v4M16 3v4M4 10h16" />
                    </Icon>
                  </span>
                  <span className="min-w-0">
                    <span className="num block text-[22px] leading-tight font-extrabold">
                      {data.attention.series_without_schedule.count}
                    </span>
                    <span className="mt-0.5 block text-[13px] font-bold">серии без сетки</span>
                    <span className="text-ink-3 mt-0.5 block text-xs">
                      {labelsJoin(data.attention.series_without_schedule.items)}
                    </span>
                  </span>
                  <Icon className="text-ink-3 ml-auto self-center">
                    <path d="M9 6l6 6-6 6" />
                  </Icon>
                </button>
              ) : null}

              {data.attention.push_failed_24h.count > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate("/admin/change-log?period=7")}
                  className="hover:border-line-strong flex gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[linear-gradient(var(--danger-soft),var(--danger-soft)),var(--surface)] p-3.5 text-left transition-colors"
                >
                  <span className="bg-danger-soft text-danger flex size-9 shrink-0 items-center justify-center rounded-[11px]">
                    <Icon>
                      <path d="M12 3a6 6 0 0 0-6 6v4l-1.5 3h15L18 13V9a6 6 0 0 0-6-6z" />
                      <path d="M10 19a2 2 0 0 0 4 0" />
                    </Icon>
                  </span>
                  <span className="min-w-0">
                    <span className="num block text-[22px] leading-tight font-extrabold">
                      {data.attention.push_failed_24h.count}
                    </span>
                    <span className="mt-0.5 block text-[13px] font-bold">ошибки доставки push</span>
                    <span className="text-ink-3 mt-0.5 block text-xs">за последние 24 часа</span>
                  </span>
                  <Icon className="text-ink-3 ml-auto self-center">
                    <path d="M9 6l6 6-6 6" />
                  </Icon>
                </button>
              ) : null}

              {data.attention.stale_series.count > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate("/admin/series?stale=1")}
                  className="hover:border-line-strong flex gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[linear-gradient(var(--danger-soft),var(--danger-soft)),var(--surface)] p-3.5 text-left transition-colors"
                >
                  <span className="bg-danger-soft text-danger flex size-9 shrink-0 items-center justify-center rounded-[11px]">
                    <Icon>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </Icon>
                  </span>
                  <span className="min-w-0">
                    <span className="num block text-[22px] leading-tight font-extrabold">
                      {data.attention.stale_series.count}
                    </span>
                    <span className="mt-0.5 block text-[13px] font-bold">просроченных серий</span>
                    <span className="text-ink-3 mt-0.5 block text-xs">
                      {labelsJoin(data.attention.stale_series.items)}
                    </span>
                  </span>
                  <Icon className="text-ink-3 ml-auto self-center">
                    <path d="M9 6l6 6-6 6" />
                  </Icon>
                </button>
              ) : (
                <div className="border-line bg-surface flex gap-3 rounded-[14px] border p-3.5">
                  <span className="bg-live-soft text-live flex size-9 shrink-0 items-center justify-center rounded-[11px]">
                    <Icon>
                      <path d="M5 13l4 4L19 7" />
                    </Icon>
                  </span>
                  <span className="min-w-0">
                    <span className="num block text-[22px] leading-tight font-extrabold">0</span>
                    <span className="mt-0.5 block text-[13px] font-bold">просроченных серий</span>
                    <span className="text-ink-3 mt-0.5 block text-xs">все статусы актуальны</span>
                  </span>
                </div>
              )}
            </div>

            <div className="text-ink-3 mt-[22px] mb-2.5 text-xs font-bold tracking-[0.07em] uppercase">
              Сводка
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
              <div className="border-line bg-surface rounded-[14px] border px-4 py-3.5">
                <div className="text-ink-3 text-[11px] font-semibold">Активных серий</div>
                <div className="num mt-0.5 text-[22px] font-extrabold">
                  {data.kpis.active_series.value.toLocaleString("ru-RU")}
                </div>
                <div className="text-ink-3 mt-0.5 text-xs font-bold">
                  {data.kpis.active_series.running_now} идут сейчас
                </div>
              </div>
              <div className="border-line bg-surface rounded-[14px] border px-4 py-3.5">
                <div className="text-ink-3 text-[11px] font-semibold">Турниров на неделе</div>
                <div className="num mt-0.5 text-[22px] font-extrabold">
                  {data.kpis.events_next_7d.value.toLocaleString("ru-RU")}
                </div>
                <div className="text-ink-3 mt-0.5 text-xs font-bold">
                  в {data.kpis.events_next_7d.series_count} сериях
                </div>
              </div>
              <div className="border-line bg-surface rounded-[14px] border px-4 py-3.5">
                <div className="text-ink-3 text-[11px] font-semibold">Пользователей</div>
                <div className="num mt-0.5 text-[22px] font-extrabold">
                  {data.kpis.users.value.toLocaleString("ru-RU")}
                </div>
                {(() => {
                  const delta = formatDelta(data.kpis.users.delta_7d);
                  return (
                    <div
                      className={cn(
                        "mt-0.5 text-xs font-bold",
                        delta.tone === "up" && "text-live",
                        delta.tone === "down" && "text-danger",
                        delta.tone === "flat" && "text-ink-3",
                      )}
                    >
                      {delta.text}
                    </div>
                  );
                })()}
              </div>
              <div className="border-line bg-surface rounded-[14px] border px-4 py-3.5">
                <div className="text-ink-3 text-[11px] font-semibold">Закладок</div>
                <div className="num mt-0.5 text-[22px] font-extrabold">
                  {data.kpis.bookmarks.value.toLocaleString("ru-RU")}
                </div>
                {(() => {
                  const delta = formatDelta(data.kpis.bookmarks.delta_7d);
                  return (
                    <div
                      className={cn(
                        "mt-0.5 text-xs font-bold",
                        delta.tone === "up" && "text-live",
                        delta.tone === "down" && "text-danger",
                        delta.tone === "flat" && "text-ink-3",
                      )}
                    >
                      {delta.text}
                    </div>
                  );
                })()}
              </div>
              <div className="border-line bg-surface rounded-[14px] border px-4 py-3.5">
                <div className="text-ink-3 text-[11px] font-semibold">Push за 24 ч</div>
                <div className="num mt-0.5 text-[22px] font-extrabold">
                  {data.kpis.push_24h.sent.toLocaleString("ru-RU")}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-xs font-bold",
                    data.kpis.push_24h.failed > 0 ? "text-danger" : "text-ink-3",
                  )}
                >
                  {data.kpis.push_24h.failed > 0
                    ? `${data.kpis.push_24h.failed} ошибки`
                    : "без ошибок"}
                </div>
              </div>
            </div>

            <div className="text-ink-3 mt-[22px] mb-2.5 text-xs font-bold tracking-[0.07em] uppercase">
              Оперативно
            </div>
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
              <div className="border-line bg-surface overflow-hidden rounded-[14px] border">
                <div className="border-line flex items-center gap-2.5 border-b px-4 py-3.5">
                  <Icon className="text-gold">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </Icon>
                  <span className="text-sm font-extrabold">Ближайшие старты</span>
                  <Link
                    to="/calendar"
                    target="_blank"
                    rel="noreferrer"
                    className="text-gold ml-auto text-xs font-bold"
                  >
                    Календарь
                  </Link>
                </div>
                {data.upcoming.length === 0 ? (
                  <p className="text-ink-3 px-4 py-3 text-sm">Нет ближайших стартов</p>
                ) : (
                  data.upcoming.map((item) => {
                    const chip = upcomingChip(item.start_at);
                    return (
                      <button
                        key={`${item.kind}-${item.event_id ?? item.series_id}-${item.start_at}`}
                        type="button"
                        onClick={() => {
                          if (item.event_id) navigate(`/admin/events/${item.event_id}`);
                          else navigate(`/admin/series/${item.series_id}`);
                        }}
                        className="border-line hover:bg-surface-2 flex w-full items-center gap-3 border-b px-4 py-2.5 text-left last:border-b-0"
                      >
                        <span
                          className={cn(
                            "border-line-strong bg-surface-3 inline-flex h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-[11px] border px-1.5 leading-[1.15]",
                            chip.soon &&
                              "bg-gold-grad text-ink-ongold -rotate-[2deg] border-transparent",
                          )}
                        >
                          <b className="num text-sm font-extrabold">{chip.primary}</b>
                          <span
                            className={cn(
                              "text-[9px] font-bold tracking-wide uppercase",
                              chip.soon ? "text-ink-ongold/65" : "text-ink-3",
                            )}
                          >
                            {chip.secondary}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{item.title}</span>
                          <span className="text-ink-3 mt-0.5 block text-xs">{item.subtitle}</span>
                        </span>
                        <span className="text-gold inline-flex shrink-0 items-center gap-1 text-xs font-bold">
                          <Icon className="size-[13px]">
                            <path d="M6 4h12v17l-6-4-6 4z" />
                          </Icon>
                          {item.subscribers}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="border-line bg-surface overflow-hidden rounded-[14px] border">
                <div className="border-line flex items-center gap-2.5 border-b px-4 py-3.5">
                  <Icon className="text-gold">
                    <path d="M4 6h16M4 12h16M4 18h10" />
                  </Icon>
                  <span className="text-sm font-extrabold">Последние изменения</span>
                  <Link to="/admin/change-log" className="text-gold ml-auto text-xs font-bold">
                    Весь журнал
                  </Link>
                </div>
                {data.recent_changes.length === 0 ? (
                  <p className="text-ink-3 px-4 py-3 text-sm">Пока нет записей</p>
                ) : (
                  data.recent_changes.map((entry) => {
                    const kind = changeIconKind(entry.change_type, entry.via_import);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          if (entry.event_id) navigate(`/admin/events/${entry.event_id}`);
                          else if (entry.series_id) navigate(`/admin/series/${entry.series_id}`);
                          else navigate("/admin/change-log");
                        }}
                        className="border-line hover:bg-surface-2 flex w-full items-center gap-3 border-b px-4 py-2.5 text-left last:border-b-0"
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-lg",
                            kind === "edit" && "bg-warn-soft text-warn",
                            kind === "new" && "bg-live-soft text-live",
                            kind === "pub" && "bg-gold-soft text-gold",
                            kind === "imp" && "bg-info-soft text-info",
                          )}
                        >
                          <Icon className="size-[15px]">
                            {kind === "edit" ? (
                              <path d="M4 20h4L19 9l-4-4L4 16v4z" />
                            ) : kind === "new" ? (
                              <path d="M12 5v14M5 12h14" />
                            ) : kind === "pub" ? (
                              <path d="M5 13l4 4L19 7" />
                            ) : (
                              <>
                                <path d="M12 15V3M12 3 8 7M12 3l4 4" />
                                <path d="M5 15v4h14v-4" />
                              </>
                            )}
                          </Icon>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{entry.title}</span>
                          {entry.detail ? (
                            <span className="num text-ink-2 mt-0.5 block text-xs">
                              {entry.detail}
                            </span>
                          ) : null}
                        </span>
                        <span className="num text-ink-3 shrink-0 text-[11px]">
                          {changeTimeLabel(entry.created_at)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="text-ink-3 mt-[22px] mb-2.5 text-xs font-bold tracking-[0.07em] uppercase">
              Быстрые действия
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link
                to="/admin/series"
                className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border bg-transparent px-4 text-sm font-bold"
              >
                <Icon>
                  <path d="M12 5v14M5 12h14" />
                </Icon>
                Новая серия
              </Link>
              <Link
                to="/admin/import"
                className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border bg-transparent px-4 text-sm font-bold"
              >
                <Icon>
                  <path d="M12 15V3M12 3 8 7M12 3l4 4" />
                  <path d="M5 15v4h14v-4" />
                </Icon>
                Загрузить расписание
              </Link>
              {canWriteRefs ? (
                <Link
                  to="/admin/venues"
                  className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border bg-transparent px-4 text-sm font-bold"
                >
                  <Icon>
                    <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </Icon>
                  Новая площадка
                </Link>
              ) : null}
              <Link
                to="/"
                className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border bg-transparent px-4 text-sm font-bold"
              >
                <Icon>
                  <path d="M14 4h6v6M20 4l-9 9" />
                  <path d="M18 14v5H5V6h5" />
                </Icon>
                Открыть приложение
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
