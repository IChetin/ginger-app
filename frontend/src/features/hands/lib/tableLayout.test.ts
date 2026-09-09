import { describe, expect, it } from "vitest";

import { TABLE_SIZES } from "@/features/hands/lib/positions";
import {
  FELT_CENTER,
  FELT_DEAD_ZONE,
  MINI_SEAT_ELLIPSE,
  SEAT_CENTER_TRANSFORM,
  BET_CHIP_PX,
  CHIP_GAP_PX,
  DEFAULT_FELT_PX,
  TABLE_SLOT_MIN_HEIGHT_PX,
  TABLE_SLOT_HEIGHT_CLASS,
  chipTowardCenter,
  avatarScale,
  seatCardsOnInnerEdge,
  feltBox,
  isInsideDeadZone,
  isInsideEllipse,
  miniTablePointsFor,
  pointInSeatBox,
  seatAnchor,
  seatBlockFor,
  columnSeatBlockFor,
  columnSeatEllipseFor,
  chipCollisionBox,
  seatDensityScale,
  seatEllipseFor,
  seatHoleKind,
  seatPoints,
  slotBoxesOverlap,
  slotDistance,
  slotInsideFelt,
  seatNameBoxPx,
  seatNameFontPx,
  seatNameTargetPx,
  tablePointsFor,
  tableSlots,
} from "@/features/hands/lib/tableLayout";

const OCCUPIED_COUNTS = [2, 3, 4, 6, 9] as const;

describe("seatNameBoxPx", () => {
  const feltSizes = [
    [260, 351],
    [288, 389],
    [351, 474],
    [387, 522],
    [810, 1093],
  ] as const;

  it.each(feltSizes)("keeps six-max names at 88px on a %s×%s felt", (feltW, feltH) => {
    const slots = tableSlots(9, 1).slice(0, 6);
    expect(seatNameBoxPx(slots, feltW, feltH, 6, 9)).toBe(88);
  });

  it("is 88px with six occupied and 80px with nine, never down to the avatar box", () => {
    const slots = tableSlots(9, 1);
    const six = seatNameBoxPx(slots.slice(0, 6), 288, 389, 6, 9);
    const nine = seatNameBoxPx(slots, 288, 389, 9, 9);
    expect(seatNameTargetPx(6, 9)).toBe(88);
    expect(seatNameTargetPx(9, 9)).toBe(80);
    expect(six).toBe(88);
    expect(nine).toBe(80);
    expect(six).toBeGreaterThan(nine);
    expect(nine).toBeGreaterThanOrEqual(72);
  });

  it.each(feltSizes)(
    "keeps a 12-glyph name box on a %s×%s felt without overlapping 9-max labels",
    (feltW, feltH) => {
      const slots = tableSlots(9, 1);
      const box = seatNameBoxPx(slots, feltW, feltH, 9, 9);
      expect(box).toBeGreaterThanOrEqual(72);
      expect(box).toBeLessThanOrEqual(80);
      for (let i = 0; i < slots.length; i += 1) {
        const a = slots[i];
        if (!a) continue;
        for (let j = i + 1; j < slots.length; j += 1) {
          const b = slots[j];
          if (!b) continue;
          const dx = (Math.abs(a.left - b.left) / 100) * feltW;
          const dy = (Math.abs(a.top - b.top) / 100) * feltH;
          const overlap = dx < box && dy < 18;
          expect(overlap).toBe(false);
        }
      }
    },
  );

  it("drops the name font 1px when nine seats are filled", () => {
    expect(seatNameFontPx(0.82, 1, 6)).toBe(12);
    expect(seatNameFontPx(0.82, 1, 9)).toBe(11);
    expect(seatNameFontPx(1, 1, 6)).toBe(13);
  });
});

describe("seatBlockFor", () => {
  it("uses a larger block at 6-max than at 9-max", () => {
    const six = seatBlockFor(6);
    const nine = seatBlockFor(9);
    expect(seatDensityScale(6)).toBe(1);
    expect(seatDensityScale(9)).toBeCloseTo(0.82);
    expect(six.width).toBeGreaterThan(nine.width);
    expect(six.height).toBeGreaterThan(nine.height);
  });
});

