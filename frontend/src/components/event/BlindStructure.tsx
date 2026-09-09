import { useMemo, useState } from "react";

import type { BlindLevelRead } from "@/api/types/schedule";
import {
  filterLevelsBySet,
  normalizeStructureSetLabel,
  structureSetLabels,
} from "@/features/schedule/lib/structureSets";
import { cn } from "@/lib/utils";

const INITIAL_VISIBLE = 10;

function formatBlinds(level: BlindLevelRead): string {
  if (level.sb == null || level.bb == null) {
    return "—";
  }
  return `${level.sb.toLocaleString("ru-RU")} / ${level.bb.toLocaleString("ru-RU")}`;
}

function typicalLevelMinutes(levels: BlindLevelRead[]): number | null {
  const play = levels.filter((level) => !level.is_break && level.minutes > 0);
  if (play.length === 0) {
    return null;
  }
  const counts = new Map<number, number>();
  for (const level of play) {
    counts.set(level.minutes, (counts.get(level.minutes) ?? 0) + 1);
  }
  let best = play[0].minutes;
  let bestCount = 0;
  for (const [minutes, count] of counts) {
    if (count > bestCount) {
      best = minutes;
      bestCount = count;
    }
  }
  return best;
}

type Props = {
  levels: BlindLevelRead[];
};

export function BlindStructure({ levels }: Props) {
  const setLabels = useMemo(() => structureSetLabels(levels), [levels]);
  const [activeSet, setActiveSet] = useState(() => setLabels[0] ?? "default");
  const [expanded, setExpanded] = useState(false);

  if (levels.length === 0) {
    return null;
  }

  const activeSetLabel = setLabels.includes(normalizeStructureSetLabel(activeSet))
    ? normalizeStructureSetLabel(activeSet)
    : (setLabels[0] ?? "default");

  const visibleLevels = filterLevelsBySet(levels, activeSetLabel);
  const minutesHint = typicalLevelMinutes(visibleLevels);
  const shown = expanded ? visibleLevels : visibleLevels.slice(0, INITIAL_VISIBLE);
  const hiddenCount = Math.max(0, visibleLevels.length - INITIAL_VISIBLE);

  return (
    <section className="mt-5 px-4" data-testid="blind-structure">
      <h2 className="mb-2.5 text-[17px] font-extrabold">
        Структура
        {minutesHint != null ? (
          <span className="text-ink-3 ml-1.5 text-xs font-normal">
            уровни по {minutesHint} минут
          </span>
        ) : null}
      </h2>

      {setLabels.length > 1 ? (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {setLabels.map((label) => (
            <button
              key={label}
              type="button"
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-semibold",
                label === activeSetLabel
                  ? "border-line-gold bg-gold-soft text-gold"
                  : "border-line-strong bg-surface-2 text-ink-2",
              )}
              onClick={() => {
                setActiveSet(label);
                setExpanded(false);
              }}
            >
              {label === "default" ? "Основная" : label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="border-line bg-surface overflow-hidden rounded-md border">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="border-line text-ink-3 border-b px-3.5 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] uppercase">
                Ур.
              </th>
              <th className="border-line text-ink-3 border-b px-3.5 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] uppercase">
                Блайнды
              </th>
              <th className="border-line text-ink-3 border-b px-3.5 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] uppercase">
                Анте
              </th>
              <th className="border-line text-ink-3 border-b px-3.5 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] uppercase">
                Мин
              </th>
            </tr>
          </thead>
          <tbody className="num">
            {shown.map((level, index) => {
              if (level.is_break) {
                return (
                  <tr key={`break-${level.level_no}-${index}`} className="bg-surface-2">
                    <td
                      colSpan={4}
                      className="border-line text-ink-3 border-b px-3.5 py-2 text-center text-xs font-bold"
                    >
                      Перерыв · {level.minutes} минут
                    </td>
                  </tr>
                );
              }
              return (
                <tr
                  key={`${level.structure_set_label}-${level.level_no}`}
                  className={cn(
                    level.is_late_reg_end && "[&>td]:border-b-line-gold [&>td]:border-b-2",
                  )}
                >
                  <td className="border-line text-ink-3 w-11 border-b px-3.5 py-2 font-bold">
                    {level.level_no}
                  </td>
                  <td className="border-line border-b px-3.5 py-2 tabular-nums">
                    {formatBlinds(level)}
                  </td>
                  <td className="border-line border-b px-3.5 py-2 tabular-nums">
                    {level.ante != null ? level.ante.toLocaleString("ru-RU") : "—"}
                  </td>
                  <td className="border-line border-b px-3.5 py-2 tabular-nums">
                    {level.minutes}
                    {level.is_late_reg_end ? (
                      <span className="text-gold ml-1 text-[11px] font-bold">
                        · конец поздней рег.
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hiddenCount > 0 && !expanded ? (
          <button
            type="button"
            className="text-gold w-full py-3 text-[13px] font-bold"
            onClick={() => setExpanded(true)}
            data-testid="blinds-expand"
          >
            Показать все {visibleLevels.length} уровней
          </button>
        ) : null}
      </div>
    </section>
  );
}
