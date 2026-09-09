import { HERO_NAME } from "@/features/hands/lib/playerNames";
import { potShare } from "@/features/hands/lib/stackDisplay";
import { cn } from "@/lib/utils";

export function ReplayResult({
  winnerNames,
  pot,
  heroProfit,
  formatAmount,
  formatProfit,
  split,
  sidePotWarning,
}: {
  winnerNames: string[];
  pot: number;
  heroProfit: number;
  formatAmount: (value: number) => string;
  formatProfit: (value: number) => string;
  split: boolean;
  sidePotWarning: boolean;
}) {
  const share = potShare(pot, winnerNames.length);
  const who =
    winnerNames.length === 0
      ? "Победитель не указан"
      : split
        ? `${winnerNames.join(" и ")} делят банк`
        : winnerNames[0] === HERO_NAME
          ? `${HERO_NAME} забираете банк`
          : `${winnerNames[0]} забирает банк`;

  return (
    <section
      className="border-line-gold bg-surface-2 mx-[13px] mt-1 rounded-[12px] border px-3 py-1.5"
      data-testid="replay-result"
    >
      <p className="text-[13px] font-extrabold" data-testid="replay-result-winners">
        {who}
      </p>
      <p className="text-ink-2 mt-0.5 text-[12px]" data-testid="replay-result-pot">
        Банк {formatAmount(pot)}
        {split && winnerNames.length > 1 ? ` · каждому ${formatAmount(share)}` : ""}
      </p>
      <p
        className={cn(
          "num mt-0.5 text-[16px] leading-none font-extrabold",
          heroProfit > 0 ? "text-live" : heroProfit < 0 ? "text-danger" : "text-ink",
        )}
        data-testid="replay-result-hero"
      >
        {formatProfit(heroProfit)}
      </p>
      {sidePotWarning ? (
        <p className="text-ink-3 mt-1.5 text-[11px]" data-testid="replay-result-sidepots">
          Сайд-поты не учитываются — банк показан целиком
        </p>
      ) : null}
    </section>
  );
}
