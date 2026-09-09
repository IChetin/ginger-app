import { isTableSize, seatRing } from "@/features/hands/lib/positions";

export interface TablePoint {
  left: number;
  top: number;
}

/** height / width of the felt. Poker oval, not a 3:4 capsule. */
export const TABLE_HEIGHT_RATIO = 1.35;
/** Floor used when the slot is taller than the oval. */
export const TABLE_MIN_HEIGHT_RATIO = 1.3;
/** Felt width as a fraction of the replayer slot. */
export const TABLE_WIDTH_FRACTION = 0.9;
/** Replayer table slot: never shrink below this, even on short phones. */
export const TABLE_SLOT_MIN_HEIGHT_PX = 320;
/**
 * Высота слота стола в реплеере: только шапка + навигация, без блоков под столом.
 * Одинакова на всех шагах; если итог/комбинации не влезают — скроллится страница.
 */
export const TABLE_SLOT_HEIGHT_CLASS =
  "h-[max(320px,calc(100dvh-var(--sticky-h,3.25rem)-5.75rem-8rem))]";

export function feltBox(
  containerWidth: number,
  containerHeight: number,
  fitHeight = false,
): { width: number; height: number } {
  const width = containerWidth * TABLE_WIDTH_FRACTION;
  const minH = width * TABLE_MIN_HEIGHT_RATIO;
  const maxH = width * TABLE_HEIGHT_RATIO;
  if (!fitHeight) {
    return { width, height: Math.min(maxH, Math.max(minH, containerHeight)) };
  }
  const fitted = Math.min(width, containerHeight / TABLE_MIN_HEIGHT_RATIO);
  return {
    width: fitted,
    height: Math.min(
      fitted * TABLE_HEIGHT_RATIO,
      Math.max(fitted * TABLE_MIN_HEIGHT_RATIO, containerHeight),
    ),
  };
}

/** Racetrack radii: enough straight side to read as a poker table, not a pill. */
export const TABLE_BORDER_RADIUS = "28% / 14%";

/** Pot + board live here. Bets must stay outside this ellipse (% of table). */
export const FELT_CENTER: TablePoint = { left: 50, top: 38 };
export const FELT_DEAD_ZONE = { rx: 24, ry: 15 };
export const FELT_LOGO_TOP = 62;

/**
 * Seat block in % of the felt, centered on the pin.
 * Occupied and empty seats share this box so they cannot occupy two geometries.
 * 6-max and fewer use the larger box; 9-max shrinks so nine occupied chairs fit.
 */
export const SEAT_BLOCK = { width: 15.5, height: 20 };
export const SEAT_BLOCK_HALF = { rx: SEAT_BLOCK.width / 2, ry: SEAT_BLOCK.height / 2 };
export const FELT_SEAT_RIM = { cx: 50, cy: 50, rx: 49, ry: 49 };

/** 1 at ≤6-max, down to 0.82 at 9-max — avatars/cards follow this. */
export function seatDensityScale(tableSize: number): number {
  const n = tableCount(tableSize);
  if (n <= 6) return 1;
  return Math.max(0.82, 1 - (n - 6) * 0.06);
}

export function seatBlockFor(tableSize: number): { width: number; height: number } {
  const t = (seatDensityScale(tableSize) - 0.82) / 0.18;
  return {
    width: 13.8 + 1.7 * t,
    height: 18.5 + 1.5 * t,
  };
}

/** Выше обычного блока: карты + аватар + имя + стек в одной колонке. */
export function columnSeatBlockFor(tableSize: number): { width: number; height: number } {
  const t = (seatDensityScale(tableSize) - 0.82) / 0.18;
  return {
    width: 13.6 + 1.6 * t,
    height: 19.6 + 1.4 * t,
  };
}

export function columnSeatEllipseFor(tableSize: number): {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
} {
  const block = columnSeatBlockFor(tableSize);
  return {
    cx: FELT_SEAT_RIM.cx,
    cy: FELT_SEAT_RIM.cy,
    rx: FELT_SEAT_RIM.rx - block.width / 2,
    ry: FELT_SEAT_RIM.ry - block.height / 2,
  };
}

