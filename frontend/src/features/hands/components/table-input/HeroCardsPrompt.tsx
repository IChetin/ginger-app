export function HeroCardsPrompt({
  onEnter,
  onSkip,
}: {
  onEnter: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/55 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <section
        role="alertdialog"
        aria-labelledby="hero-cards-prompt-title"
        aria-describedby="hero-cards-prompt-desc"
        data-testid="table-hero-cards-prompt"
        className="border-line-strong bg-surface w-full max-w-[400px] rounded-[18px] border p-4"
      >
        <h2 id="hero-cards-prompt-title" className="text-[16px] font-extrabold">
          Вы не указали свои карты
        </h2>
        <p id="hero-cards-prompt-desc" className="text-ink-3 mt-1.5 text-[13px] leading-snug">
          Без них не будет эквити и определения победителя
        </p>
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="table-hero-cards-skip"
            className="border-line-strong bg-surface-2 text-ink-2 h-12 rounded-xl border text-[13.5px] font-extrabold"
            onClick={onSkip}
          >
            Продолжить без карт
          </button>
          <button
            type="button"
            data-testid="table-hero-cards-enter"
            className="bg-gold-grad text-ink-ongold h-12 rounded-xl text-[13.5px] font-extrabold"
            onClick={onEnter}
          >
            Указать
          </button>
        </div>
      </section>
    </div>
  );
}
