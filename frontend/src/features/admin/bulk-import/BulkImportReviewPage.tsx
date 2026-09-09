import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type {
  BulkAction,
  BulkCounts,
  BulkIssue,
  BulkPublishReport,
  BulkSeriesPlan,
} from "@/api/types/bulkImport";
import { DesktopOnlyStub } from "@/components/admin/DesktopOnlyStub";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import {
  useBulkJob,
  useBulkPreview,
  usePublishBulkImport,
} from "@/features/admin/bulk-import/hooks";
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<BulkAction, string> = {
  create: "новая",
  update: "обновится",
  unchanged: "без изменений",
  missing: "нет в файле",
};

const ACTION_TONES: Record<BulkAction, string> = {
  create: "bg-live-soft text-live",
  update: "bg-warn-soft text-warn",
  unchanged: "bg-surface-2 text-ink-3",
  missing: "bg-danger-soft text-danger",
};

function ActionBadge({ action }: { action: BulkAction }) {
  return (
    <span
      className={cn(
        "inline-flex h-[21px] shrink-0 items-center rounded-full px-2 text-[11px] font-bold",
        ACTION_TONES[action],
      )}
    >
      {ACTION_LABELS[action]}
    </span>
  );
}

function CountsCard({ title, counts }: { title: string; counts: BulkCounts }) {
  const rows: [string, number, string][] = [
    ["новых", counts.created, "text-live"],
    ["обновится", counts.updated, "text-warn"],
    ["без изменений", counts.unchanged, "text-ink-3"],
    ["нет в файле", counts.missing, counts.missing > 0 ? "text-danger" : "text-ink-3"],
  ];
  return (
    <div className="border-line bg-surface rounded-[14px] border p-3.5">
      <div className="text-ink-2 mb-2 text-xs font-extrabold uppercase">{title}</div>
      <dl className="space-y-1">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-ink-3 text-[13px]">{label}</dt>
            <dd className={cn("text-[15px] font-extrabold", tone)}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DiffLine({
  label,
  oldValue,
  newValue,
}: {
  label: string;
  oldValue: string | null;
  newValue: string | null;
}) {
  return (
    <div className="text-[13px]">
      <span className="text-ink-2 font-bold">{label}: </span>
      <span className="text-ink-3 line-through">{oldValue ?? "—"}</span>
      <span className="text-ink-3"> → </span>
      <span className="text-ink font-bold">{newValue ?? "—"}</span>
    </div>
  );
}

function SeriesPlanCard({ plan }: { plan: BulkSeriesPlan }) {
  const [open, setOpen] = useState(plan.action !== "unchanged");
  const changedEvents = plan.events.filter((event) => event.action !== "unchanged");
  return (
    <li className="border-line bg-surface rounded-[14px] border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ActionBadge action={plan.action} />
            <span className="text-ink truncate text-sm font-extrabold">{plan.name}</span>
          </div>
          <p className="text-ink-3 mt-0.5 text-xs">
            {plan.import_key} · турниров с изменениями: {changedEvents.length} из{" "}
            {plan.events.length}
            {plan.recipients > 0 ? ` · push: ${plan.recipients}` : ""}
          </p>
        </div>
        <span className="text-ink-3 shrink-0 text-xs font-bold">
          {open ? "свернуть" : "детали"}
        </span>
      </button>

      {open ? (
        <div className="border-line space-y-3 border-t px-3.5 py-3">
          {plan.diffs.length > 0 ? (
            <div className="space-y-1">
              <div className="text-ink-2 text-xs font-extrabold uppercase">Поля серии</div>
              {plan.diffs.map((diff) => (
                <DiffLine
                  key={diff.field}
                  label={diff.label}
                  oldValue={diff.old_value}
                  newValue={diff.new_value}
                />
              ))}
            </div>
          ) : null}

          {changedEvents.length === 0 ? (
            <p className="text-ink-3 text-[13px]">Турниры без изменений</p>
          ) : (
            <ul className="space-y-2.5">
              {changedEvents.map((event) => (
                <li key={`${event.import_key ?? ""}-${event.name}`} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ActionBadge action={event.action} />
                    <span className="text-ink text-[13px] font-bold">{event.name}</span>
                    {event.recipients > 0 ? (
                      <span className="bg-info-soft text-info inline-flex h-[21px] items-center rounded-full px-2 text-[11px] font-bold">
                        push: {event.recipients}
                      </span>
                    ) : null}
                  </div>
                  {event.diffs.map((diff) => (
                    <DiffLine
                      key={diff.field}
                      label={diff.label}
                      oldValue={diff.old_value}
                      newValue={diff.new_value}
                    />
                  ))}
                  {event.flights
                    .filter((flight) => flight.action !== "unchanged")
                    .map((flight) => (
                      <div key={flight.label ?? "single"} className="pl-3 text-[13px]">
                        <span className="text-ink-2 font-bold">
                          Старт {flight.label ?? "(единственный)"}:{" "}
                        </span>
                        {flight.action === "create" ? (
                          <span className="text-live font-bold">
                            новый, {flight.starts_at_local ?? "—"}
                          </span>
                        ) : flight.action === "missing" ? (
                          <span className="text-ink-3">нет в файле</span>
                        ) : (
                          flight.diffs.map((diff) => (
                            <span key={diff.field}>
                              <span className="text-ink-3 line-through">
                                {diff.old_value ?? "—"}
                              </span>
                              <span className="text-ink-3"> → </span>
                              <span className="text-ink font-bold">{diff.new_value ?? "—"}</span>
                            </span>
                          ))
                        )}
                      </div>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function IssuesTable({ issues }: { issues: BulkIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-[15px] font-extrabold">Замечания ({issues.length})</h2>
      <div className="border-line bg-surface overflow-hidden rounded-[14px] border">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-ink-3 text-left text-[11px] uppercase">
            <tr>
              <th className="px-3 py-2 font-extrabold">Строка</th>
              <th className="px-3 py-2 font-extrabold">Колонка</th>
              <th className="px-3 py-2 font-extrabold">Серия</th>
              <th className="px-3 py-2 font-extrabold">Что не так</th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {issues.map((issue, index) => (
              <tr
                key={`${issue.code}-${issue.row ?? 0}-${issue.field ?? ""}-${index}`}
                className={issue.severity === "error" ? "bg-danger-soft/40" : undefined}
              >
                <td className="text-ink-2 px-3 py-2 tabular-nums">{issue.row ?? "—"}</td>
                <td className="text-ink-2 px-3 py-2">
                  {issue.column ?? "—"}
                  {issue.field ? <span className="text-ink-3"> · {issue.field}</span> : null}
                </td>
                <td className="text-ink-3 px-3 py-2">{issue.series_key ?? "—"}</td>
                <td
                  className={cn(
                    "px-3 py-2",
                    issue.severity === "error" ? "text-danger font-bold" : "text-ink-2",
                  )}
                >
                  {issue.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportPanel({ report }: { report: BulkPublishReport }) {
  const lines: [string, string][] = [
    ["Серии", `создано ${report.series_created}, обновлено ${report.series_updated}`],
    [
      "Турниры",
      `создано ${report.events_created}, обновлено ${report.events_updated}, отменено ${report.events_cancelled}`,
    ],
    ["Старты", `создано ${report.flights_created}, обновлено ${report.flights_updated}`],
    [
      "Уведомления",
      report.notifications_suppressed
        ? "не отправлялись (галочка была снята)"
        : `поставлено в очередь: ${report.notifications_enqueued}`,
    ],
  ];
  const created = [
    ["Организаторы", report.organizers_created],
    ["Площадки", report.venues_created],
    ["Страны", report.countries_created],
  ] as const;
  return (
    <div className="border-line-gold bg-gold-soft rounded-[14px] border p-4">
      <div className="text-[15px] font-extrabold">Опубликовано</div>
      <dl className="mt-2 space-y-1 text-[13px]">
        {lines.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="text-ink-2 w-[110px] shrink-0 font-bold">{label}</dt>
            <dd className="text-ink">{value}</dd>
          </div>
        ))}
        {created
          .filter(([, items]) => items.length > 0)
          .map(([label, items]) => (
            <div key={label} className="flex gap-2">
              <dt className="text-ink-2 w-[110px] shrink-0 font-bold">{label}</dt>
              <dd className="text-ink">создано: {items.join(", ")}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

export function BulkImportReviewPage() {
  const isDesktop = useAdminDesktop();
  const { jobId = "" } = useParams<{ jobId: string }>();
  const [markMissingCancelled, setMarkMissingCancelled] = useState(false);
  const [notify, setNotify] = useState(true);

  const jobQuery = useBulkJob(jobId);
  const job = jobQuery.data;
  const isReview = job?.status === "review";
  const previewQuery = useBulkPreview(jobId, markMissingCancelled, {
    enabled: Boolean(job) && isReview,
  });
  const publishMutation = usePublishBulkImport(jobId);

  if (!isDesktop) {
    return <DesktopOnlyStub title="Массовая загрузка — на компьютере" />;
  }

  if (jobQuery.isLoading) {
    return <p className="text-ink-3 text-sm">Загружаем…</p>;
  }

  if (!job) {
    return <p className="text-danger text-sm">Загрузка не найдена</p>;
  }

  const preview = previewQuery.data ?? null;
  const draft = job.draft;
  const report = draft?.report ?? publishMutation.data?.report ?? null;
  const issues = preview?.issues ?? draft?.issues ?? [];
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const newReferences = preview?.new_references;
  const hasNewReferences = Boolean(
    newReferences &&
    (newReferences.organizers.length > 0 ||
      newReferences.venues.length > 0 ||
      newReferences.countries.length > 0),
  );

  return (
    <div className="space-y-[22px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold">{job.original_filename}</h1>
          <p className="text-ink-3 mt-0.5 text-xs">
            Строк в файле: {draft?.rows_total ?? 0}
            {draft?.demo_rows_skipped.length
              ? ` · пропущено строк-примеров: ${draft.demo_rows_skipped.length}`
              : ""}
            {draft?.empty_rows_skipped ? ` · пустых: ${draft.empty_rows_skipped}` : ""}
          </p>
        </div>
        <Link
          to="/admin/import/bulk"
          className="border-line-strong text-ink-2 hover:text-ink inline-flex h-[38px] shrink-0 items-center rounded-[10px] border px-3.5 text-[13px] font-bold"
        >
          К загрузкам
        </Link>
      </div>

      {job.status === "failed" ? (
        <p className="text-danger text-sm">{job.error ?? "Файл не удалось разобрать"}</p>
      ) : null}

      {report ? <ReportPanel report={report} /> : null}

      {isReview ? (
        <>
          {previewQuery.isLoading ? <p className="text-ink-3 text-sm">Считаем изменения…</p> : null}
          {previewQuery.error instanceof ApiError ? (
            <p className="text-danger text-sm">{previewQuery.error.message}</p>
          ) : null}

          {preview ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <CountsCard title="Серии" counts={preview.series} />
                <CountsCard title="Турниры" counts={preview.events} />
                <CountsCard title="Старты" counts={preview.flights} />
              </div>

              <section
                className={cn(
                  "rounded-[14px] border p-4",
                  preview.total_recipients > 0
                    ? "border-line-gold bg-gold-soft"
                    : "border-line bg-surface",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[15px] font-extrabold">Push подписчикам</h2>
                  <span
                    className={cn(
                      "text-lg font-extrabold tabular-nums",
                      preview.total_recipients > 0 ? "text-gold" : "text-ink-3",
                    )}
                  >
                    {preview.total_recipients}
                  </span>
                </div>
                {preview.impacts.length === 0 ? (
                  <p className="text-ink-3 mt-1 text-[13px]">
                    Изменений, о которых уведомляют подписчиков, нет
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {preview.impacts.map((impact, index) => (
                      <li key={`${impact.type}-${index}`} className="text-[13px]">
                        <span className="text-ink font-bold">{impact.title}</span>
                        <span className="text-ink-2"> — {impact.body}</span>
                        <span className="text-ink-3"> · получателей: {impact.recipient_count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {hasNewReferences && newReferences ? (
                <section className="border-warn bg-warn-soft space-y-1 rounded-[14px] border p-4">
                  <h2 className="text-[15px] font-extrabold">Будут созданы</h2>
                  <p className="text-ink-2 text-[13px]">
                    Проверьте на опечатки: новые справочники создаются автоматически.
                  </p>
                  {newReferences.organizers.length > 0 ? (
                    <p className="text-[13px]">
                      <span className="text-ink-2 font-bold">Организаторы: </span>
                      {newReferences.organizers.join(", ")}
                    </p>
                  ) : null}
                  {newReferences.venues.length > 0 ? (
                    <p className="text-[13px]">
                      <span className="text-ink-2 font-bold">Площадки: </span>
                      {newReferences.venues
                        .map((venue) => `${venue.name} (${venue.city}, ${venue.timezone})`)
                        .join(", ")}
                    </p>
                  ) : null}
                  {newReferences.countries.length > 0 ? (
                    <p className="text-[13px]">
                      <span className="text-ink-2 font-bold">Страны: </span>
                      {newReferences.countries.join(", ")}
                    </p>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-2">
                <h2 className="text-[15px] font-extrabold">Что изменится</h2>
                {preview.plans.length === 0 ? (
                  <p className="text-ink-3 text-sm">Серий в файле нет</p>
                ) : (
                  <ul className="space-y-2">
                    {preview.plans.map((plan) => (
                      <SeriesPlanCard key={plan.import_key} plan={plan} />
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}

          <IssuesTable issues={issues} />

          <div className="border-line bg-surface space-y-3 rounded-[14px] border p-4">
            <label className="flex items-start gap-2.5 text-[13px]">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={notify}
                onChange={(event) => setNotify(event.target.checked)}
              />
              <span>
                <span className="text-ink font-bold">Отправлять уведомления подписчикам</span>
                <span className="text-ink-3 block text-xs">
                  Снимите, если правите опечатки и беспокоить людей не нужно
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-[13px]">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={markMissingCancelled}
                onChange={(event) => setMarkMissingCancelled(event.target.checked)}
              />
              <span>
                <span className="text-ink font-bold">
                  Отметить отсутствующие в файле турниры как отменённые
                </span>
                <span className="text-ink-3 block text-xs">
                  По умолчанию турниры, которых нет в файле, остаются как есть
                </span>
              </span>
            </label>

            {errorCount > 0 ? (
              <p className="text-danger text-sm">
                Публикация недоступна: ошибок в файле — {errorCount}. Исправьте строки из таблицы
                выше и загрузите файл заново.
              </p>
            ) : null}
            {publishMutation.error instanceof ApiError ? (
              <p className="text-danger text-sm">{publishMutation.error.message}</p>
            ) : null}

            <button
              type="button"
              disabled={
                !preview ||
                !preview.can_publish ||
                previewQuery.isFetching ||
                publishMutation.isPending
              }
              onClick={() => {
                if (!preview) return;
                void publishMutation.mutateAsync({
                  previewToken: preview.preview_token,
                  markMissingCancelled,
                  notify,
                });
              }}
              className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-50"
            >
              {publishMutation.isPending ? "Публикуем…" : "Опубликовать"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
