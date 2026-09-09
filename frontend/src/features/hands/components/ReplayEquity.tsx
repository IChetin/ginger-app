import { useState, type ReactNode } from "react";

import { EquityBlock } from "@/features/hands/components/EquityBlock";
import { PlayingCard } from "@/features/hands/components/PlayingCard";
import { WIZARD_EQUITY_ITERATIONS, heroEquityPct } from "@/features/hands/lib/equity";
import type { ReplayState } from "@/features/hands/lib/hand-engine";
import { useEquity } from "@/features/hands/lib/useEquity";
import {
  WIZARD_EQUITY_HINT,
  WIZARD_EQUITY_KNOWN_CAPTION,
  WIZARD_EQUITY_RANDOM_CAPTION,
  replayEquityInput,
} from "@/features/hands/lib/wizardEquity";

const rowClass = "flex w-full min-w-0 items-center gap-2";

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
      <div className="flex shrink-0 gap-0.5" data-testid="replay-equity-hole">
        {heroCards.map((card) => (
          <PlayingCard key={card} card={card} size="xs" />
        ))}
      </div>
      <div className="bg-surface-3 h-1.5 min-w-0 flex-1 overflow-hidden rounded">
        <div
          data-testid="replay-equity-bar"
          className="bg-gold-grad h-full rounded"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
      <div className="w-[4.75rem] shrink-0 text-right">
        <div
          className="text-gold num text-[15px] leading-none font-extrabold"
          data-testid="replay-equity-pct"
        >
          {pct == null ? "…" : `${pct.toFixed(1)}%`}
        </div>
        <div
          className="text-ink-3 mt-0.5 text-[8px] leading-tight"
          data-testid="replay-equity-caption"
        >
          {caption}
        </div>
      </div>
    </>
  );
}

function equityNames(state: ReplayState): string[] {
  const shown = state.seats.filter(
    (seat) => !seat.isHero && !seat.folded && seat.cards.length === 2,
  );
  return ["Вы", ...shown.map((seat) => seat.name)];
}

export function ReplayEquity({ state }: { state: ReplayState }) {
  const input = replayEquityInput(state);
  const { result, failed } = useEquity(input?.holes ?? null, input?.board ?? [], {
    randomOpponents: input?.randomOpponents ?? 0,
    iterations: input?.vsKnown ? undefined : WIZARD_EQUITY_ITERATIONS,
  });
  const [hintOpen, setHintOpen] = useState(false);

  if (!input) return null;

  if (failed) {
    return (
      <div
        className="border-line bg-surface mx-[13px] mt-1.5 rounded-md border px-2.5 py-1.5"
        data-testid="replay-equity"
        data-failed="true"
      >
        <p className="text-ink-3 text-[12px] font-semibold">Не удалось посчитать эквити</p>
      </div>
    );
  }

  if (input.vsKnown) {
    if (!result) {
      return (
        <div
          className="border-line bg-surface mx-[13px] mt-1.5 rounded-md border px-2.5 py-1.5"
          data-testid="replay-equity"
          data-vs="known"
        >
          <div className={rowClass}>
            <EquityRow
              heroCards={input.heroCards}
              pct={null}
              caption={WIZARD_EQUITY_KNOWN_CAPTION}
            />
          </div>
        </div>
      );
    }
    return (
      <div data-testid="replay-equity" data-vs="known">
        <EquityBlock holes={input.holes} names={equityNames(state)} result={result} />
      </div>
    );
  }

  const pct = result ? heroEquityPct(result) : null;
  const caption = WIZARD_EQUITY_RANDOM_CAPTION;
  const label = `${pct == null ? "считается" : `${pct.toFixed(1)}%`} ${caption}`;
  const showHint = hintOpen;

  return (
    <div
      className="border-line bg-surface mx-[13px] mt-1.5 rounded-md border px-2.5 py-1.5"
      data-testid="replay-equity"
      data-vs="random"
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={showHint}
        title={WIZARD_EQUITY_HINT}
        className={rowClass}
        onClick={() => setHintOpen((open) => !open)}
      >
        <EquityRow heroCards={input.heroCards} pct={pct} caption={caption} />
      </button>
      {showHint ? (
        <p className="text-ink-3 mt-1.5 text-[10px] leading-snug">{WIZARD_EQUITY_HINT}</p>
      ) : null}
    </div>
  );
}
