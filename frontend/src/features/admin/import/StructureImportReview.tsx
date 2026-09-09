import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFieldArray, useForm } from "react-hook-form";

import { ApiError } from "@/api/client";
import type { ImportJob, ImportPublishPreview, StructureImportDraft } from "@/api/types/imports";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSeriesEventsAdmin } from "@/features/admin/hooks";
import { NotificationPreviewDialog } from "@/features/admin/components/NotificationPreviewDialog";
import {
  useCancelImport,
  usePreviewImportPublish,
  usePublishImport,
  useUpdateImportDraft,
} from "@/features/admin/import/hooks";
import { cn } from "@/lib/utils";

type FormValues = {
  structures: StructureImportDraft["structures"];
};

function isFreerollBuyin(value: string | null | undefined): boolean {
  if (value == null || value.trim() === "") {
    return false;
  }
  return Number(value) === 0;
}

function StructureLevelsPreview({
  sets,
}: {
  sets: StructureImportDraft["structures"][number]["structure_sets"];
}) {
  const labels = sets.map((set) => set.label || "default");
  const [activeLabel, setActiveLabel] = useState(labels[0] ?? "default");
  const activeSet = sets.find((set) => (set.label || "default") === activeLabel) ?? sets[0];

  if (!activeSet) {
    return <p className="text-ink-3 text-sm">Нет уровней</p>;
  }

  return (
    <div className="space-y-2">
      {labels.length > 1 ? (
        <div className="space-y-1">
          <Label>Набор уровней</Label>
          <Select value={activeLabel} onValueChange={setActiveLabel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {labels.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="border-line overflow-x-auto rounded-lg border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-surface-2 text-ink-3">
            <tr>
              <th className="px-2 py-1">#</th>
              <th className="px-2 py-1">SB</th>
              <th className="px-2 py-1">BB</th>
              <th className="px-2 py-1">Ante</th>
              <th className="px-2 py-1">Мин</th>
              <th className="px-2 py-1">Флаги</th>
            </tr>
          </thead>
          <tbody>
            {activeSet.levels.map((level) => (
              <tr key={`${activeSet.label}-${level.level_no}`} className="border-line border-t">
                <td className="px-2 py-1">{level.level_no}</td>
                <td className="px-2 py-1">{level.is_break ? "—" : (level.sb ?? "—")}</td>
                <td className="px-2 py-1">{level.is_break ? "—" : (level.bb ?? "—")}</td>
                <td className="px-2 py-1">{level.is_break ? "—" : (level.ante ?? "—")}</td>
                <td className="px-2 py-1">{level.minutes}</td>
                <td className="text-ink-3 px-2 py-1">
                  {[level.is_break ? "break" : null, level.is_late_reg_end ? "late reg end" : null]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StructureImportReview({ job }: { job: ImportJob }) {
  const navigate = useNavigate();
  const updateDraft = useUpdateImportDraft(job.id);
  const previewMutation = usePreviewImportPublish(job.id);
  const publishMutation = usePublishImport(job.id);
  const cancelMutation = useCancelImport(job.id);
  const eventsQuery = useSeriesEventsAdmin(job.series_id ?? "");
  const [preview, setPreview] = useState<ImportPublishPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: { structures: [] },
  });
  const { fields } = useFieldArray({ control: form.control, name: "structures" });

  useEffect(() => {
    if (job.draft?.kind === "structures") {
      form.reset({ structures: job.draft.structures });
    }
  }, [form, job.draft]);

  const topIssues = useMemo(
    () => (job.draft?.kind === "structures" ? (job.draft.issues ?? []) : []),
    [job.draft],
  );
  const events = eventsQuery.data ?? [];
  const watched = form.watch("structures");
  const hasFreeroll = watched.some((item) => isFreerollBuyin(item.parsed_buyin));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-ink-3 text-sm">
          <Link to="/admin/import?import_kind=structures" className="hover:text-gold">
            ← Импорт структур
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{job.original_filename}</h1>
        <p className="text-ink-3 mt-1 text-sm">
          structures · status={job.status}
          {job.parse_path ? ` · ${job.parse_path}` : ""}
          {job.parser_used ? ` · ${job.parser_used}` : ""}
          {job.confidence ? ` · confidence ${job.confidence}` : ""}
        </p>
      </div>

      {job.status === "failed" ? (
        <div className="border-danger/40 bg-danger-soft text-danger rounded-xl border p-4 text-sm">
          {job.error ?? "Разбор не удался"}
        </div>
      ) : null}

      {topIssues.length > 0 ? (
        <ul className="border-warn/40 bg-warn-soft text-warn space-y-1 rounded-xl border p-3 text-sm">
          {topIssues.map((issue) => (
            <li key={`${issue.field}-${issue.message}`}>
              [{issue.severity}] {issue.field}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {hasFreeroll ? (
        <div className="border-warn/40 bg-warn-soft text-warn rounded-xl border p-3 text-sm">
          Freeroll: у одной или нескольких структур buy-in = 0. Проверьте матчинг перед публикацией.
        </div>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          const draft: StructureImportDraft = {
            kind: "structures",
            structures: values.structures,
            unparsed_rows: job.draft?.kind === "structures" ? (job.draft.unparsed_rows ?? []) : [],
            confidence: job.draft?.kind === "structures" ? (job.draft.confidence ?? null) : null,
            issues: [],
          };
          await updateDraft.mutateAsync(draft);
        })}
      >
        {fields.map((field, index) => {
          const structure = watched[index];
          const matchedId = structure?.matched_event_id ?? "";
          const selected = structure?.selected ?? false;
          const shared = structure?.is_shared_satellites ?? false;
          const sharedIds = structure?.shared_event_ids ?? [];

          return (
            <div key={field.id} className="border-line bg-surface space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-ink font-medium">{structure?.source_title}</p>
                  <p className="text-ink-3 text-sm">
                    Buy-in: {structure?.parsed_buyin ?? "—"}
                    {isFreerollBuyin(structure?.parsed_buyin) ? " (freeroll)" : ""}
                    {structure?.match_confidence ? ` · conf ${structure.match_confidence}` : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(checked) =>
                      form.setValue(`structures.${index}.selected`, checked === true)
                    }
                  />
                  Применить
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Событие</Label>
                  <Select
                    value={matchedId || "__none__"}
                    onValueChange={(value) =>
                      form.setValue(
                        `structures.${index}.matched_event_id`,
                        value === "__none__" ? null : value,
                        { shouldDirty: true },
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите событие" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Не выбрано</SelectItem>
                      {events.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.number ? `#${event.number} ` : ""}
                          {event.name} ({event.buyin})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Checkbox
                    checked={shared}
                    onCheckedChange={(checked) =>
                      form.setValue(`structures.${index}.is_shared_satellites`, checked === true)
                    }
                  />
                  Shared satellites
                </label>
              </div>

              {shared ? (
                <div className="border-line space-y-2 rounded-lg border p-3">
                  <Label>Доп. события (shared)</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {events
                      .filter((event) => event.id !== matchedId)
                      .map((event) => {
                        const checked = sharedIds.includes(event.id);
                        return (
                          <label
                            key={event.id}
                            className={cn("text-ink-2 flex items-center gap-2 text-sm")}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => {
                                const current = form.getValues(
                                  `structures.${index}.shared_event_ids`,
                                );
                                const nextIds =
                                  next === true
                                    ? [...new Set([...current, event.id])]
                                    : current.filter((id) => id !== event.id);
                                form.setValue(`structures.${index}.shared_event_ids`, nextIds);
                              }}
                            />
                            {event.number ? `#${event.number} ` : ""}
                            {event.name}
                          </label>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              <StructureLevelsPreview sets={structure?.structure_sets ?? []} />
            </div>
          );
        })}

        {updateDraft.error instanceof ApiError ? (
          <p className="text-danger text-sm">{updateDraft.error.message}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={job.status !== "review" || cancelMutation.isPending}
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
          </Button>
          <Button type="submit" variant="outline" disabled={updateDraft.isPending}>
            Сохранить черновик
          </Button>
          <Button
            type="button"
            disabled={job.status !== "review" || previewMutation.isPending}
            onClick={() => {
              void previewMutation.mutateAsync().then((result) => {
                setPreview(result);
                setPreviewOpen(true);
              });
            }}
          >
            Превью публикации
          </Button>
        </div>
        {previewMutation.error instanceof ApiError ? (
          <p className="text-danger text-sm">{previewMutation.error.message}</p>
        ) : null}
        {cancelMutation.error instanceof ApiError ? (
          <p className="text-danger text-sm">{cancelMutation.error.message}</p>
        ) : null}
      </form>

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
