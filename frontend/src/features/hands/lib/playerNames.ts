export const HERO_NAME = "Вы";
export const SEAT_NAME_MAX = 16;
export const NAME_PRIVACY_HINT = "Имена видны всем, у кого есть ссылка";
export const NAME_CHIPS_LIMIT = 6;
export const NAME_HISTORY_LIMIT = 50;
export const SUGGESTED_NAMES_LIMIT = NAME_HISTORY_LIMIT;

const DEFAULT_NAME_RE = /^Игрок \d+$/;

export function defaultOpponentName(seat: number): string {
  return `Игрок ${seat}`;
}

export function isDefaultOpponentName(name: string, seat?: number): boolean {
  const trimmed = name.trim();
  if (seat != null) return trimmed === defaultOpponentName(seat);
  return DEFAULT_NAME_RE.test(trimmed);
}

export function normalizeSeatName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, SEAT_NAME_MAX);
}

export function displaySeatName(seat: number, heroSeat: number, custom?: string | null): string {
  if (seat === heroSeat) return HERO_NAME;
  const normalized = normalizeSeatName(custom ?? "");
  if (!normalized || isDefaultOpponentName(normalized, seat)) return defaultOpponentName(seat);
  return normalized;
}

/** Empty or default → store nothing (caller deletes the key). Hero is never stored. */
export function commitSeatName(raw: string, seat: number, heroSeat: number): string | null {
  if (seat === heroSeat) return null;
  const normalized = normalizeSeatName(raw);
  if (!normalized || isDefaultOpponentName(normalized, seat)) return null;
  return normalized;
}

export function isGenericPlayerName(name: string): boolean {
  const normalized = normalizeSeatName(name);
  return !normalized || normalized === HERO_NAME || isDefaultOpponentName(normalized);
}

export function rankUsedNames(
  entries: ReadonlyArray<{ name: string; at?: number; count?: number }>,
  limit = NAME_HISTORY_LIMIT,
): string[] {
  const counts = new Map<string, { count: number; last: number }>();
  entries.forEach((entry, index) => {
    const name = normalizeSeatName(entry.name);
    if (isGenericPlayerName(name)) return;
    const prev = counts.get(name) ?? { count: 0, last: -1 };
    const last = entry.at ?? index;
    counts.set(name, {
      count: prev.count + (entry.count ?? 1),
      last: Math.max(prev.last, last),
    });
  });
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return b[1].last - a[1].last;
    })
    .slice(0, limit)
    .map(([name]) => name);
}

export function mergeNameSuggestions(
  preferred: string[],
  extra: string[],
  excluded: readonly string[] = [],
): string[] {
  const skipped = new Set(excluded.map((name) => normalizeSeatName(name)));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...preferred, ...extra]) {
    const name = normalizeSeatName(raw);
    if (isGenericPlayerName(name) || seen.has(name) || skipped.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= NAME_HISTORY_LIMIT) break;
  }
  return out;
}

export function filterNameSuggestions(
  suggestions: string[],
  query: string,
  limit = NAME_CHIPS_LIMIT,
): string[] {
  const needle = normalizeSeatName(query).toLowerCase();
  const source =
    !needle || isGenericPlayerName(query)
      ? suggestions
      : suggestions.filter((name) => name.toLowerCase().includes(needle));
  return source.slice(0, limit);
}
