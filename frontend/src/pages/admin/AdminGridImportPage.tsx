import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/client";
import type { TemplateAdmin, TemplatesImportResult } from "@/features/admin/clubs/api";
import { formatTemplateDays } from "@/features/admin/clubs/format";
import {
  useAdminClubs,
  useClubTemplates,
  useImportClubTemplates,
} from "@/features/admin/clubs/hooks";
import { APP_ICONS, APP_LABELS } from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

const MANUAL_EXAMPLE = `days,date,time,name,bounty,buyin,guarantee,ticket,target
пн,,18:00,Турнир дня MKO,MKO,500,170000,,
ежедневно,,12:00,Daily Rebuy 30K,,800,30000,,
ежедневно,,17:00,Sat Big Boss PKO,,200,,5000,Big Boss PKO
второе вс,,18:00,MAIN EVENT PKO,PKO,10000,800000,,
,25.09,20:00,Спецтурнир,PKO,1000,100000,,`;

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Не удалось загрузить файл";
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "add" | "del" }) {
  return (
    <div className="bg-surface-2 rounded-md px-2.5 py-1.5">
      <div
        className={cn(
          "num text-[16px] font-extrabold",
          tone === "add" && value > 0 && "text-live",
          tone === "del" && value > 0 && "text-danger",
        )}
      >
        {value}
      </div>
      <div className="text-ink-3 text-[11px] font-semibold">{label}</div>
    </div>
  );
}

