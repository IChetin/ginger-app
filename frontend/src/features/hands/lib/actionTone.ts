import type { HandAction, HandActionType } from "@/api/types/hands";
import { cn } from "@/lib/utils";

/** Шкала агрессии: fold → check → call → bet/raise → allin. */
export type ActionTone = "fold" | "check" | "call" | "aggress" | "allin";

export type ActionBadgeVariant = "inline" | "table";

export function actionTone(type: HandActionType): ActionTone {
  if (type === "fold") return "fold";
  if (type === "check") return "check";
  if (type === "call") return "call";
  if (type === "allin") return "allin";
  return "aggress";
}

export function formatActionPhrase(
  action: Pick<HandAction, "action" | "amount">,
  formatAmount: (value: number) => string,
  fallbackAmount = 0,
): string {
  const amount = action.amount ?? fallbackAmount;
  if (action.action === "fold") return "фолд";
  if (action.action === "check") return "чек";
  if (action.action === "call") return `колл ${formatAmount(amount)}`;
  if (action.action === "bet") return `бет ${formatAmount(amount)}`;
  if (action.action === "raise") return `рейз до ${formatAmount(amount)}`;
  return `олл-ин ${formatAmount(amount)}`;
}

export function formatActionShort(type: HandActionType): string {
  if (type === "fold") return "ФОЛД";
  if (type === "check") return "ЧЕК";
  if (type === "call") return "КОЛЛ";
  if (type === "bet") return "БЕТ";
  if (type === "raise") return "РЕЙЗ";
  return "ОЛЛ-ИН";
}

export function lastActionBySeat(actions: HandAction[]): Map<number, HandAction> {
  const last = new Map<number, HandAction>();
  for (const action of actions) last.set(action.seat, action);
  return last;
}

export function lastActionFromStreets(
  streets: { actions: HandAction[] }[],
): Map<number, HandAction> {
  const last = new Map<number, HandAction>();
  for (const street of streets) {
    for (const action of street.actions) last.set(action.seat, action);
  }
  return last;
}

const TONE_CLASS: Record<ActionTone, string> = {
  fold: "bg-transparent text-ink-3",
  check: "bg-transparent text-ink-2",
  call: "bg-live-soft text-action-live",
  aggress: "bg-warn-soft text-action-warn",
  allin: "bg-gold-grad text-ink-ongold font-extrabold shadow-sheen",
};

/** Подложка на сукно стола: soft-цвет поверх --surface, а не прозрачный felt. */
const TABLE_TONE_CLASS: Record<ActionTone, string> = {
  fold: "bg-transparent text-ink-3",
  check: "bg-transparent text-ink-2",
  call: "text-action-live bg-[linear-gradient(var(--live-soft),var(--live-soft)),var(--surface)]",
  aggress:
    "text-action-warn bg-[linear-gradient(var(--warn-soft),var(--warn-soft)),var(--surface)]",
  allin: "bg-gold-grad text-ink-ongold font-extrabold shadow-sheen",
};

export function actionBadgeClass(variant: ActionBadgeVariant, tone: ActionTone): string {
  if (variant === "table") {
    return cn(
      "inline-flex items-center rounded px-1.5 py-px text-[9px] font-extrabold tracking-[0.04em] uppercase",
      TABLE_TONE_CLASS[tone],
    );
  }
  return cn(
    "inline-flex shrink-0 items-center justify-end rounded-[7px] px-1.5 py-0.5 text-right text-[12.5px] font-extrabold",
    TONE_CLASS[tone],
  );
}
