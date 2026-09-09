import { WIZARD_EQUITY_ITERATIONS, heroEquityPct } from "@/features/hands/lib/equity";
import type { HandComposition } from "@/features/hands/lib/hand-engine";
import { useEquity } from "@/features/hands/lib/useEquity";
import {
  WIZARD_EQUITY_HINT,
  WIZARD_EQUITY_KNOWN_CAPTION,
  WIZARD_EQUITY_RANDOM_CAPTION,
  compositionEquityInput,
} from "@/features/hands/lib/wizardEquity";

export function TableEquityBadge({
  composition,
  embedded = false,
}: {
  composition: HandComposition;
  embedded?: boolean;
}) {
  const input = compositionEquityInput(composition);
  const { result, failed } = useEquity(input?.holes ?? null, input?.board ?? [], {
    randomOpponents: input?.randomOpponents ?? 0,
    iterations: input?.vsKnown ? undefined : WIZARD_EQUITY_ITERATIONS,
  });
  if (!input) return null;
  const pct = result ? heroEquityPct(result) : null;
  const caption = input.vsKnown ? WIZARD_EQUITY_KNOWN_CAPTION : WIZARD_EQUITY_RANDOM_CAPTION;
  const value = failed ? "не удалось посчитать" : pct == null ? "…" : `${pct.toFixed(1)}%`;
  const label = `${failed ? "не удалось посчитать" : pct == null ? "считается" : `${pct.toFixed(1)}%`} ${caption}`;

  return (
    <div
      data-testid="table-equity-badge"
      data-vs={input.vsKnown ? "known" : "random"}
      data-failed={failed ? "true" : "false"}
      aria-label={label}
      title={input.vsKnown ? caption : WIZARD_EQUITY_HINT}
      className={embedded ? "mb-1" : "border-line bg-surface shrink-0 border-t px-3 py-1.5"}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span
          className="text-ink-2 min-w-0 truncate text-[11px] font-semibold"
          data-testid="table-equity-caption"
        >
          {caption}
        </span>
        <span
          className="text-gold num shrink-0 text-[15px] font-extrabold"
          data-testid="table-equity-pct"
        >
          {value}
        </span>
      </div>
    </div>
  );
}
