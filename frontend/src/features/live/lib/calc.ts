import type { LiveEventRead } from "@/api/types/live";

export function activeMoneyEvents(events: LiveEventRead[]): LiveEventRead[] {
  return events.filter((item) => item.type === "entry" || item.type === "reentry");
}

export function investedTotal(events: LiveEventRead[]): number {
  return activeMoneyEvents(events).reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

export function entriesCount(events: LiveEventRead[]): number {
  return activeMoneyEvents(events).length;
}

export function sessionProfit(events: LiveEventRead[], payout: number): number {
  return payout - investedTotal(events);
}

export function formatDuration(startedAtIso: string, nowMs = Date.now()): string {
  const started = new Date(startedAtIso).getTime();
  const diffMs = Math.max(0, nowMs - started);
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes} мин`;
  }
  return `${hours} ч ${minutes} мин`;
}

/** Running total after each money event chronologically (asc). */
export function runningInvestedById(events: LiveEventRead[]): Map<string, number> {
  const money = activeMoneyEvents(events).slice().sort((a, b) => {
    const ta = new Date(a.occurred_at).getTime();
    const tb = new Date(b.occurred_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.created_at.localeCompare(b.created_at);
  });
  const map = new Map<string, number>();
  let total = 0;
  for (const item of money) {
    total += Number(item.amount ?? 0);
    map.set(item.id, total);
  }
  return map;
}

export function entryOrdinal(events: LiveEventRead[], eventId: string): number {
  const money = activeMoneyEvents(events).slice().sort((a, b) => {
    const ta = new Date(a.occurred_at).getTime();
    const tb = new Date(b.occurred_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.created_at.localeCompare(b.created_at);
  });
  const index = money.findIndex((item) => item.id === eventId);
  return index >= 0 ? index + 1 : 0;
}
