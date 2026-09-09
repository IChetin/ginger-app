import { canUseBb, chipsFromBb, type StackDisplayMode } from "@/features/hands/lib/stackDisplay";
import { nextLinear } from "@/lib/numberStep";

function stackBbStep(amountBb: number): number {
  return Math.abs(amountBb) < 10 ? 0.5 : 1;
}

function clampChips(value: number, minChips: number, maxChips?: number): number {
  const lo = Math.max(minChips, value);
  return maxChips == null ? lo : Math.min(maxChips, lo);
}

/** Минимум стартового стека: 0,5 BB в режиме BB, иначе одна фишка. */
export function minStackChips(mode: StackDisplayMode, bb: number): number {
  if (mode === "bb" && canUseBb(bb)) return Math.max(1, chipsFromBb(0.5, bb));
  return 1;
}

/** Стек: в BB шаг 1 (ниже 10 BB — 0,5); в фишках шаг = размер BB. */
export function stepStackChips(
  chips: number | null,
  direction: 1 | -1,
  mode: StackDisplayMode,
  bb: number,
  minChips = 1,
  maxChips?: number,
): number {
  const current = chips ?? 0;
  if (!canUseBb(bb)) return clampChips(current, minChips, maxChips);
  if (mode === "bb") {
    const currentBb = current / bb;
    const nextBb = nextLinear(
      currentBb,
      direction,
      stackBbStep(currentBb),
      minChips / bb,
      maxChips == null ? undefined : maxChips / bb,
    );
    return chipsFromBb(nextBb, bb);
  }
  return Math.round(nextLinear(current, direction, bb, minChips, maxChips));
}

/** Бет/рейз: в фишках шаг = BB, в режиме BB — всегда 1 BB. Пустое поле считается минимумом. */
export function stepBetChips(
  chips: number | null,
  direction: 1 | -1,
  mode: StackDisplayMode,
  bb: number,
  minChips: number,
  maxChips: number,
): number {
  const current = chips ?? minChips;
  if (!canUseBb(bb)) return clampChips(current, minChips, maxChips);
  if (mode === "bb") {
    const nextBb = nextLinear(current / bb, direction, 1, minChips / bb, maxChips / bb);
    return chipsFromBb(nextBb, bb);
  }
  return Math.round(nextLinear(current, direction, bb, minChips, maxChips));
}
