import {
  getDayDots,
  rangeCellRole,
  type CalendarDotKind,
  type CalendarRangeState,
  type RangeCellRole,
} from "@/components/calendar/calendarDisplay";
import type { CalendarSeriesItem } from "@/api/types/schedule";
import { buildMonthGrid, type CalendarCell } from "@/features/schedule/lib/calendarGrid";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

function DayDots({ dots, edge }: { dots: CalendarDotKind[]; edge: boolean }) {
  if (dots.length === 0) {
    return null;
  }

  return (
    <span className="flex h-[5px] gap-[3px]">
      {dots.map((kind, index) => (
        <i
          key={`${kind}-${index}`}
          className={cn(
            "h-[5px] w-[5px] rounded-full",
            edge ? "bg-ink-ongold/55" : kind === "gold" ? "bg-gold" : "bg-ink-2",
          )}
        />
      ))}
    </span>
  );
}

function rangeStripClass(role: RangeCellRole): string {
  if (role === "none") {
    return "";
  }
  const base =
    "before:bg-gold-soft before:pointer-events-none before:absolute before:inset-y-1 before:-inset-x-px before:content-['']";
  if (role === "only") {
    return cn(base, "before:inset-x-1 before:rounded-[12px]");
  }
  if (role === "start") {
    return cn(base, "before:left-1 before:rounded-l-[12px]");
  }
  if (role === "end") {
    return cn(base, "before:right-1 before:rounded-r-[12px]");
  }
  return base;
}

function DayCell({
  cell,
  dots,
  isToday,
  role,
  onSelect,
}: {
  cell: CalendarCell;
  dots: CalendarDotKind[];
  isToday: boolean;
  role: RangeCellRole;
  onSelect: (isoDate: string) => void;
}) {
  const isEdge = role === "start" || role === "end" || role === "only";

  return (
    <div className={cn("relative aspect-square", rangeStripClass(role))}>
      <button
        type="button"
        data-testid={`calendar-day-${cell.isoDate}`}
        aria-pressed={isEdge || role === "in"}
        aria-label={cell.isoDate}
        onClick={() => onSelect(cell.isoDate)}
        className={cn(
          "num text-ink relative z-[1] flex h-full w-full cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[12px] border border-transparent bg-transparent text-[14px] font-semibold",
          !cell.inMonth && "text-ink-3 opacity-45",
          isToday && !isEdge && "border-live",
          isEdge && "bg-gold-grad text-ink-ongold shadow-sheen-soft font-extrabold",
        )}
      >
        {cell.date.getDate()}
        <DayDots dots={dots} edge={isEdge} />
      </button>
    </div>
  );
}

export function MonthGrid({
  year,
  month,
  series,
  range,
  todayIso,
  showBookmarkDots,
  onSelectDay,
}: {
  year: number;
  month: number;
  series: CalendarSeriesItem[];
  range: CalendarRangeState;
  todayIso: string;
  showBookmarkDots: boolean;
  onSelectDay: (isoDate: string) => void;
}) {
  const grid = buildMonthGrid(year, month);

  return (
    <div className="px-3 pt-1 pb-2" data-testid="calendar-grid">
      <div className="mb-1 grid grid-cols-7">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="text-ink-3 text-center text-[11px] font-bold uppercase">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map((cell) => (
          <DayCell
            key={cell.isoDate}
            cell={cell}
            dots={getDayDots(series, cell.isoDate, showBookmarkDots)}
            isToday={cell.isoDate === todayIso}
            role={rangeCellRole(cell.isoDate, range)}
            onSelect={onSelectDay}
          />
        ))}
      </div>
      <div className="text-ink-3 flex gap-4 px-1 pt-2.5 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <i className="bg-gold h-1.5 w-1.5 rounded-full" />с вашими закладками
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="bg-ink-2 h-1.5 w-1.5 rounded-full" />
          идёт серия
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="border-live h-2 w-2 rounded-full border bg-transparent" />
          сегодня
        </span>
      </div>
    </div>
  );
}

export function MonthGridSkeleton() {
  return (
    <div className="px-3 pt-1 pb-2" data-testid="calendar-grid-skeleton">
      <div className="mb-1 grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={`wd-${index}`} className="bg-surface-2 mx-auto h-3 w-4 rounded-sm" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: 42 }).map((_, index) => (
          <div key={`day-${index}`} className="bg-surface-2 aspect-square rounded-[12px]" />
        ))}
      </div>
    </div>
  );
}
