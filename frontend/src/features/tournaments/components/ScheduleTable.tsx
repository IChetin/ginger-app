import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { Tournament } from "@/api/types/tournaments";
import { AppIcon, LateRegCountdown } from "@/features/tournaments/components/TournamentCard";
import { useNow } from "@/features/tournaments/hooks";
import {
  displayName,
  earlyBirdActive,
  formatDayLabel,
  formatMoney,
  formatTimeMsk,
  hasRebuyAddon,
  tournamentPhase,
} from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

// Таблица расписания по образцу лобби — общая для страницы «Турниры» и Major на главной
// (Иван, 27.09: «формат — как в листе»).

/**
 * Время страницы: тик раз в 30 секунд плюс точный перескок на ближайший старт или конец
 * поздней регистрации. Поэтому турнир уходит из списка ровно тогда, когда отсчёт дошёл до нуля,
 * а не висит с «00:00» до следующего тика.
 */
export function useScheduleNow(items: Tournament[] | undefined): Date {
  const tick = useNow(30_000);
  const [boundary, setBoundary] = useState<Date | null>(null);
  const now = boundary && boundary > tick ? boundary : tick;

  useEffect(() => {
    if (!items) return;
    const current = now.getTime();
    let next = Number.POSITIVE_INFINITY;
    for (const item of items) {
      for (const iso of [item.starts_at, item.late_reg_closes_at]) {
        if (!iso) continue;
        const at = new Date(iso).getTime();
        if (at > current && at < next) next = at;
      }
    }
    if (!Number.isFinite(next)) return;
    const wait = Math.min(next - current + 50, 2_147_000_000);
    const id = window.setTimeout(() => setBoundary(new Date(next + 50)), wait);
    return () => window.clearTimeout(id);
  }, [items, now]);

  return now;
}

export function DayHeader({ day, now }: { day: string; now: Date }) {
  return (
    <h2 className="text-ink-3 px-4 pt-3 pb-1.5 text-[10.5px] font-bold tracking-[0.04em] uppercase">
      {formatDayLabel(day, now)} · МСК
    </h2>
  );
}

export type ViewProps = {
  groups: [string, Tournament[]][];
  now: Date;
  onSelect: (tournament: Tournament) => void;
};

/** Тап по турниру открывает карточку; колокольчик и другие кнопки внутри живут своей жизнью. */
export function selectUnlessButton(event: MouseEvent, select: () => void) {
  if ((event.target as HTMLElement).closest("button, a")) return;
  select();
}

export function selectOnEnter(event: KeyboardEvent, select: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    select();
  }
}

/** «Золото по ценности»: пороги в рублях, общие для всех клубов (гарантия ~$2 000 и ~$500). */
const GUARANTEE_HI_RUB = 180_000;
const GUARANTEE_MID_RUB = 45_000;
const SOON_MINUTES = 60;

type ValueTier = "hi" | "mid" | null;

function valueTier(rub: string | null, hi: number, mid = Number.POSITIVE_INFINITY): ValueTier {
  if (rub === null) return null;
  const value = Number(rub);
  if (value >= hi) return "hi";
  if (value >= mid) return "mid";
  return null;
}

const TIER_TEXT: Record<Exclude<ValueTier, null>, string> = {
  hi: "text-value-hi",
  mid: "text-value-mid",
};

/** Короткие метки формата для строки таблицы: длинные «Early Bird» и «Билет» — в карточках. */
function rowTags(tournament: Tournament): string[] {
  const tags: string[] = [];
  if (tournament.game_type === "plo") tags.push("PLO");
  if (tournament.game_type === "plo5") tags.push("PLO5");
  if (tournament.bounty_kind === "pko") tags.push("PKO");
  if (tournament.bounty_kind === "ko") tags.push("KO");
  if (tournament.bounty_kind === "mystery") tags.push("MYST");
  if (hasRebuyAddon(tournament)) tags.push("R+A");
  return tags;
}

function StartCell({
  tournament,
  now,
  tierText,
}: {
  tournament: Tournament;
  now: Date;
  tierText: string | null;
}) {
  const phase = tournamentPhase(tournament, now);
  if (phase.kind === "late_reg") {
    return <LateRegCountdown closesAt={phase.closesAt} compact />;
  }
  const minutes = Math.ceil((new Date(tournament.starts_at).getTime() - now.getTime()) / 60_000);
  if (minutes <= SOON_MINUTES) {
    return (
      <span className="text-live block text-[11px] leading-tight font-bold">in {minutes}m</span>
    );
  }
  return (
    <span className={cn("font-bold", tierText ?? "text-ink")}>
      {formatTimeMsk(tournament.starts_at)}
    </span>
  );
}