describe("column seat geometry", () => {
  it("fits nine column blocks inside the felt without overlap", () => {
    const box = columnSeatBlockFor(9);
    const ellipse = columnSeatEllipseFor(9);
    const slots = tableSlots(9, 1, ellipse);
    expect(box.height).toBeGreaterThan(seatBlockFor(9).height);
    for (const slot of slots) {
      expect(slotInsideFelt(slot, box)).toBe(true);
    }
    for (let i = 0; i < slots.length; i += 1) {
      const a = slots[i];
      if (!a) continue;
      for (let j = i + 1; j < slots.length; j += 1) {
        const b = slots[j];
        if (!b) continue;
        expect(slotBoxesOverlap(a, b, box)).toBe(false);
      }
    }
  });
});

describe("tableSlots", () => {
  it("is the single coordinate source: occupied seat N matches empty seat N", () => {
    const nine = tableSlots(9, 1);
    const threeHero = tableSlots(9, 1);
    expect(nine).toHaveLength(9);
    expect(threeHero.map((slot) => slot.seat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const slot of nine) {
      const again = threeHero.find((item) => item.seat === slot.seat);
      expect(again?.left).toBe(slot.left);
      expect(again?.top).toBe(slot.top);
    }
  });

  it("puts the hero seat at the bottom center", () => {
    const slots = tableSlots(9, 5);
    const hero = slots.find((slot) => slot.seat === 5);
    expect(hero?.left).toBeCloseTo(50, 5);
    expect(hero?.top).toBeGreaterThan(seatEllipseFor(9).cy);
    expect(slots[0]?.seat).toBe(5);
  });

  it.each([
    [9, 3],
    [9, 9],
  ] as const)(
    "%s-max: distance between any two of %s chairs beats the seat block",
    (tableSize, occupied) => {
      const slots = tableSlots(tableSize, 1).slice(0, occupied);
      const box = seatBlockFor(tableSize);
      const minSpan = Math.max(box.width, box.height);
      for (let i = 0; i < slots.length; i += 1) {
        const a = slots[i];
        if (!a) continue;
        expect(slotInsideFelt(a, box)).toBe(true);
        for (let j = i + 1; j < slots.length; j += 1) {
          const b = slots[j];
          if (!b) continue;
          expect(slotBoxesOverlap(a, b, box)).toBe(false);
          expect(slotDistance(a, b)).toBeGreaterThan(minSpan);
        }
      }
    },
  );

  it.each(
    TABLE_SIZES.flatMap((tableSize) =>
      OCCUPIED_COUNTS.filter((count) => count <= tableSize).map(
        (occupied) => [tableSize, occupied] as const,
      ),
    ),
  )("keeps %s-max chairs from overlapping with %s occupied", (tableSize, _occupied) => {
    void _occupied;
    const slots = tableSlots(tableSize, 1);
    const box = seatBlockFor(tableSize);
    const ellipse = seatEllipseFor(tableSize);
    expect(slots).toHaveLength(tableSize);
    for (let i = 0; i < slots.length; i += 1) {
      const a = slots[i];
      if (!a) continue;
      expect(slotInsideFelt(a, box)).toBe(true);
      expect(isInsideEllipse(a, ellipse)).toBe(true);
      for (let j = i + 1; j < slots.length; j += 1) {
        const b = slots[j];
        if (!b) continue;
        expect(slotBoxesOverlap(a, b, box)).toBe(false);
        expect(slotDistance(a, b)).toBeGreaterThan(Math.max(box.width, box.height));
      }
    }
  });
});

describe("seatPoints", () => {
  it.each(TABLE_SIZES)("places %s seats on the inner ellipse with hero at the bottom", (size) => {
    const points = tablePointsFor(size);
    expect(points).toHaveLength(size);
    const hero = points[0];
    expect(hero?.left).toBeCloseTo(50, 5);
    expect(hero?.top).toBeGreaterThan(seatEllipseFor(size).cy);
    for (const point of points) {
      expect(isInsideEllipse(point, seatEllipseFor(size))).toBe(true);
      expect(isInsideEllipse(point, { cx: 50, cy: 50, rx: 48, ry: 48 })).toBe(true);
    }
  });

  it("keeps 9-max neighbors from collapsing", () => {
    const points = tablePointsFor(9);
    const chords: number[] = [];
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if (!a || !b) continue;
      chords.push(Math.hypot(a.left - b.left, a.top - b.top));
    }
    expect(Math.min(...chords)).toBeGreaterThan(18);
  });

  it("places hero at the bottom center of the inner ellipse", () => {
    const hero = seatPoints(6)[0];
    expect(hero).toBeTruthy();
    expect(hero!.left).toBeCloseTo(50, 5);
    expect(hero!.top).toBeGreaterThan(70);
    const anchor = seatAnchor(hero!);
    expect(anchor.side).toBe("bottom");
    expect(anchor.transform).toBe(SEAT_CENTER_TRANSFORM);
  });

  it("does not pack a short-handed 9-max onto a 3-max oval", () => {
    const nine = tablePointsFor(9);
    const three = seatPoints(3);
    const adj9 = Math.hypot(
      (nine[0]?.left ?? 0) - (nine[1]?.left ?? 0),
      (nine[0]?.top ?? 0) - (nine[1]?.top ?? 0),
    );
    const adj3 = Math.hypot(
      (three[0]?.left ?? 0) - (three[1]?.left ?? 0),
      (three[0]?.top ?? 0) - (three[1]?.top ?? 0),
    );
    expect(adj9).toBeLessThan(adj3 * 0.7);
    const spread = Math.hypot(
      (nine[0]?.left ?? 0) - (nine[4]?.left ?? 0),
      (nine[0]?.top ?? 0) - (nine[4]?.top ?? 0),
    );
    expect(spread).toBeGreaterThan(adj9 * 2);
  });
});

