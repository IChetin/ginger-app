import type { PositionName } from "@/api/types/hands";

export type TableSize = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const TABLE_SIZES: TableSize[] = [2, 3, 4, 5, 6, 7, 8, 9];

/** Турнирные столы в шторке настроек. 3–5 вводят как 6-max с пустыми местами. */
export const TABLE_SIZE_CHOICES: TableSize[] = [6, 7, 8, 9];

export const POSITIONS_BY_SIZE: Record<number, readonly PositionName[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "+1", "+2", "MP", "HJ", "CO"],
};

export function isTableSize(value: number): value is TableSize {
  return (TABLE_SIZES as readonly number[]).includes(value);
}

export function allSeats(tableSize: number): number[] {
  return Array.from({ length: tableSize }, (_, index) => index + 1);
}

export function seatRing(tableSize: number, buttonSeat: number): number[] {
  return Array.from(
    { length: tableSize },
    (_, offset) => ((buttonSeat - 1 + offset) % tableSize) + 1,
  );
}

/** Занятые места по часовой от кнопки. Имена позиций берутся от длины этого кольца. */
export function occupiedRing(
  tableSize: number,
  buttonSeat: number,
  occupied: readonly number[],
): number[] {
  const sitting = new Set(occupied);
  return seatRing(tableSize, buttonSeat).filter((seat) => sitting.has(seat));
}

export function assignPositions(
  tableSize: number,
  buttonSeat: number,
  occupied: number[],
): Map<number, PositionName> {
  const ring = occupiedRing(tableSize, buttonSeat, occupied);
  const positions = POSITIONS_BY_SIZE[ring.length] ?? POSITIONS_BY_SIZE[9];
  const result = new Map<number, PositionName>();
  for (const [index, seat] of ring.entries()) {
    result.set(seat, positions[index] ?? "MP");
  }
  return result;
}

/** Подписи стульев от размера стола, не от числа сидящих. Каждое имя один раз. */
export function chairPositions(tableSize: number, buttonSeat: number): Map<number, PositionName> {
  const ring = seatRing(tableSize, buttonSeat);
  const positions = POSITIONS_BY_SIZE[tableSize] ?? POSITIONS_BY_SIZE[9];
  const result = new Map<number, PositionName>();
  for (const [index, seat] of ring.entries()) {
    result.set(seat, positions[index] ?? "MP");
  }
  return result;
}

export function chairPosition(tableSize: number, buttonSeat: number, seat: number): PositionName {
  return chairPositions(tableSize, buttonSeat).get(seat) ?? "MP";
}

/** Какую позицию получит место, если сесть (или уже сидит). */
export function previewPosition(
  tableSize: number,
  buttonSeat: number,
  occupied: readonly number[],
  seat: number,
): PositionName {
  const next = occupied.includes(seat) ? occupied : [...occupied, seat];
  return assignPositions(tableSize, buttonSeat, [...next]).get(seat) ?? "MP";
}

export function positionLabel(position: string, occupiedCount: number): string {
  if (occupiedCount === 2 && position === "BTN") return "BTN/SB";
  return position;
}

/** Подпись в аватаре: только короткие ярлыки, без «BTN/SB». */
export function avatarPositionLabel(position: string, occupiedCount: number): string {
  const label = positionLabel(position, occupiedCount);
  return label === "BTN/SB" ? "BTN" : label;
}

export function blindSeats(
  tableSize: number,
  buttonSeat: number,
  occupied?: readonly number[],
): { sb: number; bb: number } {
  const ring =
    occupied && occupied.length >= 2
      ? occupiedRing(tableSize, buttonSeat, occupied)
      : seatRing(tableSize, buttonSeat);
  if (ring.length === 2) {
    return { sb: ring[0] ?? 1, bb: ring[1] ?? 2 };
  }
  return { sb: ring[1] ?? 2, bb: ring[2] ?? 3 };
}

function sortedUnique(seats: Iterable<number>, tableSize: number): number[] {
  const next = new Set<number>();
  for (const seat of seats) {
    if (seat >= 1 && seat <= tableSize) next.add(seat);
  }
  return [...next].sort((a, b) => a - b);
}

/**
 * Герой и текущий BB среди сидящих; в хедз-апе оба места.
 * Без occupied (визард) — физические блайнды стола.
 */
export function requiredSeats(
  tableSize: number,
  buttonSeat: number,
  heroSeat: number,
  occupied?: readonly number[],
): number[] {
  const sitting = occupied?.filter((seat) => seat >= 1 && seat <= tableSize) ?? [];
  const { sb, bb } = blindSeats(tableSize, buttonSeat, sitting.length >= 2 ? sitting : undefined);
  const seats = [heroSeat, bb];
  const headsUp = sitting.length >= 2 ? sitting.length === 2 : tableSize === 2;
  if (headsUp) seats.push(sb);
  return sortedUnique(seats, tableSize);
}

/** Стартовый состав шага 1: герой, SB и BB (SB потом можно снять). */
export function defaultLineupSeats(
  tableSize: number,
  buttonSeat: number,
  heroSeat: number,
): number[] {
  const { sb, bb } = blindSeats(tableSize, buttonSeat);
  return sortedUnique([heroSeat, sb, bb], tableSize);
}

export function withRequiredOccupied(
  occupied: number[],
  tableSize: number,
  buttonSeat: number,
  heroSeat: number,
): number[] {
  return sortedUnique(
    [...occupied, ...requiredSeats(tableSize, buttonSeat, heroSeat, occupied)],
    tableSize,
  );
}

/** Кто остаётся за столом после смены размера: сидящие, которые ещё помещаются, плюс обязательные. */
export function occupiedAfterResize(
  occupied: number[],
  nextSize: number,
  buttonSeat: number,
  heroSeat: number,
): number[] {
  return withRequiredOccupied(
    occupied.filter((seat) => seat <= nextSize),
    nextSize,
    buttonSeat,
    heroSeat,
  );
}

export function withDefaultLineup(
  occupied: number[],
  tableSize: number,
  buttonSeat: number,
  heroSeat: number,
): number[] {
  return sortedUnique(
    [...occupied, ...defaultLineupSeats(tableSize, buttonSeat, heroSeat)],
    tableSize,
  );
}

export function lineupIsValid(
  occupied: number[],
  tableSize: number,
  buttonSeat: number,
  heroSeat: number,
): boolean {
  if (occupied.length < 2) return false;
  if (!occupied.includes(heroSeat)) return false;
  const { bb } = blindSeats(tableSize, buttonSeat, occupied);
  return occupied.includes(bb);
}

export function requiredSeatHint(
  tableSize: number,
  buttonSeat: number,
  heroSeat: number,
  seat: number,
): string | null {
  if (seat === heroSeat) return "Это ваше место";
  const { bb } = blindSeats(tableSize, buttonSeat);
  if (seat === bb) return "Без большого блайнда раздачи не бывает";
  return null;
}