/**
 * Плотный вид по образцу лобби GG: одна строка — один турнир. Крупная гарантия красит золотом
 * всю строку — время, название и деньги; отдельно деньги не красим, это непонятно игроку.
 * Шапка колонок прилипает под фильтрами.
 */
export function TableView({
  groups,
  now,
  onSelect,
  stickyTop,
}: ViewProps & {
  /** Без него шапка колонок не прилипает — для коротких списков. */ stickyTop?: number;
}) {
  const headCell = cn(
    "bg-bg py-1.5 border-line border-b",
    stickyTop !== undefined && "sticky z-10",
  );
  return (
    <table className="mt-0 w-full table-fixed border-separate border-spacing-0 text-[12px]">
      <colgroup>
        <col className="w-[64px]" />
        <col />
        <col className="w-[58px]" />
        <col className="w-[80px]" />
      </colgroup>
      <thead>
        <tr className="text-ink-3 text-[9.5px] font-bold uppercase">
          <th style={{ top: stickyTop }} className={cn(headCell, "pl-3 text-left")}>
            МСК
          </th>
          <th style={{ top: stickyTop }} className={cn(headCell, "text-left")}>
            Турнир
          </th>
          <th style={{ top: stickyTop }} className={cn(headCell, "text-right")}>
            Бай-ин
          </th>
          <th style={{ top: stickyTop }} className={cn(headCell, "pr-3 text-right")}>
            GTD
          </th>
        </tr>
      </thead>
      {groups.map(([day, items]) => (
        <tbody key={day}>
          <tr>
            <th
              colSpan={4}
              scope="colgroup"
              className="bg-surface-2 text-ink-2 border-line border-b px-3 py-1 text-left text-[10.5px] font-bold"
            >
              {formatDayLabel(day, now)}
            </th>
          </tr>
          {items.map((item) => {
            const tier = valueTier(item.guarantee_rub, GUARANTEE_HI_RUB, GUARANTEE_MID_RUB);
            const tierText = tier ? TIER_TEXT[tier] : null;
            const guarantee = formatMoney(item.guarantee, item.club);
            const cell = "border-line border-b py-1.5";
            return (
              <tr
                key={item.id}
                className={cn(
                  "hover:bg-surface cursor-pointer",
                  tier === "hi" && "bg-[linear-gradient(90deg,transparent_35%,var(--gold-soft))]",
                )}
                data-testid="tournament-row"
                data-value={tier ?? undefined}
                tabIndex={0}
                aria-label={`Подробнее: ${displayName(item)}`}
                onClick={(event) => selectUnlessButton(event, () => onSelect(item))}
                onKeyDown={(event) => selectOnEnter(event, () => onSelect(item))}
              >
                <td className={cn(cell, "num overflow-hidden pl-3 whitespace-nowrap tabular-nums")}>
                  <StartCell tournament={item} now={now} tierText={tierText} />
                </td>
                <td className={cn(cell, "min-w-0 pr-2")}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <AppIcon app={item.club.app} className="h-3.5 w-3.5 shrink-0" />
                    {item.is_editor_pick ? (
                      <span className="text-gold shrink-0 text-[11px]" title="Editor's Pick">
                        ★
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "min-w-0 truncate",
                        item.is_promoted
                          ? "text-gold font-bold"
                          : tier === "hi"
                            ? cn(tierText, "font-bold")
                            : tier === "mid"
                              ? cn(tierText, "font-semibold")
                              : "text-ink font-semibold",
                      )}
                    >
                      {displayName(item)}
                    </span>
                    {rowTags(item).map((tag) => (
                      <span
                        key={tag}
                        className="bg-surface-2 text-ink-3 shrink-0 rounded-[4px] px-1 text-[9px] leading-[14px] font-bold tracking-[0.03em]"
                      >
                        {tag}
                      </span>
                    ))}
                    {earlyBirdActive(item, now) ? (
                      <span
                        title="Early Bird: бонус за ранний вход"
                        className="shrink-0 rounded-[4px] bg-[var(--live-soft)] px-1 text-[9px] leading-[14px] font-extrabold tracking-[0.03em] text-[var(--action-live-fg)]"
                      >
                        EB
                      </span>
                    ) : null}
                  </div>
                </td>
                <td
                  className={cn(
                    cell,
                    "num overflow-hidden pl-2 text-right font-bold whitespace-nowrap",
                    tierText ?? "text-ink",
                  )}
                >
                  {formatMoney(item.buyin, item.club)}
                </td>
                <td
                  className={cn(
                    cell,
                    "num overflow-hidden pr-3 pl-2 text-right font-bold whitespace-nowrap",
                    tierText ?? (guarantee ? "text-ink" : "text-ink-3"),
                  )}
                >
                  {guarantee ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}
