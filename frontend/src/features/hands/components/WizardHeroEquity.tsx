import { useState, type ReactNode } from "react";

import { PlayingCard } from "@/features/hands/components/PlayingCard";
import { WIZARD_EQUITY_ITERATIONS, heroEquityPct } from "@/features/hands/lib/equity";
import { useEquity } from "@/features/hands/lib/useEquity";
import {
  WIZARD_EQUITY_HINT,
  WIZARD_EQUITY_KNOWN_CAPTION,
  WIZARD_EQUITY_RANDOM_CAPTION,
  wizardEquityInput,
} from "@/features/hands/lib/wizardEquity";
import type { WizardState } from "@/features/hands/lib/wizardState";

const rowClass = "flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left";

function EquityRow({
  heroCards,
  pct,
  caption,
}: {
  heroCards: string[];
  pct: number | null;
  caption: string;
}): ReactNode {
  return (
    <>
      <div className="flex shrink-0 gap-0.5" data-testid="wizard-equity-hole">
        {heroCards.map((card) => (
          <PlayingCard key={card} card={card} size="xs" />
        ))}
      </div>
      <div className="bg-surface-3 h-1.5 min-w-0 flex-1 overflow-hidden rounded">
        <div
          data-testid="wizard-equity-bar"
          className="bg-gold-grad h-full rounded"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
      <div className="w-[4.75rem] shrink-0 text-right">
        <div
          className="text-gold num text-[15px] leading-none font-extrabold"
          data-testid="wizard-equity-pct"
        >
          {pct == null ? "…" : `${pct.toFixed(1)}%`}
        </div>
        <div
          className="text-ink-3 mt-0.5 text-[8px] leading-tight"
          data-testid="wizard-equity-caption"
        >
          {caption}
        </div>
      </div>
    </>
  );
}

export function WizardHeroEquity({ state }: { state: WizardState }) {
  const input = wizardEquityInput(state);
  const { result, failed } = useEquity(input?.holes ?? null, input?.board ?? [], {
    randomOpponents: input?.randomOpponents ?? 0,
    iterations: WIZARD_EQUITY_ITERATIONS,
  });
  const [hintOpen, setHintOpen] = useState(false);

  if (!input) return null;

  const pct = failed ? null : result ? heroEquityPct(result) : null;
  const caption = failed
    ? "не удалось посчитать"
    : input.vsKnown
      ? WIZARD_EQUITY_KNOWN_CAPTION
      : WIZARD_EQUITY_RANDOM_CAPTION;
  const showHint = !input.vsKnown && hintOpen;
  const label = `${pct == null ? "считается" : `${pct.toFixed(1)}%`} ${caption}`;
  const row = <EquityRow heroCards={input.heroCards} pct={pct} caption={caption} />;

  return (
    <div className="border-line border-t">
      {input.vsKnown ? (
        <div
          data-testid="wizard-hero-equity"
          data-vs="known"
          aria-label={label}
          className={rowClass}
        >
          {row}
        </div>
      ) : (
        <button
          type="button"
          data-testid="wizard-hero-equity"
          data-vs="random"
          aria-label={label}
          aria-expanded={showHint}
          title={WIZARD_EQUITY_HINT}
          className={rowClass}
          onClick={() => setHintOpen((open) => !open)}
        >
          {row}
        </button>
      )}
      {showHint ? (
        <p
          data-testid="wizard-equity-hint"
          className="text-ink-3 px-3 pb-1.5 text-[10px] leading-snug"
        >
          {WIZARD_EQUITY_HINT}
        </p>
      ) : null}
    </div>
  );
}
