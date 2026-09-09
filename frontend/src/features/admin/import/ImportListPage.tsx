import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import type { ImportKind } from "@/api/types/imports";
import { DesktopOnlyStub } from "@/components/admin/DesktopOnlyStub";
import { adminInputClass } from "@/components/admin/FlightRowsEditor";
import { useAdminDesktop } from "@/components/admin/useAdminDesktop";
import {
  useAdminParsers,
  useOrganizersAdmin,
  useSeriesAdmin,
  useVenuesAdmin,
} from "@/features/admin/hooks";
import { useImportJobs, useUploadImport } from "@/features/admin/import/hooks";
import { formatDateRange } from "@/features/schedule/lib/format";
import { cn } from "@/lib/utils";

const FALLBACK_TIMEZONES = [
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/Minsk",
  "Europe/Nicosia",
  "Asia/Yekaterinburg",
  "UTC",
];

function detectClientType(file: File | null): string | null {
  if (!file) return null;
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image";
  if (file.type.includes("spreadsheet") || file.type.includes("excel")) return "xlsx";
  if (file.type === "text/csv") return "csv";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return null;
}
function parseImportKind(value: string | null): ImportKind {
  return value === "structures" ? "structures" : "schedule";
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
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

export function ImportListPage() {
  const isDesktop = useAdminDesktop();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const importKind = parseImportKind(searchParams.get("import_kind"));
  const isStructures = importKind === "structures";
  const statusFilter = searchParams.get("status");
  const presetSeriesId = searchParams.get("series_id") ?? "";

  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [seriesId, setSeriesId] = useState(presetSeriesId);
  const [organizerId, setOrganizerId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [fileTimezone, setFileTimezone] = useState("");
  const [parserRequested, setParserRequested] = useState("auto");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!presetSeriesId) return;
    setSeriesId(presetSeriesId);
    setMode("existing");
  }, [presetSeriesId]);

  const seriesQuery = useSeriesAdmin({ limit: 100 });
  const organizersQuery = useOrganizersAdmin({ limit: 100 });
  const venuesQuery = useVenuesAdmin({ limit: 100 });
  const parsersQuery = useAdminParsers();
  const jobsQuery = useImportJobs({
    limit: 20,
    status: statusFilter === "review" ? "review" : undefined,
  });
  const upload = useUploadImport();

  useEffect(() => {
    if (!presetSeriesId || !seriesQuery.data) return;
    const exists = seriesQuery.data.items.some((item) => item.id === presetSeriesId);
    if (exists) setSeriesId(presetSeriesId);
  }, [presetSeriesId, seriesQuery.data]);

  const eligibleSeries =
    seriesQuery.data?.items.filter((item) =>
      isStructures ? item.events_count > 0 : item.status === "announced" && item.events_count === 0,
    ) ?? [];

  const selectedSeries = eligibleSeries.find((item) => item.id === seriesId);
  const selectedVenue = venuesQuery.data?.items.find((item) => item.id === venueId);
  const selectedOrganizerId =
    mode === "create" && !isStructures ? organizerId : (selectedSeries?.organizer.id ?? "");
  const selectedOrganizer =
    (organizersQuery.data?.items ?? []).find((item) => item.id === selectedOrganizerId) ??
    selectedSeries?.organizer;

  const kindParsers = useMemo(
    () =>
      (parsersQuery.data ?? []).filter(
        (parser) =>
          (isStructures ? parser.kind === "structures" : parser.kind === "schedule") &&
          parser.is_available &&
          parser.is_active,
      ),
    [parsersQuery.data, isStructures],
  );

  const autoParser = useMemo(() => {
    const org =
      (organizersQuery.data?.items ?? []).find((item) => item.id === selectedOrganizerId) ?? null;
    if (!org) return undefined;
    const code = isStructures ? org.structure_parser_code : org.schedule_parser_code;
    const title = isStructures ? org.structure_parser_title : org.schedule_parser_title;
    if (!code) return undefined;
    return { name: code, title: title ?? code };
  }, [organizersQuery.data?.items, selectedOrganizerId, isStructures]);

  const clientFileType = detectClientType(file);
  const selectedParserMeta =
    parserRequested !== "auto" && parserRequested !== "ai_only"
      ? kindParsers.find((parser) => parser.name === parserRequested)
      : undefined;
  const parserTypeMismatch = Boolean(
    selectedParserMeta &&
    clientFileType &&
    selectedParserMeta.supported_types.length > 0 &&
    !selectedParserMeta.supported_types.includes(clientFileType),
  );

  const timezoneOptions = useMemo(() => {
    const set = new Set(FALLBACK_TIMEZONES);
    if (selectedSeries?.venue.timezone) set.add(selectedSeries.venue.timezone);
    if (selectedVenue?.timezone) set.add(selectedVenue.timezone);
    return [...set];
  }, [selectedSeries, selectedVenue]);

  useEffect(() => {
    if (fileTimezone) return;
    const preferred = selectedSeries?.venue.timezone ?? selectedVenue?.timezone;
    if (preferred) setFileTimezone(preferred);
  }, [selectedSeries, selectedVenue, fileTimezone]);

  const canSubmit = Boolean(
    file &&
    !parserTypeMismatch &&
    (isStructures
      ? seriesId
      : mode === "existing"
        ? seriesId
        : organizerId && venueId && seriesName.trim() && startsOn && endsOn),
  );

  const onPickFile = (next: File | null) => {
    if (!next) return;
    setFile(next);
  };

  const submit = () => {
    if (!file || parserTypeMismatch) return;
    const payload =
      mode === "create" && !isStructures
        ? {
            file,
            importKind,
            createSeries: true as const,
            organizerId,
            venueId,
            seriesName: seriesName.trim(),
            startsOn,
            endsOn,
            fileTimezone: fileTimezone || undefined,
            parserRequested: parserRequested === "auto" ? undefined : parserRequested,
          }
        : {
            file,
            importKind,
            seriesId,
            fileTimezone: fileTimezone || undefined,
            parserRequested: parserRequested === "auto" ? undefined : parserRequested,
          };
    void upload.mutateAsync(payload).then((job) => {
      void navigate(`/admin/import/${job.id}`);
    });
  };

  if (!isDesktop) {
    return <DesktopOnlyStub title="Импорт — на компьютере" />;
  }

  return (
    <div className="space-y-[22px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold">
            {isStructures ? "Импорт структур" : "Импорт расписания"}
          </h1>
          <p className="text-ink-3 mt-0.5 text-xs">Файл → распознавание → сверка → публикация</p>
        </div>
        <Link
          to="/admin/import/bulk"
          className="border-line-strong text-ink-2 hover:text-ink inline-flex h-[38px] shrink-0 items-center rounded-[10px] border px-3.5 text-[13px] font-bold"
        >
          Массовая загрузка из Excel
        </Link>
      </div>

      <Stepper step={1} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_330px]">
        <div>
          {!isStructures ? (
            <div className="border-line bg-surface-2 mb-3.5 inline-flex gap-0.5 rounded-[10px] border p-[3px]">
              <button
                type="button"
                className={cn(
                  "h-8 rounded-lg px-3.5 text-[13px] font-bold",
                  mode === "existing" ? "bg-surface-3 text-ink" : "text-ink-2",
                )}
                onClick={() => setMode("existing")}
              >
                В существующую серию
              </button>
              <button
                type="button"
                className={cn(
                  "h-8 rounded-lg px-3.5 text-[13px] font-bold",
                  mode === "create" ? "bg-surface-3 text-ink" : "text-ink-2",
                )}
                onClick={() => setMode("create")}
              >
                Создать новую серию из файла
              </button>
            </div>
          ) : null}

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
              onPickFile(event.dataTransfer.files?.[0] ?? null);
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
              {file ? file.name : "Перетащите файл расписания"}
            </div>
            <div className="text-ink-2 mt-1 text-[13px]">
              {file
                ? `${formatBytes(file.size)} · нажмите, чтобы заменить`
                : "или нажмите, чтобы выбрать"}
            </div>
            <div className="text-ink-3 mt-2.5 text-[11px]">
              XLSX · CSV · PDF · JPG · PNG · до 20 МБ
            </div>
          </button>
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept=".xlsx,.csv,.pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => onPickFile(event.target.files?.[0] ?? null)}
          />
          <label htmlFor="import-file" className="sr-only">
            Файл расписания
          </label>
          <p className="text-ink-3 mt-2.5 text-[11px]">
            Сначала пробуем разобрать файл кодом — быстро и бесплатно. Если формат незнакомый или
            строки не читаются, подключается ИИ (это расходует токены).
          </p>
        </div>

        <div className="border-line bg-surface rounded-[14px] border p-[18px]">
          <div className="mb-3 text-[15px] font-extrabold">Куда загружаем</div>

          {mode === "existing" || isStructures ? (
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Серия</span>
              <select
                aria-label="Серия"
                className={adminInputClass}
                value={seriesId}
                onChange={(event) => setSeriesId(event.target.value)}
              >
                <option value="">Выберите серию</option>
                {eligibleSeries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {formatDateRange(item.starts_on, item.ends_on)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="mb-3 flex flex-col gap-1">
                <span className="text-ink-2 text-xs font-semibold">Название серии</span>
                <input
                  className={adminInputClass}
                  value={seriesName}
                  onChange={(event) => setSeriesName(event.target.value)}
                  placeholder="RPT Kaliningrad"
                />
              </label>
              <div className="mb-3 grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-ink-2 text-xs font-semibold">Старт</span>
                  <input
                    type="date"
                    className={adminInputClass}
                    value={startsOn}
                    onChange={(event) => setStartsOn(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-2 text-xs font-semibold">Финиш</span>
                  <input
                    type="date"
                    className={adminInputClass}
                    value={endsOn}
                    onChange={(event) => setEndsOn(event.target.value)}
                  />
                </label>
              </div>
              <label className="mb-3 flex flex-col gap-1">
                <span className="text-ink-2 text-xs font-semibold">Организатор</span>
                <select
                  className={adminInputClass}
                  value={organizerId}
                  onChange={(event) => setOrganizerId(event.target.value)}
                >
                  <option value="">Выберите</option>
                  {(organizersQuery.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mb-3 flex flex-col gap-1">
                <span className="text-ink-2 text-xs font-semibold">Площадка</span>
                <select
                  className={adminInputClass}
                  value={venueId}
                  onChange={(event) => setVenueId(event.target.value)}
                >
                  <option value="">Выберите</option>
                  {(venuesQuery.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.city}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {!isStructures && mode === "existing" ? (
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Организатор (парсер)</span>
              <input
                className={adminInputClass}
                disabled
                value={selectedSeries?.organizer.name ?? "—"}
              />
            </label>
          ) : null}

          <label className="mb-3 flex flex-col gap-1">
            <span className="text-ink-2 text-xs font-semibold">Парсер</span>
            <select
              aria-label="Парсер"
              className={adminInputClass}
              value={parserRequested}
              onChange={(event) => setParserRequested(event.target.value)}
            >
              <option value="auto">Определить автоматически</option>
              {!isStructures ? <option value="ai_only">Только ИИ (без шаблонного)</option> : null}
              {kindParsers.map((parser) => (
                <option key={parser.name} value={parser.name}>
                  {parser.title || parser.name}
                  {parser.supported_types.length ? ` · ${parser.supported_types.join(", ")}` : ""}
                </option>
              ))}
            </select>
            <span className="text-ink-3 text-[11px]">
              {parserRequested === "auto"
                ? autoParser
                  ? `Для «${selectedOrganizer?.name ?? "организатора"}» по умолчанию: ${autoParser.title}`
                  : "Для выбранного организатора шаблонного парсера нет — будет автоподбор / ИИ"
                : parserRequested === "ai_only"
                  ? "Шаблонный парсер будет пропущен"
                  : selectedParserMeta?.description ||
                    selectedParserMeta?.title ||
                    selectedParserMeta?.name ||
                    ""}
            </span>
            {parserTypeMismatch ? (
              <span className="text-danger text-[11px]">
                Парсер {parserRequested} не подходит для файла типа «{clientFileType}»
                {selectedParserMeta?.supported_types.length
                  ? ` (нужно: ${selectedParserMeta.supported_types.join(", ")})`
                  : ""}
              </span>
            ) : null}
          </label>

          <label className="mb-3 flex flex-col gap-1">
            <span className="text-ink-2 text-xs font-semibold">Что в файле</span>
            <select
              className={adminInputClass}
              value={importKind}
              onChange={(event) => {
                const next = event.target.value === "structures" ? "structures" : "schedule";
                const params = new URLSearchParams(searchParams);
                if (next === "structures") params.set("import_kind", "structures");
                else params.delete("import_kind");
                void navigate(`/admin/import?${params.toString()}`, { replace: true });
              }}
            >
              <option value="schedule">Сетка турниров</option>
              <option value="structures">Структура блайндов</option>
            </select>
          </label>

          {!isStructures ? (
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-ink-2 text-xs font-semibold">Часовой пояс времени в файле</span>
              <select
                className={adminInputClass}
                value={fileTimezone}
                onChange={(event) => setFileTimezone(event.target.value)}
              >
                <option value="">Как у площадки</option>
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                    {selectedSeries?.venue.timezone === tz || selectedVenue?.timezone === tz
                      ? " (площадка)"
                      : ""}
                  </option>
                ))}
              </select>
              <span className="text-ink-3 text-[11px]">Время из файла считаем в этом поясе</span>
            </label>
          ) : null}

          {upload.error instanceof ApiError ? (
            <p className="text-danger mb-3 text-sm">{upload.error.message}</p>
          ) : null}

          <button
            type="button"
            disabled={!canSubmit || upload.isPending}
            onClick={submit}
            className="bg-gold-grad text-ink-ongold inline-flex h-[38px] w-full items-center justify-center rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-50"
          >
            {upload.isPending ? "Разбираем…" : "Загрузить и разобрать"}
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-[15px] font-extrabold">Последние импорты</h2>
        {(jobsQuery.data?.items ?? []).length === 0 ? (
          <p className="text-ink-3 text-sm">Пока пусто</p>
        ) : (
          <ul className="divide-line border-line bg-surface divide-y overflow-hidden rounded-[14px] border">
            {(jobsQuery.data?.items ?? []).map((job) => (
              <li
                key={job.id}
                className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm"
              >
                <div>
                  <p className="text-ink font-bold">{job.original_filename}</p>
                  <p className="text-ink-3 text-xs">
                    {job.import_kind} · {job.status}
                    {job.parse_path ? ` · ${job.parse_path}` : ""}
                    {job.file_timezone ? ` · ${job.file_timezone}` : ""}
                  </p>
                </div>
                <Link
                  to={`/admin/import/${job.id}`}
                  className="border-line-strong text-ink-2 hover:text-ink inline-flex h-[31px] items-center rounded-lg border px-2.5 text-[13px] font-bold"
                >
                  Открыть
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
