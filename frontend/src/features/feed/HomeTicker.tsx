import { useState, type ReactNode } from "react";

import type { Tournament } from "@/api/types/tournaments";
import { formatMoney as formatAmount } from "@/features/chips/lib/format";
import { useFeed, type WinItem } from "@/features/feed/api";
import { useNow } from "@/features/tournaments/hooks";
import {
  displayName,
  formatMoney,
  formatTimeMsk,
  tournamentPhase,
} from "@/features/tournaments/lib/format";
import { cn } from "@/lib/utils";

type Tone = "win" | "late" | "soon" | "start";

export type TickerItem = { key: string; lead: string; name: string; meta: string; tone: Tone };

const SOON_MINUTES = 60;
const MAX_TOURNAMENTS = 8;
const MAX_WINS = 6;
/** Секунд на один пункт: строка идёт ровно, сколько бы пунктов ни было. */
const SECONDS_PER_ITEM = 7;

const TONE_CLASS: Record<Tone, string> = {
  win: "text-gold-hi",
  late: "text-warn",
  soon: "text-live",
  start: "text-gold",
};

function tournamentItem(tournament: Tournament, now: Date): TickerItem | null {
  const phase = tournamentPhase(tournament, now);
  if (phase.kind === "closed") return null;
  const meta = [formatMoney(tournament.guarantee, tournament.club), tournament.club.name]
    .filter(Boolean)
    .join(" · ");
  const base = { key: `t-${tournament.id}`, name: displayName(tournament), meta };
  if (phase.kind === "late_reg") {
    // Минуты, а не секундный отсчёт: строка едет, секунды в ней не прочитать.
    return {
      ...base,
      lead: `late до ${formatTimeMsk(phase.closesAt.toISOString())}`,
      tone: "late",
    };
  }
  const minutes = Math.ceil((new Date(tournament.starts_at).getTime() - now.getTime()) / 60_000);
  if (minutes <= SOON_MINUTES) return { ...base, lead: `in ${minutes}m`, tone: "soon" };
  return { ...base, lead: formatTimeMsk(tournament.starts_at), tone: "start" };
}

function winItem(win: WinItem): TickerItem {
  return {
    key: `w-${win.id}`,
    lead: `+${formatAmount(win.prize_amount, win.currency_symbol, win.currency_code)}`,
    name: win.player_nickname,
    meta: [win.tournament_name, win.club?.name].filter(Boolean).join(" · "),
    tone: "win",
  };
}

/** Турниры, которые ещё можно сыграть, вперемешку с выигрышами — чтобы строка не была однотонной. */
export function tickerItems(tournaments: Tournament[], wins: WinItem[], now: Date): TickerItem[] {
  const seen = new Set<string>();
  const live = [...tournaments]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .map((item) => tournamentItem(item, now))
    .filter((item): item is TickerItem => item !== null)
    .slice(0, MAX_TOURNAMENTS);
  const won = wins.slice(0, MAX_WINS).map(winItem);
  const mixed: TickerItem[] = [];
  for (let index = 0; index < Math.max(live.length, won.length); index += 1) {
    if (live[index]) mixed.push(live[index]);
    if (won[index]) mixed.push(won[index]);
  }
  return mixed;
}

function TickerEntry({ item, hidden }: { item: TickerItem; hidden?: boolean }) {
  return (
    <span
      aria-hidden={hidden || undefined}
      className="text-ink-3 inline-flex items-center gap-2 px-4 text-[13px] whitespace-nowrap"
    >
      <span aria-hidden="true" className="bg-gold h-[5px] w-[5px] shrink-0 rotate-45" />
      <span className={cn("font-display num font-bold", TONE_CLASS[item.tone])}>{item.lead}</span>
      <span className="text-ink font-semibold">{item.name}</span>
      {item.meta ? <span>{item.meta}</span> : null}
    </span>
  );
}

/**
 * Бегущая строка под шапкой главной: что идёт прямо сейчас и кто что выиграл. Данные — из той же
 * ленты, что и блоки ниже, отдельного запроса нет. Движение можно остановить кнопкой (WCAG 2.2.2),
 * а при «уменьшить движение» строка стоит и листается пальцем.
 */
export function HomeTicker({ fallback = null }: { fallback?: ReactNode }) {
  const feed = useFeed();
  const now = useNow(60_000);
  const [paused, setPaused] = useState(false);

  const items = feed.data
    ? tickerItems([...feed.data.majors, ...feed.data.evening], feed.data.wins, now)
    : [];
  if (items.length === 0) return <>{fallback}</>;

  return (
    <div
      data-testid="home-ticker"
      className={cn(
        "relative -mx-3 flex h-11 items-center border-y border-[var(--frame-outer)]",
        "shadow-[0_3px_0_var(--bg),0_4px_0_var(--frame-inner),0_-3px_0_var(--bg),0_-4px_0_var(--frame-inner)]",
      )}
    >
      <span className="bg-bg text-live font-display relative z-10 flex h-full shrink-0 items-center gap-1.5 pr-2 pl-4 text-[10px] font-bold tracking-[0.22em] uppercase">
        <span
          aria-hidden="true"
          className="bg-live h-1.5 w-1.5 rotate-45 animate-[deco-pulse_1.6s_ease-in-out_infinite]"
        />
        Сейчас
      </span>
      <div className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_20px,#000_calc(100%-20px),transparent)] motion-reduce:overflow-x-auto">
        <div
          data-testid="home-ticker-track"
          className="flex w-max animate-[deco-ticker_40s_linear_infinite]"
          style={{
            animationDuration: `${Math.max(20, items.length * SECONDS_PER_ITEM)}s`,
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {items.map((item) => (
            <TickerEntry key={item.key} item={item} />
          ))}
          {/* Вторая копия — чтобы строка шла без разрыва; читалке она не нужна. */}
          {items.map((item) => (
            <TickerEntry key={`copy-${item.key}`} item={item} hidden />
          ))}
        </div>
      </div>
      <button
        type="button"
        aria-pressed={paused}
        aria-label={paused ? "Запустить ленту" : "Остановить ленту"}
        onClick={() => setPaused((value) => !value)}
        className="bg-bg text-gold relative z-10 flex h-full w-11 shrink-0 items-center justify-center border-l border-[var(--frame-inner)] motion-reduce:hidden"
      >
        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          {paused ? <path d="M7 4l13 8-13 8z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
        </svg>
      </button>
    </div>
  );
}
