import {
  entriesCount,
  formatDuration,
  investedTotal,
} from "@/features/live/lib/calc";
import { visibleEvents, type LocalLiveSession } from "@/features/live/hooks";
import { formatMoney } from "@/features/schedule/lib/format";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export function LiveActiveBanner({ session }: { session: LocalLiveSession }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const events = visibleEvents(session);
  const invested = investedTotal(events);
  const entries = entriesCount(events);
  const stale = now - new Date(session.started_at).getTime() > 24 * 60 * 60 * 1000;

  return (
    <Link
      to="/live"
      className="border-line-gold mx-4 mt-3 flex items-center gap-3 rounded-lg border bg-[linear-gradient(120deg,rgba(217,179,106,.16),rgba(217,179,106,.06))] px-3.5 py-3"
      data-testid="live-active-banner"
    >
      <div className="bg-gold-grad text-ink-ongold flex h-[42px] w-[42px] shrink-0 -rotate-[4deg] items-center justify-center rounded-[13px]">
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="9" className="fill-none stroke-current [stroke-width:1.8]" />
          <path d="M12 7v5l3 2" className="fill-none stroke-current [stroke-width:1.8]" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-gold text-[10.5px] font-extrabold tracking-[0.1em] uppercase">
          {stale
            ? "Турнир ещё идёт? Завершите или отмените"
            : `Турнир идёт · ${formatDuration(session.started_at, now)}`}
        </div>
        <div className="mt-0.5 truncate text-[14.5px] font-extrabold">{session.display_name}</div>
        <div className="text-ink-2 num mt-0.5 text-xs">
          {entries} входа · {formatMoney(String(invested), session.currency.symbol)}
        </div>
      </div>
      <svg className="text-gold h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden>
        <path d="M9 6l6 6-6 6" className="fill-none stroke-current [stroke-width:1.8]" />
      </svg>
    </Link>
  );
}
