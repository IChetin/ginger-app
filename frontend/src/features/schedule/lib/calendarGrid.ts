export interface CalendarCell {
  date: Date;
  isoDate: string;
  inMonth: boolean;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Month grid with Monday as the first day of the week. */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // JS: 0=Sun..6=Sat → Monday-first index
  const mondayIndex = (firstOfMonth.getDay() + 6) % 7;

  const cells: CalendarCell[] = [];
  for (let offset = 0; offset < mondayIndex; offset += 1) {
    const date = new Date(year, month - 1, 1 - (mondayIndex - offset));
    cells.push({ date, isoDate: toIsoDate(date), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    cells.push({ date, isoDate: toIsoDate(date), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]?.date ?? firstOfMonth;
    const date = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    cells.push({ date, isoDate: toIsoDate(date), inMonth: false });
  }
  return cells;
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function formatMonthTitle(year: number, month: number): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

export const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
