import { StickyHeader } from "@/components/layout/StickyHeader";
import { formatMoney } from "@/features/chips/lib/format";
import { useWinsHistory, type WinItem } from "@/features/feed/api";
import { WinRow } from "@/features/feed/WinRow";
import { pluralRu } from "@/lib/plural";

const monthDay = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const dayOnly = new Intl.DateTimeFormat("ru-RU", { day: "numeric", timeZone: "UTC" });

/** Понедельник недели (пн–вс), в которую попал день, — ключ группировки. */
export function weekStart(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

/** «21–27 сентября» или «29 сентября – 5 октября». */
export function weekLabel(monday: string): string {
  const start = new Date(`${monday}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 24 * 3600_000);
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${dayOnly.format(start)}–${monthDay.format(end)}`;
  }
  return `${monthDay.format(start)} – ${monthDay.format(end)}`;
}

function groupByWeek(wins: WinItem[]): [string, WinItem[]][] {
  const groups = new Map<string, WinItem[]>();
  for (const win of wins) {
    const key = weekStart(win.won_on);
    groups.set(key, [...(groups.get(key) ?? []), win]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
}

/** Сумма недели по валютам: «₽330 000» или «₽330 000 · $640». */
function weekTotal(wins: WinItem[]): string {
  const totals = new Map<string, { symbol: string | null; amount: number }>();
  for (const win of wins) {
    const line = totals.get(win.currency_code) ?? { symbol: win.currency_symbol, amount: 0 };
    line.amount += Number(win.prize_amount);
    totals.set(win.currency_code, line);
  }
  return [...totals.entries()]
    .map(([code, line]) => formatMoney(Math.round(line.amount), line.symbol, code))
    .join(" · ");
}

/** Вся история выигрышей по неделям — открывается тапом по баннеру на главной. */
export function WinsPage() {
  const history = useWinsHistory();
  const weeks = history.data ? groupByWeek(history.data) : [];

  return (
    <div className="bg-bg min-h-full pb-4" data-testid="wins-page">
      <StickyHeader title="Выигрыши" backFallback="/" compactible={false} />
      {history.isPending ? <div className="bg-surface-2 mx-3 mt-3 h-40" /> : null}
      {history.isError ? (
        <p className="text-ink-3 mt-6 text-center text-[13px]">
          Не удалось загрузить — потяните экран позже.
        </p>
      ) : null}
      {history.isSuccess && weeks.length === 0 ? (
        <p className="text-ink-3 mt-6 text-center text-[13px]">Выигрышей пока нет.</p>
      ) : null}
      {weeks.map(([monday, wins]) => (
        <section key={monday} className="mt-5" data-testid="wins-week">
          <div className="px-3">
            <h2 className="deco-title">{weekLabel(monday)}</h2>
            <p className="text-ink-3 mt-1 text-center text-[12px]">
              {wins.length} {pluralRu(wins.length, "выигрыш", "выигрыша", "выигрышей")} ·{" "}
              <span className="font-display num text-value-hi font-bold">{weekTotal(wins)}</span>
            </p>
          </div>
          <div className="mt-2 border-y border-[var(--frame-inner)]">
            {wins.map((win) => (
              <div key={win.id} className="border-b border-[var(--frame-inner)] last:border-b-0">
                <WinRow win={win} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
