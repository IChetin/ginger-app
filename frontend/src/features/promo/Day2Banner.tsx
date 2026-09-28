/** Сайт Day2 — нашего приложения для живых серий. */
export const DAY2_URL = "https://day2.pro";

const FEATURES = ["Расписание", "Банкролл", "Планировщик"];

/**
 * Баннер Day2 на главной (Иван, 28.09): лучи медленно вращаются, по названию бежит блик,
 * по кнопке — отблеск. Весь баннер — одна ссылка; при «уменьшить движение» он неподвижен.
 */
export function Day2Banner() {
  return (
    <a
      href={DAY2_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="day2-banner"
      className="deco-frame deco-corners mt-6 block overflow-hidden px-5 pt-7 pb-6 text-center"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -mt-[260px] -ml-[260px] h-[520px] w-[520px] animate-[deco-spin_60s_linear_infinite] bg-[repeating-conic-gradient(from_0deg,var(--gold-soft)_0deg_3deg,transparent_3deg_12deg)] [mask-image:radial-gradient(circle,#000_16%,transparent_62%)]"
      />
      <span className="relative block">
        <span className="text-ink-2 font-display block text-[10px] font-semibold tracking-[0.24em] uppercase">
          Наше приложение для живых серий
        </span>
        <span className="deco-shimmer-text font-display mt-2 block text-[46px] leading-none font-extrabold tracking-[0.1em]">
          DAY2
        </span>
        <span className="text-ink-2 mt-2.5 block text-[13px]">
          Расписание живых МТТ-серий, трекер банкролла и планировщик поездок — в телефоне.
        </span>
        <span className="mt-3 flex justify-center gap-1.5">
          {FEATURES.map((feature) => (
            <span
              key={feature}
              className="deco-frame-sm text-gold font-display px-2.5 py-1 text-[9.5px] font-semibold tracking-[0.14em] uppercase"
            >
              {feature}
            </span>
          ))}
        </span>
        <span className="bg-gold-grad text-ink-ongold font-display relative mt-4 inline-flex h-11 items-center gap-2 overflow-hidden px-6 text-[12.5px] font-bold tracking-[0.14em] uppercase [outline:1px_solid_var(--engrave)] [outline-offset:-4px]">
          Открыть Day2
          <span aria-hidden="true">→</span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-2/5 animate-[deco-glint_3.2s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/45%),transparent)]"
          />
        </span>
      </span>
    </a>
  );
}
