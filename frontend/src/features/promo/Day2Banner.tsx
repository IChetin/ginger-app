/** Сайт Day2 — нашего приложения для живых серий. */
export const DAY2_URL = "https://day2.pro";

/**
 * Полоса Day2 над нижним меню главной (Иван, 28.09): во всю ширину, как баннер выигрышей.
 * Лучи медленно вращаются, по названию бежит блик, по кнопке — отблеск; вся полоса — ссылка
 * на day2.pro. Меню сообщает свою высоту в `--nav-h`, полоса встаёт ровно над ним.
 */
export function Day2Banner() {
  return (
    <a
      href={DAY2_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="day2-banner"
      className="bg-bg fixed left-1/2 z-20 flex h-14 w-full max-w-[420px] -translate-x-1/2 items-center gap-3 overflow-hidden border-t border-[var(--frame-outer)] px-4 shadow-[0_-3px_0_var(--bg),0_-4px_0_var(--frame-inner)]"
      style={{ bottom: "var(--nav-h, 64px)" }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-12 -mt-[120px] -ml-[120px] h-[240px] w-[240px] animate-[deco-spin_40s_linear_infinite] bg-[repeating-conic-gradient(from_0deg,var(--gold-soft)_0deg_3deg,transparent_3deg_12deg)] [mask-image:radial-gradient(circle,#000_10%,transparent_55%)]"
      />
      <span className="deco-shimmer-text font-display relative text-[24px] leading-none font-extrabold tracking-[0.1em]">
        DAY2
      </span>
      <span className="relative min-w-0 flex-1 leading-tight">
        <span className="text-ink block truncate text-[12px] font-semibold">
          Для живых серий
        </span>
        <span className="text-ink-3 font-display mt-0.5 block truncate text-[9px] tracking-[0.14em] uppercase">
          Расписание · Банкролл
        </span>
      </span>
      <span className="bg-gold-grad text-ink-ongold font-display relative flex h-9 shrink-0 items-center overflow-hidden px-3 text-[11px] font-bold tracking-[0.14em] uppercase [outline:1px_solid_var(--engrave)] [outline-offset:-4px]">
        Открыть
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-2/5 animate-[deco-glint_3.2s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/45%),transparent)]"
        />
      </span>
    </a>
  );
}