/** 12–14 glyphs at the table name font — not the avatar box (~40px). */
export const SEAT_NAME_TARGET_PX = 88;
export const SEAT_NAME_PACKED_PX = 80;
export const SEAT_NAME_MIN_PX = 72;
/** Name line only; used to see if neighbouring labels would collide. */
const SEAT_NAME_LINE_H = 18;

export function seatNameTargetPx(occupiedCount: number, tableSize = 9): number {
  if (occupiedCount >= 9) return SEAT_NAME_PACKED_PX;
  if (tableSize <= 6 || occupiedCount <= 6) return SEAT_NAME_TARGET_PX;
  return SEAT_NAME_PACKED_PX;
}

export function seatNameFontPx(density: number, scale: number, occupiedCount: number): number {
  const raw = Math.round(13 * density * scale);
  if (occupiedCount >= 9) return Math.max(11, raw - 1);
  return Math.max(12, raw);
}

/**
 * Width of the name label, independent of the avatar/pin box.
 * Shrinks toward SEAT_NAME_MIN_PX only when occupied neighbours would overlap.
 */
export function seatNameBoxPx(
  occupiedSlots: readonly TablePoint[],
  feltWidthPx: number,
  feltHeightPx: number,
  occupiedCount: number,
  tableSize = 9,
): number {
  const target = seatNameTargetPx(occupiedCount, tableSize);
  if (occupiedCount < 9) return target;
  let cap = target;
  for (let i = 0; i < occupiedSlots.length; i += 1) {
    const a = occupiedSlots[i];
    if (!a) continue;
    for (let j = i + 1; j < occupiedSlots.length; j += 1) {
      const b = occupiedSlots[j];
      if (!b) continue;
      const dx = (Math.abs(a.left - b.left) / 100) * feltWidthPx;
      const dy = (Math.abs(a.top - b.top) / 100) * feltHeightPx;
      if (dy < SEAT_NAME_LINE_H) cap = Math.min(cap, dx - 2);
    }
  }
  return Math.max(SEAT_NAME_MIN_PX, Math.min(target, Math.round(cap)));
}

export function seatEllipseFor(tableSize: number): {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
} {
  const block = seatBlockFor(tableSize);
  return {
    cx: FELT_SEAT_RIM.cx,
    cy: FELT_SEAT_RIM.cy,
    rx: FELT_SEAT_RIM.rx - block.width / 2,
    ry: FELT_SEAT_RIM.ry - block.height / 2,
  };
}

export const SEAT_ELLIPSE = {
  cx: FELT_SEAT_RIM.cx,
  cy: FELT_SEAT_RIM.cy,
  rx: FELT_SEAT_RIM.rx - SEAT_BLOCK_HALF.rx,
  ry: FELT_SEAT_RIM.ry - SEAT_BLOCK_HALF.ry,
};
/** Mini picker: slightly tighter so 32px chips stay inside the rim. */
export const MINI_SEAT_ELLIPSE = { cx: 50, cy: 50, rx: 34, ry: 29 };

/** Pin is the center of the seat block — one transform for occupied and empty. */
export const SEAT_CENTER_TRANSFORM = "translate(-50%, -50%)";

export type SeatHoleKind = "none" | "face" | "back";

export interface SeatAnchor {
  transform: string;
  side: "bottom" | "top" | "left" | "right";
}

export interface TableSlot {
  seat: number;
  left: number;
  top: number;
}

function tableCount(size: number): number {
  return isTableSize(size) ? size : 9;
}

/**
 * Seat i=0 is the hero at the bottom of the oval:
 *   angle = 90° + (360° / n) * i
 *   x = cx + rx * cos(angle)
 *   y = cy + ry * sin(angle)
 * which is equivalent to the sin/cos form below.
 */
export function seatPoints(
  count: number,
  ellipse: { cx: number; cy: number; rx: number; ry: number } = SEAT_ELLIPSE,
): TablePoint[] {
  const n = count < 2 ? 2 : count;
  const { cx, cy, rx, ry } = ellipse;
  return Array.from({ length: n }, (_, index) => {
    const angle = (2 * Math.PI * index) / n;
    return {
      left: cx - rx * Math.sin(angle),
      top: cy + ry * Math.cos(angle),
    };
  });
}

