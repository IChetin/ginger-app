import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StatsChartPoint } from "@/api/types/tracker";
import { currencySymbol, formatNumberRu } from "@/lib/money";

export function ProfitChart({
  points,
  currency,
  periodLabel,
}: {
  points: StatsChartPoint[];
  currency: string;
  periodLabel: string;
}) {
  const data = points.map((point) => ({
    ...point,
    cumulative: Number(point.cumulative_profit),
  }));

  return (
    <section className="border-line bg-surface mx-4 mt-3 rounded-lg border p-3.5">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="text-ink text-[15px] font-bold">Накопительный профит</h2>
        <span className="num text-ink-3 text-[12px]">{periodLabel}</span>
      </div>
      {data.length === 0 ? (
        <div className="text-ink-2 flex h-[130px] items-center justify-center text-[13px]">
          Добавьте первый результат
        </div>
      ) : (
        <div className="h-[130px] w-full" role="img" aria-label="График профита">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="trackerProfitFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line-strong)" />
              <XAxis dataKey="index" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                cursor={{ stroke: "var(--line-gold)" }}
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 10,
                  color: "var(--text)",
                  fontSize: 12,
                }}
                formatter={(value) => [
                  `${formatNumberRu(Number(value), 3)} ${currencySymbol(currency)}`,
                  "Профит",
                ]}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as StatsChartPoint | undefined;
                  return point ? `${point.label} · ${point.played_on}` : "";
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="var(--gold)"
                strokeWidth={2.5}
                fill="url(#trackerProfitFill)"
                dot={false}
                activeDot={{ r: 4, fill: "var(--gold-hi)", stroke: "var(--gold-hi)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