function ResultPanel({ result }: { result: TemplatesImportResult }) {
  return (
    <section
      data-testid="grid-import-result"
      className={cn(
        "mt-3 rounded-md border p-3",
        result.dry_run ? "border-line bg-surface" : "border-line-gold bg-gold-soft",
      )}
    >
      <p className="text-[14px] font-bold">
        {result.dry_run ? "Предпросмотр — в базе ничего не изменилось" : "Сетка применена"}
      </p>
      <p className="text-ink-2 mt-0.5 text-[12px]">
        Строк в файле: {result.rows_total} · турниров в сетке: {result.templates_parsed}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Stat label="новых в сетке" value={result.templates_created} tone="add" />
        <Stat label="без изменений" value={result.templates_unchanged + result.templates_updated} />
        <Stat label="убрано из сетки" value={result.templates_removed} tone="del" />
        <Stat label="стартов добавится" value={result.tournaments_created} tone="add" />
        <Stat label="стартов обновится" value={result.tournaments_updated} />
        <Stat label="стартов удалится" value={result.tournaments_deleted} tone="del" />
      </div>
      {result.issues.length > 0 ? (
        <div className="border-danger/35 bg-danger-soft mt-2 rounded-md border p-2">
          <p className="text-danger text-[12px] font-bold">
            Пропущено строк: {result.issues.length} — они не попадут в расписание
          </p>
          <ul className="text-ink-2 mt-1 space-y-0.5 text-[12px]">
            {result.issues.map((issue, index) => (
              <li key={index}>
                {issue.row ? `Строка ${issue.row}: ` : ""}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function TemplatesTable({ templates }: { templates: TemplateAdmin[] }) {
  if (templates.length === 0) {
    return <p className="text-ink-3 mt-2 text-[13px]">Сетка клуба пуста</p>;
  }
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="text-ink-3 border-line border-b text-[10px] font-bold uppercase">
            <th className="py-1 pr-2 text-left">Когда</th>
            <th className="py-1 pr-2 text-left">МСК</th>
            <th className="py-1 pr-2 text-left">Турнир</th>
            <th className="py-1 pr-2 text-right">Бай-ин</th>
            <th className="py-1 text-right">GTD</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => (
            <tr key={template.id} className="border-line border-b">
              <td className="py-1 pr-2 whitespace-nowrap">{formatTemplateDays(template)}</td>
              <td className="num py-1 pr-2">{template.start_time.slice(0, 5)}</td>
              <td className="py-1 pr-2">
                {template.satellite_target ? `Sat → ${template.satellite_target}` : template.name}
              </td>
              <td className="num py-1 pr-2 text-right">
                {numberFormat.format(Number(template.buyin))}
              </td>
              <td className="num text-ink-2 py-1 text-right">
                {template.guarantee ? numberFormat.format(Number(template.guarantee)) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Загрузка сетки клуба: файл союза (NUTS) или ручная сетка → предпросмотр → применить.
 * Сетка Poker21 заводится так раз в неделю, когда союз публикует афишу.
 */
export function AdminGridImportPage() {
  const clubs = useAdminClubs();
  const [clubId, setClubId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TemplatesImportResult | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importMutation = useImportClubTemplates();
  const templates = useClubTemplates(showTemplates ? clubId : null);

  useEffect(() => {
    if (!clubId && clubs.data?.length) {
      setClubId(clubs.data[0]!.id);
    }
  }, [clubId, clubs.data]);

  const club = clubs.data?.find((item) => item.id === clubId) ?? null;
  const isNuts = club?.organizer_name === "NUTS";

  const run = (dryRun: boolean) => {
    if (!clubId || !file) return;
    importMutation.mutate(
      { clubId, file, dryRun },
      {
        onSuccess: (result) => {
          setPreview(result.dry_run ? result : null);
          if (!result.dry_run) {
            setFile(null);
            if (fileInput.current) fileInput.current.value = "";
            void templates.refetch();
          }
        },
      },
    );
  };

  const applied = importMutation.data && !importMutation.data.dry_run ? importMutation.data : null;

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-grid-import">
      <h1 className="text-[20px] font-extrabold">Сетки клубов</h1>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        Загрузите файл → проверьте, что изменится → примените. Файл заменяет только те части сетки,
        что в нём есть: недельную сетку, турниры месяца, разовые даты.
      </p>

      <label className="mt-3 block text-[12px] font-bold">
        Клуб
        <select
          aria-label="Клуб"
          className="border-line-strong bg-surface-2 mt-1 block h-10 w-full rounded-md border px-2 text-[14px]"
          value={clubId ?? ""}
          onChange={(event) => {
            setClubId(event.target.value);
            setPreview(null);
            importMutation.reset();
          }}
        >
          {clubs.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {APP_LABELS[item.app]}
              {item.organizer_name ? ` · ${item.organizer_name}` : ""} · в сетке{" "}
              {item.templates_count}
            </option>
          ))}
        </select>
      </label>

      {club ? (
        <div className="border-line bg-surface mt-2 flex items-center gap-2 rounded-md border px-2.5 py-2 text-[12px]">
          {APP_ICONS[club.app] ? (
            <img src={APP_ICONS[club.app]} alt="" className="h-6 w-6 rounded-[22%]" />
          ) : null}
          <span className="min-w-0 flex-1">
            {isNuts
              ? "NUTS: CSV из Google Sheets как есть, или ручная сетка."
              : "Ручная сетка — CSV с колонками ниже."}{" "}
            Суммы — в фишках клуба
            {club.chip_value
              ? ` (1 фишка = ${numberFormat.format(Number(club.chip_value))} ${club.chip_currency_code})`
              : " — курс не задан"}
            .
          </span>
        </div>
      ) : null}

      <details className="border-line bg-surface mt-2 rounded-md border px-2.5 py-2 text-[12px]">
        <summary className="cursor-pointer font-bold">Формат ручной сетки</summary>
        <ul className="text-ink-2 mt-1.5 space-y-0.5">
          <li>
            <b>days</b> — пн,ср · ежедневно · будни · выходные · «второе вс», «последнее вс»
          </li>
          <li>
            <b>date</b> — разовое событие: 25.09 или 25.09.2026 (тогда days пустой)
          </li>
          <li>
            <b>time</b> (МСК), <b>name</b>, <b>buyin</b> — обязательны
          </li>
          <li>
            <b>bounty</b> PKO/KO/MKO · <b>game</b> PLO/PLO5 · <b>guarantee</b> · <b>ticket</b> и{" "}
            <b>target</b> для сателлитов · <b>late_reg</b>, <b>minutes</b>, <b>early_bird</b>,{" "}
            <b>notes</b>
          </li>
        </ul>
        <pre className="bg-surface-2 mt-1.5 overflow-x-auto rounded-sm p-2 text-[11px] leading-snug">
          {MANUAL_EXAMPLE}
        </pre>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          aria-label="Файл сетки"
          className="file:border-line-strong file:bg-surface-2 file:text-ink text-[13px] file:mr-2 file:h-9 file:rounded-md file:border file:px-3 file:font-bold"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPreview(null);
            importMutation.reset();
          }}
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!file || !clubId || importMutation.isPending}
          onClick={() => run(true)}
          className="border-line-strong bg-surface-2 h-10 flex-1 rounded-md border text-[14px] font-bold disabled:opacity-45"
        >
          Проверить
        </button>
        <button
          type="button"
          disabled={!preview || importMutation.isPending}
          onClick={() => run(false)}
          className="bg-gold-grad text-ink-ongold h-10 flex-1 rounded-md text-[14px] font-bold disabled:opacity-45"
        >
          Применить
        </button>
      </div>

      {importMutation.isError ? (
        <p role="alert" className="text-danger mt-2 text-[13px] font-semibold">
          {errorText(importMutation.error)}
        </p>
      ) : null}
      {preview ? <ResultPanel result={preview} /> : null}
      {applied ? <ResultPanel result={applied} /> : null}

      <button
        type="button"
        className="text-gold mt-4 text-[13px] font-bold"
        onClick={() => setShowTemplates((value) => !value)}
      >
        {showTemplates
          ? "Скрыть текущую сетку"
          : `Текущая сетка клуба (${club?.templates_count ?? 0})`}
      </button>
      {showTemplates && templates.data ? <TemplatesTable templates={templates.data} /> : null}
    </div>
  );
}
