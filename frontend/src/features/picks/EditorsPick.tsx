import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import type { CashTable } from "@/api/types/cash";
import type { Tournament } from "@/api/types/tournaments";
import { formatBlinds } from "@/features/cash/lib";
import { fetchEditorPicks, type EditorPick, type PickKind } from "@/features/picks/api";
import { AppIcon } from "@/features/tournaments/components/TournamentCard";
import { useNow } from "@/features/tournaments/hooks";
import {
  displayName,
  formatMoney,
  formatStartShort,
  formatTimeMsk,
  mskDayKey,
  tournamentPhase,
} from "@/features/tournaments/lib/format";
import { pluralRu } from "@/lib/plural";

const EXPLANATION: Record<PickKind, string> = {
  mtt: "Editor's Pick — турниры, которые мы сами выбрали для наших игроков: выгодная гарантия за свой бай-ин и удобное время. Подборку ведём вручную и регулярно обновляем.",
  cash: "Editor's Pick — столы, которые мы сами выбрали для наших игроков: живая игра и интересные лимиты. Подборку ведём вручную; показываем только открытые сейчас столы.",
};

/** Коротко, когда садиться: «рег. до 17:14» у идущего, «18:00» сегодня, «завтра 18:00». */
function whenLabel(tournament: Tournament, now: Date): string {
  const phase = tournamentPhase(tournament, now);
  if (phase.kind === "late_reg") return `рег. до ${formatTimeMsk(phase.closesAt.toISOString())}`;
  const day = mskDayKey(new Date(tournament.starts_at));
  if (day === mskDayKey(now)) return formatTimeMsk(tournament.starts_at);
  if (day === mskDayKey(new Date(now.getTime() + 24 * 3600_000))) {
    return `завтра ${formatTimeMsk(tournament.starts_at)}`;
  }
  return formatStartShort(tournament.starts_at);
}

function Card({
  pick,
  onSelectTournament,
  onSelectTable,
}: {
  pick: EditorPick;
  onSelectTournament?: (tournament: Tournament) => void;
  onSelectTable?: (table: CashTable) => void;
}) {
  const now = useNow(30_000);
  const tournament = pick.tournament;
  // Из нескольких подходящих столов открываем самый живой.
  const table = [...pick.tables].sort((a, b) => (b.seated ?? 0) - (a.seated ?? 0))[0];
  const club = tournament?.club ?? table?.club;
  if (!club) return null;

  const title = tournament ? displayName(tournament) : (table?.name ?? "");
  const meta = tournament
    ? [
        whenLabel(tournament, now),
        formatMoney(tournament.buyin, club),
        tournament.guarantee ? `GTD ${formatMoney(tournament.guarantee, club)}` : null,
      ]
    : table
      ? [
          formatBlinds(table),
          table.seated !== null && table.table_size ? `${table.seated}/${table.table_size}` : null,
          pick.tables.length > 1
            ? `ещё ${pick.tables.length - 1} ${pluralRu(pick.tables.length - 1, "стол", "стола", "столов")}`
            : null,
        ]
      : [];

  return (
    <button
      type="button"
      data-testid="editors-pick-card"
      onClick={() => {
        if (tournament) onSelectTournament?.(tournament);
        else if (table) onSelectTable?.(table);
      }}
      className="border-line-gold bg-surface flex w-[260px] max-w-[80vw] shrink-0 flex-col gap-0.5 rounded-md border px-3 py-2 text-left"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <AppIcon app={club.app} className="h-3.5 w-3.5 shrink-0" />
        <span className="text-ink min-w-0 truncate text-[13.5px] font-bold">{title}</span>
      </span>
      <span className="num text-ink-2 truncate text-[11.5px] font-semibold">
        {meta.filter(Boolean).join(" · ")}
      </span>
      {pick.note ? (
        <span className="text-gold line-clamp-2 text-[11.5px] leading-snug">{pick.note}</span>
      ) : null}
    </button>
  );
}

/**
 * Editor's Pick — плашка сверху MTT и CASH: турниры и столы, которые Иван считает интересными
 * своей аудитории. Знак (?) раскрывает объяснение. Нет пиков — плашки нет.
 */
export function EditorsPick({
  kind,
  onSelectTournament,
  onSelectTable,
}: {
  kind: PickKind;
  onSelectTournament?: (tournament: Tournament) => void;
  onSelectTable?: (table: CashTable) => void;
}) {
  const [explained, setExplained] = useState(false);
  const explanationId = useId();
  const query = useQuery({
    queryKey: ["editor-picks", kind],
    queryFn: ({ signal }) => fetchEditorPicks(kind, signal),
    refetchInterval: 60_000,
  });
  const picks = query.data ?? [];
  if (picks.length === 0) return null;

  return (
    <section
      aria-label="Editor's Pick"
      data-testid="editors-pick"
      className="border-line-gold mx-3 mt-2.5 rounded-md border bg-[linear-gradient(135deg,var(--gold-soft),transparent_70%)] py-2"
    >
      <div className="flex items-center gap-1.5 px-3">
        <span className="text-gold text-[13px]" aria-hidden="true">
          ★
        </span>
        <h2 className="text-gold text-[12px] font-extrabold tracking-[0.06em] uppercase">
          Editor&apos;s Pick
        </h2>
        <button
          type="button"
          aria-label="Что такое Editor's Pick"
          aria-expanded={explained}
          aria-controls={explanationId}
          onClick={() => setExplained((value) => !value)}
          className="border-line-gold text-gold flex size-[18px] items-center justify-center rounded-full border text-[11px] leading-none font-extrabold"
        >
          ?
        </button>
      </div>
      {explained ? (
        <p id={explanationId} className="text-ink-2 px-3 pt-1.5 text-[12px] leading-snug">
          {EXPLANATION[kind]}
        </p>
      ) : null}
      <div className="mt-2 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3 [&::-webkit-scrollbar]:hidden">
        {picks.map((pick) => (
          <Card
            key={pick.id}
            pick={pick}
            onSelectTournament={onSelectTournament}
            onSelectTable={onSelectTable}
          />
        ))}
      </div>
    </section>
  );
}
