import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useFeed } from "@/features/feed/api";
import { WIN_ROW_PX, WinRow } from "@/features/feed/WinRow";
import { cn } from "@/lib/utils";

const VISIBLE_ROWS = 3;
/** Секунд на строку: около 16 px в секунду — читается на ходу, как титры. */
const SECONDS_PER_ROW = 3;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Баннер «Выигрыши» сверху главной (Иван, 28.09): окно в три строки, список медленно и без
 * остановок ползёт вверх, как титры. Выигрыши — за две недели, от 10 000 ₽ (так отдаёт лента).
 * Тап — вся история на /wins.
 *
 * Кнопки паузы нет (Иван, 08.10): она занимала место в рамке и сбивала вид. Остановить титры
 * можно только системной настройкой «уменьшить движение» — тогда окно стоит и листается
 * пальцем. Это слабее, чем требует WCAG 2.2.2: там нужен способ, доступный всем.
 */
export function WinsTicker({ fallback = null }: { fallback?: ReactNode }) {
  const feed = useFeed();
  const wins = feed.data?.wins ?? [];
  const reduced = useReducedMotion();

  if (wins.length === 0) return <>{fallback}</>;

  const scrolling = wins.length > VISIBLE_ROWS && !reduced;
  // Вторая копия — чтобы титры шли по кругу без рывка; читалке она не нужна.
  const rows = scrolling ? [...wins, ...wins] : wins;

  return (
    <section
      data-testid="wins-ticker"
      className={cn(
        "relative -mx-3 mt-3 border-y border-[var(--frame-outer)]",
        "shadow-[0_3px_0_var(--bg),0_4px_0_var(--frame-inner),0_-3px_0_var(--bg),0_-4px_0_var(--frame-inner)]",
      )}
    >
      <h2 className="bg-bg text-gold font-display absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-2.5 text-[9.5px] leading-[14px] font-semibold tracking-[0.24em] whitespace-nowrap uppercase">
        Выигрыши
      </h2>
      <Link
        to="/wins"
        aria-label="Выигрыши — открыть всю историю"
        className={cn("block", reduced ? "overflow-y-auto" : "overflow-hidden")}
        style={{ height: WIN_ROW_PX * Math.min(VISIBLE_ROWS, wins.length) }}
      >
        <div
          data-testid="wins-ticker-track"
          className={cn(scrolling && "animate-[deco-credits_60s_linear_infinite]")}
          style={
            scrolling ? { animationDuration: `${wins.length * SECONDS_PER_ROW}s` } : undefined
          }
        >
          {rows.map((win, position) => (
            <div
              key={`${win.id}-${position}`}
              aria-hidden={position >= wins.length || undefined}
              className="border-b border-[var(--frame-inner)]"
            >
              <WinRow win={win} />
            </div>
          ))}
        </div>
      </Link>
    </section>
  );
}