export function tablePointsFor(size: number): TablePoint[] {
  return seatPoints(tableCount(size), seatEllipseFor(size));
}

export function miniTablePointsFor(size: number): TablePoint[] {
  return seatPoints(tableCount(size), MINI_SEAT_ELLIPSE);
}

/**
 * One slot per physical chair. Occupied and empty seats use the same pin.
 * `heroSeat` is rotated to the bottom of the oval (index 0).
 */
export function tableSlots(
  tableSize: number,
  heroSeat: number,
  ellipse?: { cx: number; cy: number; rx: number; ry: number },
): TableSlot[] {
  const n = tableCount(tableSize);
  const ring = seatRing(n, heroSeat);
  const points = seatPoints(n, ellipse ?? seatEllipseFor(tableSize));
  return ring.map((seat, index) => {
    const point = points[index] ?? { left: 50, top: 50 };
    return { seat, left: point.left, top: point.top };
  });
}

export function seatAnchor(point: TablePoint): SeatAnchor {
  const transform = SEAT_CENTER_TRANSFORM;
  if (point.top >= 62) return { transform, side: "bottom" };
  if (point.top <= 38) return { transform, side: "top" };
  if (point.left < 50) return { transform, side: "left" };
  return { transform, side: "right" };
}

function ellipseNorm(point: TablePoint, center: TablePoint, rx: number, ry: number): number {
  const nx = (point.left - center.left) / rx;
  const ny = (point.top - center.top) / ry;
  return Math.hypot(nx, ny);
}

export function isInsideDeadZone(
  point: TablePoint,
  center: TablePoint = FELT_CENTER,
  zone: { rx: number; ry: number } = FELT_DEAD_ZONE,
): boolean {
  return ellipseNorm(point, center, zone.rx, zone.ry) < 1;
}

export function isInsideEllipse(
  point: TablePoint,
  ellipse: { cx: number; cy: number; rx: number; ry: number },
): boolean {
  return (
    ellipseNorm(point, { left: ellipse.cx, top: ellipse.cy }, ellipse.rx, ellipse.ry) <= 1 + 1e-9
  );
}

export function slotBoxesOverlap(
  a: TablePoint,
  b: TablePoint,
  box: { width: number; height: number } = SEAT_BLOCK,
): boolean {
  return Math.abs(a.left - b.left) < box.width && Math.abs(a.top - b.top) < box.height;
}

/** Aspect-corrected distance in table-% (y scaled by felt ratio). */
export function slotDistance(a: TablePoint, b: TablePoint): number {
  return Math.hypot(a.left - b.left, (a.top - b.top) * TABLE_HEIGHT_RATIO);
}

export function slotInsideFelt(
  pin: TablePoint,
  box: { width: number; height: number } = SEAT_BLOCK,
): boolean {
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  if (pin.left - halfW < -1e-6 || pin.left + halfW > 100 + 1e-6) return false;
  if (pin.top - halfH < -1e-6 || pin.top + halfH > 100 + 1e-6) return false;
  return isInsideEllipse(pin, FELT_SEAT_RIM);
}

export function pointInSeatBox(
  point: TablePoint,
  pin: TablePoint,
  box: { width: number; height: number } = SEAT_BLOCK,
): boolean {
  return (
    Math.abs(point.left - pin.left) < box.width / 2 &&
    Math.abs(point.top - pin.top) < box.height / 2
  );
}

/** Inner edge of the seat box along the pin→target ray. */
export function boxInnerEdge(
  pin: TablePoint,
  toward: TablePoint,
  box: { width: number; height: number } = SEAT_BLOCK,
): TablePoint {
  const vx = toward.left - pin.left;
  const vy = toward.top - pin.top;
  if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) return { ...pin };
  const hx = box.width / 2;
  const hy = box.height / 2;
  const tx = vx === 0 ? Number.POSITIVE_INFINITY : hx / Math.abs(vx);
  const ty = vy === 0 ? Number.POSITIVE_INFINITY : hy / Math.abs(vy);
  const t = Math.min(tx, ty);
  return { left: pin.left + vx * t, top: pin.top + vy * t };
}