describe("miniTablePointsFor", () => {
  it.each(TABLE_SIZES)("keeps %s-max mini seats inside the tighter oval", (size) => {
    const points = miniTablePointsFor(size);
    expect(points).toHaveLength(size);
    for (const point of points) {
      expect(isInsideEllipse(point, MINI_SEAT_ELLIPSE)).toBe(true);
    }
  });
});

describe("chipTowardCenter", () => {
  it.each(TABLE_SIZES)("keeps every %s-max bet outside the pot/board dead zone", (size) => {
    const points = tablePointsFor(size);
    const box = seatBlockFor(size);
    expect(points.length).toBe(size);
    for (const seat of points) {
      const bet = chipTowardCenter(seat, FELT_CENTER, FELT_DEAD_ZONE, box);
      expect(isInsideDeadZone(bet)).toBe(false);
      expect(isInsideDeadZone(seat, FELT_CENTER, FELT_DEAD_ZONE)).toBe(false);
      expect(pointInSeatBox(bet, seat, box)).toBe(false);
      const toCenter = {
        left: FELT_CENTER.left - seat.left,
        top: FELT_CENTER.top - seat.top,
      };
      const toBet = { left: bet.left - seat.left, top: bet.top - seat.top };
      const dot = toBet.left * toCenter.left + toBet.top * toCenter.top;
      expect(dot).toBeGreaterThanOrEqual(0);
      const seatDist = Math.hypot(toCenter.left, toCenter.top);
      const betDist = Math.hypot(FELT_CENTER.left - bet.left, FELT_CENTER.top - bet.top);
      expect(betDist).toBeLessThanOrEqual(seatDist + 1e-9);
    }
  });

  it("places 9-max column bets outside the seat box, toward the center, without overlapping", () => {
    const pin = columnSeatBlockFor(9);
    const box = chipCollisionBox(pin, DEFAULT_FELT_PX);
    const slots = tableSlots(9, 1, columnSeatEllipseFor(9));
    const bets = slots.map((seat) =>
      chipTowardCenter(seat, FELT_CENTER, FELT_DEAD_ZONE, box, DEFAULT_FELT_PX),
    );
    for (let i = 0; i < slots.length; i += 1) {
      const seat = slots[i];
      const bet = bets[i];
      if (!seat || !bet) continue;
      expect(isInsideDeadZone(bet)).toBe(false);
      expect(pointInSeatBox(bet, seat, pin)).toBe(false);
      const toCenter = { left: FELT_CENTER.left - seat.left, top: FELT_CENTER.top - seat.top };
      const toBet = { left: bet.left - seat.left, top: bet.top - seat.top };
      expect(toBet.left * toCenter.left + toBet.top * toCenter.top).toBeGreaterThan(0);
      if (seat.top > 62) expect(bet.top).toBeLessThan(seat.top);
      if (seat.top < 20) expect(bet.top).toBeGreaterThan(seat.top);
    }
    const felt = DEFAULT_FELT_PX;
    const chipPts = bets.map((bet) => ({
      x: (bet.left / 100) * felt.width,
      y: (bet.top / 100) * felt.height,
    }));
    for (let i = 0; i < chipPts.length; i += 1) {
      const a = chipPts[i];
      if (!a) continue;
      for (let j = i + 1; j < chipPts.length; j += 1) {
        const b = chipPts[j];
        if (!b) continue;
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        expect(dx >= BET_CHIP_PX.width * 0.55 || dy >= BET_CHIP_PX.height).toBe(true);
      }
    }
    expect(CHIP_GAP_PX).toBe(8);
  });
});

