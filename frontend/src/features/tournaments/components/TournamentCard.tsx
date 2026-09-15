import type { PokerApp, Tournament } from "@/api/types/tournaments";
import { ReminderBell } from "@/features/tournaments/components/ReminderBell";
import { useNow } from "@/features/tournaments/hooks";
import {
  APP_ICONS,
  displayName,
  formatCountdown,
  formatMoney,
  formatTags,
  formatTimeMsk,
  lateRegLabel,
  tournamentPhase,
} from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

/** Иконка приложения; пока официальной нет (Suprema) — буква на плашке, чтобы строки не съезжали. */
export function AppIcon({ app, className }: { app: PokerApp; className: string }) {
  const src = APP_ICONS[app];
  if (src) {
    return <img src={src} alt="" aria-hidden="true" className={cn("rounded-[22%]", className)} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-surface-3 text-ink-2 inline-flex items-center justify-center rounded-[22%] text-[8px] leading-none font-extrabold",
        className,
      )}
    >
      {app.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Живой отсчёт поздней регистрации — свой тик, чтобы не перерисовывать весь список. */
export function LateRegCountdown({ closesAt, compact }: { closesAt: Date; compact?: boolean }) {
  const now = useNow(1000);
  const left = formatCountdown(closesAt.getTime() - now.getTime());
  if (compact) {
    // В узкой колонке «Старт» подпись над отсчётом: «1:25:39» в одну строку с ней не влезает.
    return (
      <span className="text-warn num block leading-tight font-bold tabular-nums">
        <span className="block text-[9.5px] font-semibold">late</span>
        {left}
      </span>
    );
  }
  return <span className="text-warn num shrink-0 font-bold tabular-nums">late {left}</span>;
}

/**
 * Карточка в две строки — телефон первым: время, название, бай-ин; под ними клуб, метки,
 * регистрация и гарантия.
 */
export function TournamentCard({ tournament, now }: { tournament: Tournament; now: Date }) {
  const phase = tournamentPhase(tournament, now);
  const guarantee = formatMoney(tournament.guarantee, tournament.club);
  const tags = formatTags(tournament);
  const closes = lateRegLabel(tournament);

  return (
    <article
      data-testid="tournament-card"
      className={cn(
        "bg-surface flex items-center gap-1 rounded-md border py-2 pr-1 pl-2.5",
        tournament.is_promoted ? "border-line-gold" : "border-line",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="num w-[42px] shrink-0 text-[15px] font-extrabold tabular-nums">
            {formatTimeMsk(tournament.starts_at)}
          </span>
          <h3 className="text-ink min-w-0 flex-1 truncate text-[14px] font-bold">
            {displayName(tournament)}
          </h3>
          <span className="num text-ink shrink-0 text-[15px] font-extrabold">
            {formatMoney(tournament.buyin, tournament.club)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px]">
          <span className="w-[42px] shrink-0" aria-hidden="true" />
          <span className="text-ink-3 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap">
            <AppIcon app={tournament.club.app} className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">{tournament.club.name}</span>
            {tags.map((tag) => (
              <span
                key={tag}
                className="bg-surface-3 text-ink-2 shrink-0 rounded-[4px] px-1 leading-4 font-bold"
              >
                {tag}
              </span>
            ))}
            {phase.kind === "late_reg" ? (
              <LateRegCountdown closesAt={phase.closesAt} />
            ) : closes ? (
              <span className="shrink-0 font-semibold">{closes}</span>
            ) : null}
          </span>
          {guarantee ? (
            <span className="num text-ink-2 shrink-0 font-semibold">GTD {guarantee}</span>
          ) : null}
        </div>
      </div>
      <ReminderBell tournament={tournament} now={now} />
    </article>
  );
}