/** Зазор между краем блока игрока и краем фишки ставки. */
export const CHIP_GAP_PX = 8;
/** Габарит пилюли ставки (`px-2` + точка + сумма / «ОЛЛ-ИН»). */
export const BET_CHIP_PX = { width: 72, height: 18 };
export const DEFAULT_FELT_PX = { width: 288, height: 389 };
/** Вылет колонки (карты+аватар+имя+стек) за пин — бокс фишки, места не двигаем. */
export const CHIP_BLOCK_OVERFLOW_PX = 56;

/** Бокс столкновения фишки: не уже имени, чуть выше пина из‑за вылета колонки. */
export function chipCollisionBox(
  pin: { width: number; height: number },
  feltPx: { width: number; height: number } = DEFAULT_FELT_PX,
  nameBoxPx = SEAT_NAME_PACKED_PX,
): { width: number; height: number } {
  return {
    width: Math.max(pin.width, (nameBoxPx / feltPx.width) * 100),
    height: pin.height + (CHIP_BLOCK_OVERFLOW_PX / feltPx.height) * 100,
  };
}

/**
 * Фишка на луче от центра блока к центру стола.
 * Смещение = первое разведение AABB блока и пилюли по лучу + зазор 8px.
 * Если точка попадает в мёртвую зону банка/борда — прижимается к её ободу.
 */
export function chipTowardCenter(
  seat: TablePoint,
  center: TablePoint = FELT_CENTER,
  zone: { rx: number; ry: number } = FELT_DEAD_ZONE,
  box: { width: number; height: number } = SEAT_BLOCK,
  feltPx: { width: number; height: number } = DEFAULT_FELT_PX,
): TablePoint {
  const sx = (seat.left / 100) * feltPx.width;
  const sy = (seat.top / 100) * feltPx.height;
  const cx = (center.left / 100) * feltPx.width;
  const cy = (center.top / 100) * feltPx.height;
  const vx = cx - sx;
  const vy = cy - sy;
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) return { ...seat };
  const ux = vx / len;
  const uy = vy / len;
  const halfW = ((box.width / 100) * feltPx.width) / 2;
  const halfH = ((box.height / 100) * feltPx.height) / 2;
  const expandW = halfW + BET_CHIP_PX.width / 2;
  const expandH = halfH + BET_CHIP_PX.height / 2;
  const tx = Math.abs(ux) < 1e-9 ? Number.POSITIVE_INFINITY : expandW / Math.abs(ux);
  const ty = Math.abs(uy) < 1e-9 ? Number.POSITIVE_INFINITY : expandH / Math.abs(uy);
  const offset = Math.min(tx, ty) + CHIP_GAP_PX;
  const x = sx + ux * offset;
  const y = sy + uy * offset;
  const point: TablePoint = {
    left: (x / feltPx.width) * 100,
    top: (y / feltPx.height) * 100,
  };
  if (!isInsideDeadZone(point, center, zone)) return point;
  const n = ellipseNorm(point, center, zone.rx, zone.ry);
  if (n < 1e-9) return point;
  const k = 1 / n + 1e-4;
  return {
    left: center.left + (point.left - center.left) * k,
    top: center.top + (point.top - center.top) * k,
  };
}

/** Растёт вместе со столом: на 900px сукне ≈2.2×, на телефоне не ниже 0.7. */
export function avatarScale(tableWidthPx: number, tableHeightPx: number): number {
  const raw = Math.min(tableWidthPx / 300, tableHeightPx / 400);
  return Math.min(2.2, Math.max(0.7, raw));
}

export function seatHoleKind(seat: {
  folded: boolean;
  isHero: boolean;
  cards: string[];
}): SeatHoleKind {
  if (seat.folded) return "none";
  if (seat.cards.length === 2) return "face";
  return "back";
}

/** Нижняя половина стола: карты в начале блока (ближе к центру). Верхняя — в конце. */
export function seatCardsOnInnerEdge(topPercent: number): boolean {
  return topPercent >= 50;
}
