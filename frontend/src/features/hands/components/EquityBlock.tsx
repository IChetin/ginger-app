import { PlayingCard } from "@/features/hands/components/PlayingCard";
import { describeHole } from "@/features/hands/lib/describeHand";
import type { EquityResult } from "@/features/hands/lib/equity";
import { equityPercents } from "@/features/hands/lib/equity";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

export function EquityBlock({
  holes,
  names,
  result,
}: {
  holes: string[][];
  names: string[];
  result: EquityResult;
}) {
  const pcts = equityPercents(result.values);
  return (
    <div className="border-line bg-surface mx-[13px] mt-1.5 rounded-md border px-2.5 py-1.5">
      <div
        className="text-ink-3 mb-1 flex items-center justify-between text-[10px] font-extrabold tracking-[0.09em] uppercase"
        title={result.exact ? "Точный расчёт" : "Приблизительно, 50 000 симуляций"}
      >
        <span>Эквити</span>
        <span className="text-gold">
          {holes.length} {pluralRu(holes.length, "рука", "руки", "рук")}
        </span>
      </div>
      {holes.map((hole, index) => {
        const pct = pcts[index] ?? 0;
        const isHero = index === 0;
        return (
          <div
            key={`${names[index]}-${hole.join("")}`}
            className="flex h-7 items-center gap-1.5"
            data-testid="replay-equity-row"
          >
            <div className="flex shrink-0 gap-px">
              {hole.map((card) => (
                <PlayingCard key={card} card={card} size="xs" />
              ))}
            </div>
            <div className="text-ink-3 hidden min-w-0 truncate text-[10px] font-bold min-[400px]:block">
              {names[index]}
              <span className="text-ink-3/70"> · {describeHole(hole)}</span>
            </div>
            <div className="bg-surface-3 h-1 min-w-0 flex-1 overflow-hidden rounded">
              <div
                className={cn(
                  "h-full rounded",
                  isHero ? "bg-gold-grad" : "bg-[linear-gradient(90deg,#3E5B75,#6CA8FF)]",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span
              className={cn(
                "num w-11 shrink-0 text-right text-[12px] font-extrabold",
                isHero ? "text-gold" : "text-[#6CA8FF]",
              )}
              data-testid="replay-equity-row-pct"
            >
              {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
