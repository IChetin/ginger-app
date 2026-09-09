import type { EventDetail } from "@/api/types/schedule";
import { formatGameType, formatMoney } from "@/features/schedule/lib/format";
import { cn } from "@/lib/utils";

type Fact = {
  key: string;
  value: string;
  label: string;
  gold?: boolean;
};

function buildFacts(event: EventDetail): Fact[] {
  const facts: Fact[] = [
    {
      key: "buyin",
      value: formatMoney(event.buyin, event.currency.symbol),
      label: "Бай-ин",
      gold: true,
    },
  ];

  if (event.guarantee) {
    facts.push({
      key: "guarantee",
      value: formatMoney(event.guarantee, event.currency.symbol),
      label: "Гарантия",
      gold: true,
    });
  }

  if (event.start_stack != null) {
    facts.push({
      key: "stack",
      value: event.start_stack.toLocaleString("ru-RU"),
      label: "Стартовый стек",
    });
  }

  if (event.start_blinds) {
    facts.push({
      key: "blinds",
      value: event.start_blinds,
      label: "Стартовые блайнды",
    });
  }

  facts.push({
    key: "game",
    value: formatGameType(event.game_type),
    label: "Дисциплина",
  });

  if (event.reentry_unlimited) {
    facts.push({
      key: "reentry",
      value: "∞",
      label: "Ре-энтри на флайт",
    });
  } else if (event.reentry_count != null && event.reentry_count > 0) {
    facts.push({
      key: "reentry",
      value: `×${event.reentry_count}`,
      label: "Ре-энтри на флайт",
    });
  }

  if (event.late_reg_level != null) {
    facts.push({
      key: "late",
      value: `До ур. ${event.late_reg_level}`,
      label: "Поздняя регистрация",
    });
  }

  return facts;
}

export function FactsGrid({ event }: { event: EventDetail }) {
  const facts = buildFacts(event);
  return (
    <div className="num grid grid-cols-2 gap-2.5 p-4" data-testid="facts-grid">
      {facts.map((fact) => (
        <div
          key={fact.key}
          className={cn(
            "border-line bg-surface rounded-md border px-3.5 py-3",
            fact.gold && "border-line-gold",
          )}
          data-testid={`fact-${fact.key}`}
        >
          <div className={cn("text-[17px] font-extrabold tabular-nums", fact.gold && "text-gold")}>
            {fact.value}
          </div>
          <div className="text-ink-3 mt-0.5 text-[11px]">{fact.label}</div>
        </div>
      ))}
    </div>
  );
}
