/** Типовой ряд блайндов / денежных сумм: 25, 50, 100 … и дальше по той же сетке. */
const LADDER_HEAD = [
  25, 50, 100, 200, 300, 400, 500, 1_000, 1_500, 2_000, 2_500, 3_000, 4_000, 5_000, 6_000, 8_000,
] as const;

const DECADE = [10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100] as const;

function buildLadder(max = 1_000_000_000_000): number[] {
  const values: number[] = [...LADDER_HEAD];
  for (let mag = 1_000; mag <= max / 10; mag *= 10) {
    for (const factor of DECADE) {
      const next = factor * mag;
      if (next > max) return values;
      if (next > values[values.length - 1]!) values.push(next);
    }
  }
  return values;
}

export const CHIP_LADDER: readonly number[] = buildLadder();

export function parseStepperInt(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replaceAll("−", "-").replace(",", ".");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function clampNumber(value: number, min: number, max?: number): number {
  const lo = Math.max(min, value);
  return max == null ? lo : Math.min(max, lo);
}

export function nextLinear(
  current: number,
  direction: 1 | -1,
  step: number,
  min: number,
  max?: number,
): number {
  if (step <= 0) return clampNumber(current, min, max);
  return clampNumber(current + direction * step, min, max);
}

/** Следующее/предыдущее значение типового ряда. Промежуточные, введённые руками, прыгают на ближайшую ступень. */
export function nextLadder(current: number | null, direction: 1 | -1, min = 0): number {
  const rungs = min <= 0 ? [0, ...CHIP_LADDER] : CHIP_LADDER.filter((value) => value >= min);

  if (current == null) {
    if (direction < 0) return min;
    return rungs.find((value) => value >= min && value > 0) ?? min;
  }

  if (direction < 0) {
    if (current <= min) return current;
    const prev = [...rungs].reverse().find((value) => value < current);
    return prev ?? min;
  }

  if (current < min) return min;
  const next = rungs.find((value) => value > current);
  if (next != null) return next;
  const last = rungs[rungs.length - 1] ?? current;
  return last > current ? last : current;
}

export function canLadderDecrement(current: number | null, min = 0): boolean {
  if (current == null) return false;
  return nextLadder(current, -1, min) !== current;
}

export function canLadderIncrement(current: number | null, min = 0, max?: number): boolean {
  const next = nextLadder(current, 1, min);
  if (current == null) return max == null || next <= max;
  if (next === current) return false;
  return max == null || next <= max;
}

export function stepMoneyString(raw: string, direction: 1 | -1, min = 0): string {
  const parsed = parseStepperInt(raw);
  return String(nextLadder(parsed, direction, min));
}
