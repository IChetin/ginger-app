import { formatChipProfit, formatChips } from "@/features/hands/components/PlayingCard";
import { signPrefix } from "@/lib/money";
import type { ReplayState } from "@/features/hands/lib/hand-engine";
import { formatActionPhrase } from "@/features/hands/lib/actionTone";

export const STACK_DISPLAY_STORAGE_KEY = "day2.stack_display";

export type StackDisplayMode = "chips" | "bb";

const NBSP = "\u00a0";

export function isStackDisplayMode(value: unknown): value is StackDisplayMode {
  return value === "chips" || value === "bb";
}

export function canUseBb(bb: number | null | undefined): boolean {
  return typeof bb === "number" && Number.isFinite(bb) && bb > 0;
}

/** До 10 BB — одна десятая, иначе целое. Чтобы ввод и отображение сходились. */
export function normalizeBbCount(amountBb: number): number {
  const sign = amountBb < 0 ? -1 : 1;
  const abs = Math.abs(amountBb);
  if (abs < 10) {
    const tenths = Math.round(abs * 10);
    if (tenths >= 100) return sign * 10;
    return sign * (tenths / 10);
  }
  return sign * Math.round(abs);
}

export function chipsFromBb(amountBb: number, bb: number): number {
  return Math.round(normalizeBbCount(amountBb) * bb);
}

export function parseAmountInput(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replaceAll("−", "-").replace(",", ".");
  if (!normalized || normalized === "." || normalized === "-" || normalized === "-.") return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function inputToChips(value: string, mode: StackDisplayMode, bb: number): number | null {
  const n = parseAmountInput(value);
  if (n == null) return null;
  if (mode === "bb" && canUseBb(bb)) return chipsFromBb(n, bb);
  return Math.round(n);
}

export function formatBbBody(amountBb: number): string {
  const abs = Math.abs(amountBb);
  if (abs < 10) {
    const tenths = Math.round(abs * 10);
    if (tenths >= 100) {
      return "10";
    }
    const rounded = tenths / 10;
    if (Number.isInteger(rounded)) {
      return String(rounded);
    }
    return rounded.toFixed(1).replace(".", ",");
  }
  return new Intl.NumberFormat("ru-RU").format(Math.round(abs));
}

export function formatBb(amountBb: number): string {
  const sign = amountBb < 0 ? "−" : "";
  return `${sign}${formatBbBody(amountBb)}${NBSP}BB`;
}

export function formatStackAmount(value: number, mode: StackDisplayMode, bb: number): string {
  if (mode !== "bb" || !canUseBb(bb)) {
    return formatChips(value);
  }
  return formatBb(value / bb);
}

export function formatReplayProfit(value: number, mode: StackDisplayMode, bb: number): string {
  if (mode !== "bb" || !canUseBb(bb)) {
    return formatChipProfit(value);
  }
  if (value === 0) return `0${NBSP}BB`;
  return `${signPrefix(value)}${formatBbBody(Math.abs(value) / bb)}${NBSP}BB`;
}

export function potShare(pot: number, winnerCount: number): number {
  if (winnerCount <= 0) return 0;
  return Math.floor(pot / winnerCount);
}

export function displayReplayStack(
  stack: number,
  seat: number,
  winnerSeats: readonly number[],
  pot: number,
  award: boolean,
): number {
  if (!award || winnerSeats.length === 0 || !winnerSeats.includes(seat)) return stack;
  return stack + potShare(pot, winnerSeats.length);
}

/** Значение в поле ввода без суффикса BB. */
export function formatAmountInput(chips: number, mode: StackDisplayMode, bb: number): string {
  if (mode === "bb" && canUseBb(bb)) {
    const amountBb = chips / bb;
    return `${amountBb < 0 ? "-" : ""}${formatBbBody(amountBb)}`;
  }
  return formatChips(chips);
}

export function stackPlaceholder(mode: StackDisplayMode, bb: number): string {
  if (mode === "bb" && canUseBb(bb)) return "100";
  if (!canUseBb(bb)) return "";
  return formatChips(bb * 100);
}

export function formatBlindLevel(sb: number, bb: number, mode: StackDisplayMode): string {
  if (mode !== "bb" || !canUseBb(bb)) {
    return `${formatChips(sb)}/${formatChips(bb)}`;
  }
  return `${formatBbBody(sb / bb)}/${formatBbBody(1)}${NBSP}BB`;
}

/** Full: «0,5/1 BB · анте 1 BB». Compact: «0,5/1 · анте 1». */
export function formatReplayBlindsCaption(level: string, ante: string, compact: boolean): string {
  const line = `${level}${ante}`;
  return compact ? line.replaceAll(`${NBSP}BB`, "") : line;
}

/** Сводка в нижней панели стола: «100 / 200 · анте 200» или «0,5 / 1 BB · анте 1 BB». */
export function formatBlindsSummary(
  blinds: { sb: number; bb: number; ante: number },
  mode: StackDisplayMode,
): string {
  const bb = blinds.bb;
  const unit: StackDisplayMode = mode === "bb" && canUseBb(bb) ? "bb" : "chips";
  const sb = unit === "bb" ? formatBbBody(blinds.sb / bb) : formatChips(blinds.sb);
  const big = formatStackAmount(bb, unit, bb);
  const level = `${sb} / ${big}`;
  if (!blinds.ante) return level;
  return `${level} · анте ${formatStackAmount(blinds.ante, unit, bb)}`;
}

export function replayNextHint(state: ReplayState): string | null {
  if (state.actorSeat == null) return null;
  const nxt = state.seats.find((seat) => seat.seat === state.actorSeat);
  if (!nxt) return null;
  return nxt.isHero ? "ваш ход" : `ход ${nxt.name}`;
}

export function formatReplayLog(
  state: ReplayState,
  formatAmount: (value: number) => string,
): string {
  const action = state.lastAction;
  if (!action) return state.log;
  const actor = state.seats.find((seat) => seat.seat === action.seat);
  if (!actor) return state.log;
  const body = `${actor.name} ${formatActionPhrase(action, formatAmount, actor.committed)}`;
  const next = replayNextHint(state);
  return next ? `${body} · ${next}` : body;
}
