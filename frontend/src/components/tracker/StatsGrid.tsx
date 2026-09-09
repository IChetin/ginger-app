import type { StatsSummary } from "@/api/types/tracker";
import { currencySymbol, formatNumberRu, signPrefix } from "@/lib/money";
import { entriesWord } from "@/lib/plural";
import { cn } from "@/lib/utils";

function signed(value: string, suffix: string): string {
  const number = Number(value);
  return `${signPrefix(number)}${formatNumberRu(Math.abs(number), 1)}${suffix}`;
}

function signClass(value: string | null): string {
  const number = Number(value ?? 0);
  if (number > 0) return "text-live";
  if (number < 0) return "text-danger";
  return "text-ink";
}

export function StatsGrid({ summary }: { summary: StatsSummary }) {
  const symbol = currencySymbol(summary.base_currency);
  const cards = [
    {
      label: "Профит",
      value: signed(summary.profit, ` ${symbol}`),
      className: signClass(summary.profit),
    },
    {
      label: "ROI",
      value: summary.roi == null ? "—" : signed(summary.roi, " %"),
      className: signClass(summary.roi),
    },
    {
      label: `ABI · ${summary.entries} ${entriesWord(summary.entries)}`,
      value: summary.abi == null ? "—" : `${formatNumberRu(summary.abi)} ${symbol}`,
      className: "text-ink",
    },
    {
      label: "ITM",
      value: `${formatNumberRu(summary.itm, 1)} %`,
      className: "text-ink",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 px-4 pt-4" data-testid="stats-grid">
      {cards.map((card) => (
        <div key={card.label} className="border-line bg-surface rounded-md border px-3.5 py-3">
          <div className="text-ink-3 text-[11px] font-semibold">{card.label}</div>
          <div className={cn("num mt-0.5 text-[19px] font-extrabold", card.className)}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
