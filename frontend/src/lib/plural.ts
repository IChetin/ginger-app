/** Russian plural helper: one / few / many. */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) {
    return many;
  }
  if (last > 1 && last < 5) {
    return few;
  }
  if (last === 1) {
    return one;
  }
  return many;
}

export function daysWord(count: number): string {
  return pluralRu(count, "день", "дня", "дней");
}

export function tournamentsWord(count: number): string {
  return pluralRu(count, "турнир", "турнира", "турниров");
}

export function entriesWord(count: number): string {
  return pluralRu(count, "вход", "входа", "входов");
}

/**
 * Days until an ISO calendar date (`YYYY-MM-DD`), using UTC midnight for both sides
 * so the result does not depend on the local timezone offset.
 */
export function daysUntil(isoDate: string, todayIso?: string): number | null {
  const target = parseUtcDateOnly(isoDate);
  const today = parseUtcDateOnly(todayIso ?? new Date().toISOString().slice(0, 10));
  const ms = target.getTime() - today.getTime();
  const days = Math.round(ms / 86_400_000);
  return days >= 0 ? days : null;
}

function parseUtcDateOnly(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