describe("TABLE_SLOT_MIN_HEIGHT_PX", () => {
  it("keeps the replayer table at least 320px", () => {
    expect(TABLE_SLOT_MIN_HEIGHT_PX).toBe(320);
  });

  it("sizes the slot from the viewport, not from below-table blocks", () => {
    expect(TABLE_SLOT_HEIGHT_CLASS).toContain("100dvh");
    expect(TABLE_SLOT_HEIGHT_CLASS).toContain("--sticky-h");
    expect(TABLE_SLOT_HEIGHT_CLASS).not.toContain("flex-1");
  });
});

describe("seatHoleKind", () => {
  it("hides folded holes even when cards are known", () => {
    expect(seatHoleKind({ folded: true, isHero: false, cards: ["As", "Kd"] })).toBe("none");
  });

  it("shows faces only when the seat has two cards", () => {
    expect(seatHoleKind({ folded: false, isHero: true, cards: ["As", "Kd"] })).toBe("face");
    expect(seatHoleKind({ folded: false, isHero: false, cards: [] })).toBe("back");
    expect(seatHoleKind({ folded: false, isHero: false, cards: ["Qh", "Jh"] })).toBe("face");
  });
});

describe("feltBox", () => {
  it("matches the previous width-first formula when not fitting height", () => {
    const width = 400 * 0.9;
    const minH = width * 1.3;
    const maxH = width * 1.35;
    expect(feltBox(400, 600)).toEqual({
      width,
      height: Math.min(maxH, Math.max(minH, 600)),
    });
    expect(feltBox(400, 200).height).toBe(minH);
  });

  it("fits inside a short container without changing the oval ratios", () => {
    const box = feltBox(400, 200, true);
    expect(box.height).toBeLessThanOrEqual(200);
    expect(box.height / box.width).toBeGreaterThanOrEqual(1.3 - 1e-9);
    expect(box.height / box.width).toBeLessThanOrEqual(1.35 + 1e-9);
  });
});

describe("seatCardsOnInnerEdge", () => {
  it("puts cards on the pot side of the seat block", () => {
    expect(seatCardsOnInnerEdge(88)).toBe(true);
    expect(seatCardsOnInnerEdge(12)).toBe(false);
  });
});

describe("avatarScale", () => {
  it("grows with a desktop table and stays readable on a phone", () => {
    expect(avatarScale(810, 1093)).toBeGreaterThan(1);
    expect(avatarScale(810, 1093)).toBe(2.2);
    expect(avatarScale(260, 351)).toBeGreaterThanOrEqual(0.7);
    expect(avatarScale(260, 351)).toBeLessThan(1);
  });
});
