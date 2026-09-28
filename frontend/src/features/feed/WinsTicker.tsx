import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useFeed } from "@/features/feed/api";
import { WIN_ROW_PX, WinRow } from "@/features/feed/WinRow";
import { cn } from "@/lib/utils";

const VISIBLE_ROWS = 3;
const STEP_MS = 3000;

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
 * Баннер выигрышей сверху главной (Иван, 28.09): окно в три строки, строки листаются вверх по
 * одной. Крутится вся последняя неделя — её отдаёт лента. Тап — полная история на /wins.
 * Листание можно остановить (WCAG 2.2.2); при «уменьшить движение» окно стоит.
 */
export function WinsTicker({ fallback = null }: { fallback?: ReactNode }) {
  const feed = useFeed();
  const wins = feed.data?.wins ?? [];
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const scrolling = wins.length > VISIBLE_ROWS && !reduced;

  useEffect(() => {
    if (!scrolling || paused) return;
    const timer = window.setInterval(() => setIndex((value) => value + 1), STEP_MS);
    return () => window.clearInterval(timer);
  }, [scrolling, paused]);

  // За последней строкой идут копии первых трёх: доехали — без анимации прыгаем в начало.
  useEffect(() => {
    if (animate) return;
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, [animate]);

  if (wins.length === 0) return <>{fallback}</>;

  const rows = scrolling ? [...wins, ...wins.slice(0, VISIBLE_ROWS)] : wins;
  const offset = scrolling ? index : 0;

  return (
    <section
      data-testid="wins-ticker"
      className={cn(
        "relative -mx-3 mt-3 border-y border-[var(--frame-outer)]",
        "shadow-[0_3px_0_var(--bg),0_4px_0_var(--frame-inner),0_-3px_0_var(--bg),0_-4px_0_var(--frame-inner)]",
      )}
    >
      <h2 className="bg-bg text-gold font-display absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-2.5 text-[9.5px] leading-[14px] font-semibold tracking-[0.24em] whitespace-nowrap uppercase">
        Выигрыши недели
      </h2>
      <Link
        to="/wins"
        aria-label="Выигрыши недели — открыть всю историю"
        className="block overflow-hidden"
        style={{ height: WIN_ROW_PX * Math.min(VISIBLE_ROWS, wins.length) }}
      >
        <div
          data-testid="wins-ticker-track"
          onTransitionEnd={() => {
            if (index >= wins.length) {
              setAnimate(false);
              setIndex(0);
            }
          }}
          style={{
            transform: `translateY(-${offset * WIN_ROW_PX}px)`,
            transition: animate ? "transform 600ms cubic-bezier(0.6, 0, 0.2, 1)" : "none",
          }}
        >
          {rows.map((win, position) => (
            <div
              key={`${win.id}-${position}`}
              aria-hidden={position >= wins.length || undefined}
              className="border-b border-[var(--frame-inner)] last:border-b-0"
            >
              <WinRow win={win} />
            </div>
          ))}
        </div>
      </Link>
      {scrolling ? (
        <button
          type="button"
          aria-pressed={paused}
          aria-label={paused ? "Листать выигрыши" : "Остановить выигрыши"}
          onClick={() => setPaused((value) => !value)}
          className="bg-bg text-gold absolute right-3 bottom-0 z-10 flex h-6 w-7 translate-y-1/2 items-center justify-center"
        >
          <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            {paused ? <path d="M7 4l13 8-13 8z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
          </svg>
        </button>
      ) : null}
    </section>
  );
}
