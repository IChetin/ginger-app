import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { DesktopOnlyStub } from "@/components/admin/DesktopOnlyStub";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import { TEMPLATE_URL } from "@/features/admin/bulk-import/api";
import { useBulkJobs, useUploadBulkImport } from "@/features/admin/bulk-import/hooks";
import { cn } from "@/lib/utils";

function formatBytes(size: number): string {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: "загружен",
  parsing: "разбирается",
  review: "ждёт сверки",
  published: "опубликован",
  failed: "ошибка",
};

export function BulkImportPage() {
  const isDesktop = useAdminDesktop();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const jobsQuery = useBulkJobs({ limit: 20 });
  const upload = useUploadBulkImport();

  const submit = () => {
    if (!file) return;
    void upload.mutateAsync(file).then((job) => {
      void navigate(`/admin/import/bulk/${job.id}`);
    });
  };

  if (!isDesktop) {
    return <DesktopOnlyStub title="Массовая загрузка — на компьютере" />;
  }

  return (
    <div className="space-y-[22px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold">Массовая загрузка из Excel</h1>
          <p className="text-ink-3 mt-0.5 text-xs">
            Один файл — сразу много серий. Повторная загрузка обновляет данные, а не дублирует их.
          </p>
        </div>
        <a
          href={TEMPLATE_URL}
          download
          className="border-line-gold bg-gold-soft text-gold inline-flex h-[38px] shrink-0 items-center rounded-[10px] border px-3.5 text-[13px] font-extrabold"
        >
          Скачать шаблон
        </a>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_330px]">
        <div>
          <button
            type="button"
            className={cn(
              "border-line-gold bg-surface w-full cursor-pointer rounded-[14px] border-2 border-dashed px-5 py-11 text-center transition-colors",
              dragOver && "bg-surface-2",
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              setFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <div className="bg-gold-soft text-gold mx-auto mb-3.5 flex size-[54px] -rotate-[4deg] items-center justify-center rounded-2xl">
              <svg
                className="size-[26px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 16V4M12 4 7 9M12 4l5 5" />
                <path d="M4 17v3h16v-3" />
              </svg>
            </div>
            <div className="text-base font-extrabold">
              {file ? file.name : "Перетащите заполненный шаблон"}
            </div>
            <div className="text-ink-2 mt-1 text-[13px]">
              {file
                ? `${formatBytes(file.size)} · нажмите, чтобы заменить`
                : "или нажмите, чтобы выбрать"}
            </div>
            <div className="text-ink-3 mt-2.5 text-[11px]">XLSX · лист «Турниры» · до 20 МБ</div>
          </button>
          <input
            ref={fileRef}
            id="bulk-import-file"
            type="file"
            accept=".xlsx"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <label htmlFor="bulk-import-file" className="sr-only">
            Файл массовой загрузки
          </label>
        </div>

        <div className="border-line bg-surface rounded-[14px] border p-[18px]">
          <div className="mb-3 text-[15px] font-extrabold">Как это работает</div>
          <ol className="text-ink-2 mb-4 list-decimal space-y-1.5 pl-4 text-[13px]">
            <li>Заполняете шаблон: одна строка — один старт.</li>
            <li>Загружаете файл — мы разбираем его и показываем, что изменится.</li>
            <li>Проверяете сводку и публикуете одной кнопкой.</li>
          </ol>
          <p className="text-ink-3 mb-4 text-[11px]">
            Строки-примеры из шаблона пропускаются. Серии, турниры и старты сопоставляются по
            колонкам series_key, event_key и flight — меняйте что угодно, кроме них.
          </p>

          {upload.error instanceof ApiError ? (
            <p className="text-danger mb-3 text-sm">{upload.error.message}</p>
          ) : null}

          <button
            type="button"
            disabled={!file || upload.isPending}
            onClick={submit}
            className="bg-gold-grad text-ink-ongold inline-flex h-[38px] w-full items-center justify-center rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-50"
          >
            {upload.isPending ? "Разбираем…" : "Загрузить и разобрать"}
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-[15px] font-extrabold">История загрузок</h2>
        {(jobsQuery.data?.items ?? []).length === 0 ? (
          <p className="text-ink-3 text-sm">Пока пусто</p>
        ) : (
          <ul className="divide-line border-line bg-surface divide-y overflow-hidden rounded-[14px] border">
            {(jobsQuery.data?.items ?? []).map((job) => {
              const report = job.draft?.report;
              return (
                <li
                  key={job.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm"
                >
                  <div>
                    <p className="text-ink font-bold">{job.original_filename}</p>
                    <p className="text-ink-3 text-xs">
                      {STATUS_LABELS[job.status] ?? job.status}
                      {report
                        ? ` · серий: +${report.series_created} / ~${report.series_updated}` +
                          ` · турниров: +${report.events_created} / ~${report.events_updated}`
                        : ""}
                    </p>
                  </div>
                  <Link
                    to={`/admin/import/bulk/${job.id}`}
                    className="border-line-strong text-ink-2 hover:text-ink inline-flex h-[31px] items-center rounded-lg border px-2.5 text-[13px] font-bold"
                  >
                    Открыть
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
