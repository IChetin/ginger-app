import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFieldArray, useForm } from "react-hook-form";

import { ApiError } from "@/api/client";
import type {
  DraftEvent,
  ImportPublishPreview,
  ParsePath,
  ScheduleImportDraft,
} from "@/api/types/imports";
import { DesktopOnlyStub } from "@/components/admin/DesktopOnlyStub";
import { Modal } from "@/components/admin/Modal";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { NotificationPreviewDialog } from "@/features/admin/components/NotificationPreviewDialog";
import {
  useCancelImport,
  useImportJob,
  usePreviewImportPublish,
  usePublishImport,
  useUpdateImportDraft,
} from "@/features/admin/import/hooks";
import { StructureImportReview } from "@/features/admin/import/StructureImportReview";
import { cn } from "@/lib/utils";

type FormValues = {
  events: ScheduleImportDraft["events"];
};

function isFreerollBuyin(value: string | null | undefined): boolean {
  if (value == null || value.trim() === "") return false;
  return Number(value) === 0;
}

function confidenceOf(event: DraftEvent, field: string): number | null {
  const raw = event.field_confidence?.[field];
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function cellTone(event: DraftEvent, field: string): string {
  const issue = event.issues?.find(
    (item) => item.field === field || item.field.endsWith(`.${field}`),
  );
  if (issue?.severity === "error") {
    return "border-danger bg-danger-soft";
  }
  const conf = confidenceOf(event, field);
  if (issue?.severity === "warning" || (conf != null && conf < 0.7)) {
    return "border-warn bg-warn-soft";
  }
  return "border-transparent hover:border-line-strong hover:bg-surface-2";
}

function pathBadge(path: ParsePath | null | undefined, hasError: boolean) {
  if (hasError) {
    return (
      <span className="bg-danger-soft text-danger inline-flex h-[21px] items-center rounded-full px-2 text-[11px] font-bold">
        ошибка
      </span>
    );
  }
  if (path === "ai") {
    return (
      <span className="bg-info-soft text-info inline-flex h-[21px] items-center rounded-full px-2 text-[11px] font-bold">
        ИИ
      </span>
    );
  }
  if (path === "mixed") {
    return (
      <span className="bg-info-soft text-info inline-flex h-[21px] items-center rounded-full px-2 text-[11px] font-bold">
        code+ИИ
      </span>
    );
  }
  return (
    <span className="bg-live-soft text-live inline-flex h-[21px] items-center rounded-full px-2 text-[11px] font-bold">
      код
    </span>
  );
}

function formatMoney(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("ru-RU");
}

function playDateInput(value: string | undefined): string {
  return value?.slice(0, 10) ?? "";
}

function playTimeInput(value: string | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mb-[22px] flex items-center gap-2.5">
      {(
        [
          [1, "Загрузка файла"],
          [2, "Распознавание"],
          [3, "Сверка и публикация"],
        ] as const
      ).map(([n, label], index) => (
        <div key={n} className="flex items-center gap-2.5">
          {index > 0 ? <span className="bg-line-strong h-px w-[34px]" /> : null}
          <div
            className={cn(
              "flex items-center gap-2 text-[13px] font-bold",
              step === n ? "text-gold" : step > n ? "text-ink-2" : "text-ink-3",
            )}
          >
            <span
              className={cn(
                "flex size-[26px] items-center justify-center rounded-lg border text-xs",
                step === n
                  ? "bg-gold-grad text-ink-ongold -rotate-[3deg] border-transparent"
                  : step > n
                    ? "border-line-gold bg-gold-soft text-gold"
                    : "border-line-strong bg-surface-2",
              )}
            >
              {n}
            </span>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ImportReviewPage() {
  const isDesktop = useAdminDesktop();
  const { jobId = "" } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const jobQuery = useImportJob(jobId);
  const updateDraft = useUpdateImportDraft(jobId);
  const previewMutation = usePreviewImportPublish(jobId);
  const publishMutation = usePublishImport(jobId);
  const cancelMutation = useCancelImport(jobId);
  const [preview, setPreview] = useState<ImportPublishPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fragment, setFragment] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: { events: [] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "events" });

  useEffect(() => {
    const draft = jobQuery.data?.draft;
    if (draft && draft.kind !== "structures" && draft.events) {
      form.reset({ events: draft.events });
    }
  }, [form, jobQuery.data]);

  const watchedEvents = form.watch("events");
  const hasFreeroll = watchedEvents.some((event) => isFreerollBuyin(event.buyin));

  const summary = useMemo(() => {
    let ok = 0;
    let warn = 0;
    let err = 0;
    for (const event of watchedEvents) {
      const issues = event.issues ?? [];
      if (issues.some((item) => item.severity === "error")) err += 1;
      else if (issues.some((item) => item.severity === "warning")) warn += 1;
      else if (Object.values(event.field_confidence ?? {}).some((value) => Number(value) < 0.7)) {
        warn += 1;
      } else ok += 1;
    }
    return { total: watchedEvents.length, ok, warn, err };
  }, [watchedEvents]);

  const saveDraft = async (values: FormValues) => {
    const previous =
      jobQuery.data?.draft && jobQuery.data.draft.kind !== "structures"
        ? jobQuery.data.draft
        : null;
    await updateDraft.mutateAsync({
      kind: "schedule",
      events: values.events,
      unparsed_rows: previous?.unparsed_rows ?? [],
      confidence: previous?.confidence ?? null,
      issues: [],
    });
  };

  if (!isDesktop) {
    return <DesktopOnlyStub title="Импорт — на компьютере" />;
  }

  if (jobQuery.isLoading) {
    return <p className="text-ink-3 text-sm">Загрузка импорта…</p>;
  }
  if (jobQuery.isError || !jobQuery.data) {
    return (
      <p className="text-danger text-sm">
        {jobQuery.error instanceof ApiError ? jobQuery.error.message : "Import job not found"}
      </p>
    );
  }

  const job = jobQuery.data;
  if (job.import_kind === "structures") {
    return <StructureImportReview job={job} />;
  }

  const pathLabel =
    job.parse_path === "mixed"
      ? "code + ИИ"
      : job.parse_path === "ai"
        ? "ИИ"
        : job.parse_path === "code"
          ? "код"
          : "—";

  return (
    <div className="pb-24">
      <div className="mb-4">
        <p className="text-ink-3 text-sm">
          <Link to="/admin/import" className="hover:text-gold">
            ← Импорт
          </Link>
        </p>
        <h1 className="mt-1 text-xl font-extrabold">{job.original_filename}</h1>
        <p className="text-ink-3 mt-0.5 text-xs">
          {job.status}
          {job.parser_requested ? ` · запрошен ${job.parser_requested}` : ""}
          {job.parser_used ? ` · сработал ${job.parser_used}` : ""}
          {job.confidence ? ` · conf ${job.confidence}` : ""}
          {job.file_timezone ? ` · TZ ${job.file_timezone}` : ""}
        </p>
      </div>

      <Stepper step={3} />

      {job.parser_mismatch_reason ? (
        <div className="border-warn/40 bg-warn-soft text-warn mb-4 rounded-[14px] border p-3 text-sm">
          {job.parser_mismatch_reason}
        </div>
      ) : null}

      {job.status === "failed" ? (
        <div className="border-danger/40 bg-danger-soft text-danger mb-4 rounded-[14px] border p-4 text-sm">
          {job.error ?? "Разбор не удался"}
        </div>
      ) : null}

      {(job.draft && job.draft.kind !== "structures" ? job.draft.issues : [])?.length ? (
        <ul className="border-warn/40 bg-warn-soft text-warn mb-4 space-y-1 rounded-[14px] border p-3 text-sm">
          {(job.draft && job.draft.kind !== "structures" ? job.draft.issues : [])!.map((issue) => (
            <li key={`${issue.field}-${issue.message}`}>
              [{issue.severity}] {issue.field}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2.5">
        <SumCard value={String(summary.total)} label="строк распознано" />
        <SumCard value={String(summary.ok)} label="без замечаний" valueClass="text-live" />
        <SumCard value={String(summary.warn)} label="проверить" valueClass="text-warn" warn />
        <SumCard value={String(summary.err)} label="ошибка" valueClass="text-danger" warn />
        <SumCard value={pathLabel} label={`путь разбора · ${job.tokens_input ?? 0} ток.`} />
      </div>

      {hasFreeroll ? (
        <div className="border-warn/40 bg-warn-soft text-warn mb-4 rounded-[14px] border p-3 text-sm">
          Freeroll: buy-in = 0 у одного или нескольких событий. Это допустимо, проверьте перед
          публикацией.
        </div>
      ) : null}

      <form
        onSubmit={form.handleSubmit(async (values) => {
          await saveDraft(values);
        })}
      >
        <div className="border-line bg-surface overflow-hidden rounded-[14px] border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-line bg-surface-2 text-ink-3 border-b text-left text-[11px] font-bold tracking-wide uppercase">
                <th className="w-11 px-3 py-2.5">№</th>
                <th className="w-[24%] px-3 py-2.5">Название</th>
                <th className="px-3 py-2.5">Дата</th>
                <th className="px-3 py-2.5">Время</th>
                <th className="px-3 py-2.5 text-right">Бай-ин</th>
                <th className="px-3 py-2.5 text-right">Гарантия</th>
                <th className="px-3 py-2.5">Тип</th>
                <th className="px-3 py-2.5">Источник</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const event = watchedEvents[index] ?? (field as DraftEvent);
                const hasError = (event.issues ?? []).some((item) => item.severity === "error");
                const hasWarn =
                  hasError ||
                  (event.issues ?? []).some((item) => item.severity === "warning") ||
                  Object.values(event.field_confidence ?? {}).some((value) => Number(value) < 0.7);
                return (
                  <tr
                    key={field.id}
                    className={cn(
                      "border-line border-b last:border-0",
                      hasError ? "bg-danger-soft" : hasWarn ? "bg-warn-soft" : "",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        className={cn(
                          "font-variant-numeric h-8 w-full rounded-lg border bg-transparent px-2 tabular-nums",
                          cellTone(event, "number"),
                        )}
                        {...form.register(`events.${index}.number`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className={cn(
                          "h-8 w-full rounded-lg border bg-transparent px-2",
                          cellTone(event, "name"),
                        )}
                        {...form.register(`events.${index}.name`)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="date"
                        className={cn(
                          "font-variant-numeric h-8 w-full rounded-lg border bg-transparent px-2 tabular-nums",
                          cellTone(event, "flights.0.play_date"),
                        )}
                        value={playDateInput(form.watch(`events.${index}.flights.0.play_date`))}
                        onChange={(e) =>
                          form.setValue(`events.${index}.flights.0.play_date`, e.target.value, {
                            shouldDirty: true,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="time"
                        className={cn(
                          "font-variant-numeric h-8 w-full rounded-lg border bg-transparent px-2 tabular-nums",
                          cellTone(event, "flights.0.play_time"),
                        )}
                        value={playTimeInput(form.watch(`events.${index}.flights.0.play_time`))}
                        onChange={(e) =>
                          form.setValue(
                            `events.${index}.flights.0.play_time`,
                            e.target.value ? `${e.target.value}:00` : "",
                            { shouldDirty: true },
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className={cn(
                          "font-variant-numeric h-8 w-full rounded-lg border bg-transparent px-2 text-right tabular-nums",
                          cellTone(event, "buyin"),
                        )}
                        {...form.register(`events.${index}.buyin`)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className={cn(
                          "font-variant-numeric h-8 w-full rounded-lg border bg-transparent px-2 text-right tabular-nums",
                          cellTone(event, "guarantee"),
                        )}
                        placeholder="—"
                        value={form.watch(`events.${index}.guarantee`) ?? ""}
                        onChange={(e) =>
                          form.setValue(`events.${index}.guarantee`, e.target.value || null, {
                            shouldDirty: true,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className={cn(
                          "h-8 w-full rounded-lg border bg-transparent px-2",
                          cellTone(event, "game_type"),
                        )}
                        {...form.register(`events.${index}.game_type`)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      {pathBadge(event.parse_path ?? job.parse_path, hasError)}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-1">
                        {event.source_fragment ? (
                          <button
                            type="button"
                            title="Показать фрагмент файла"
                            className="border-line-strong text-ink-2 inline-flex size-[31px] items-center justify-center rounded-lg border"
                            onClick={() => setFragment(event.source_fragment ?? null)}
                          >
                            <svg
                              className="size-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            >
                              <circle cx="12" cy="12" r="3" />
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                            </svg>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="border-line-strong text-ink-2 inline-flex size-[31px] items-center justify-center rounded-lg border"
                          onClick={() => remove(index)}
                          aria-label="Удалить строку"
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {updateDraft.error instanceof ApiError ? (
          <p className="text-danger mt-3 text-sm">{updateDraft.error.message}</p>
        ) : null}
        {previewMutation.error instanceof ApiError ? (
          <p className="text-danger mt-3 text-sm">{previewMutation.error.message}</p>
        ) : null}
        {cancelMutation.error instanceof ApiError ? (
          <p className="text-danger mt-3 text-sm">{cancelMutation.error.message}</p>
        ) : null}

        <div className="border-line-strong bg-surface sticky bottom-0 z-10 -mx-6 mt-[18px] flex items-center gap-3 border-t px-6 py-3.5">
          <span className="text-ink-3 text-[11px]">
            Публикация создаст {summary.total} турниров
            {job.file_timezone ? ` · TZ ${job.file_timezone}` : ""}
            {hasFreeroll ? ` · есть freeroll (${formatMoney("0")})` : ""}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            disabled={job.status !== "review" || cancelMutation.isPending}
            className="border-line-strong text-ink-2 inline-flex h-[38px] items-center rounded-[10px] border px-4 text-sm font-bold disabled:opacity-50"
            onClick={() => {
              if (!window.confirm("Отменить импорт без публикации? Черновик будет сброшен.")) {
                return;
              }
              void cancelMutation.mutateAsync().then(() => {
                void navigate("/admin/import");
              });
            }}
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={updateDraft.isPending}
            className="border-line-strong text-ink-2 inline-flex h-[38px] items-center rounded-[10px] border px-4 text-sm font-bold"
          >
            Сохранить черновик
          </button>
          <button
            type="button"
            className="border-line-gold text-ink inline-flex h-[38px] items-center rounded-[10px] border px-4 text-sm font-bold"
            onClick={() =>
              append({
                number: summary.total + 1,
                name: "",
                buyin: "0",
                currency_code: "RUB",
                guarantee: null,
                game_type: "nlh",
                tags: [],
                flights: [
                  {
                    label: null,
                    play_date: "",
                    play_time: "12:00:00",
                  },
                ],
                issues: [],
                field_confidence: {},
                parse_path: "code",
              })
            }
          >
            + Строка
          </button>
          <button
            type="button"
            disabled={job.status !== "review" || previewMutation.isPending}
            className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-50"
            onClick={() => {
              void form.handleSubmit(async (values) => {
                await saveDraft(values);
                const result = await previewMutation.mutateAsync();
                setPreview(result);
                setPreviewOpen(true);
              })();
            }}
          >
            Опубликовать {summary.total} турниров
          </button>
          <button
            type="button"
            className="sr-only"
            disabled={job.status !== "review" || previewMutation.isPending}
            onClick={() => {
              void form.handleSubmit(async (values) => {
                await saveDraft(values);
                const result = await previewMutation.mutateAsync();
                setPreview(result);
                setPreviewOpen(true);
              })();
            }}
          >
            Превью публикации
          </button>
        </div>
      </form>

      <Modal open={fragment != null} onClose={() => setFragment(null)} title="Фрагмент файла">
        <pre className="bg-surface-2 text-ink-2 rounded-[10px] p-3 text-[13px] whitespace-pre-wrap">
          {fragment}
        </pre>
      </Modal>

      <NotificationPreviewDialog
        open={previewOpen}
        preview={
          preview
            ? {
                preview_token: preview.preview_token,
                expires_in_seconds: preview.expires_in_seconds,
                entity_type: "series",
                entity_id: preview.series_id,
                diffs: preview.diffs,
                impacts: preview.impacts,
                total_recipients: preview.total_recipients,
                requires_confirmation: preview.requires_confirmation,
              }
            : null
        }
        isConfirming={publishMutation.isPending}
        errorMessage={
          publishMutation.error instanceof ApiError ? publishMutation.error.message : null
        }
        onOpenChange={setPreviewOpen}
        onConfirm={async () => {
          if (!preview) return;
          const result = await publishMutation.mutateAsync(preview.preview_token);
          setPreviewOpen(false);
          void navigate(`/admin/series/${result.series_id}`);
        }}
      />
    </div>
  );
}

function SumCard({
  value,
  label,
  valueClass,
  warn,
}: {
  value: string;
  label: string;
  valueClass?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-surface min-w-[132px] rounded-[10px] border px-3.5 py-2.5",
        warn ? "border-warn/35" : "border-line",
      )}
    >
      <div className={cn("font-variant-numeric text-lg font-extrabold tabular-nums", valueClass)}>
        {value}
      </div>
      <div className="text-ink-3 mt-0.5 text-[11px]">{label}</div>
    </div>
  );
}
