import { describe, expect, it } from "vitest";

import type { HandBlinds } from "@/api/types/hands";
import {
  EMPTY_BLINDS_MANUAL,
  applyBlindsAutofill,
  blindsFromBb,
} from "@/features/hands/lib/hand-engine";

const START: HandBlinds = { sb: 100, bb: 200, ante: 200, ante_mode: "bb" };

describe("applyBlindsAutofill", () => {
  it("fills SB and ante from BB, and BB and ante from SB", () => {
    const fromBb = applyBlindsAutofill(START, { bb: 200 }, EMPTY_BLINDS_MANUAL);
    expect(fromBb.blinds).toMatchObject({ sb: 100, bb: 200, ante: 200 });
    expect(fromBb.manual).toMatchObject({ sb: false, bb: true, ante: false });

    const fromSb = applyBlindsAutofill(START, { sb: 150 }, EMPTY_BLINDS_MANUAL);
    expect(fromSb.blinds).toMatchObject({ sb: 150, bb: 300, ante: 300 });
    expect(fromSb.manual).toMatchObject({ sb: true, bb: false, ante: false });
  });

  it("fills SB and BB from ante (BB = ante)", () => {
    const next = applyBlindsAutofill(START, { ante: 50 }, EMPTY_BLINDS_MANUAL);
    expect(next.blinds).toMatchObject({ sb: 25, bb: 50, ante: 50 });
    expect(next.manual).toMatchObject({ sb: false, bb: false, ante: true });
  });

  it("keeps the three fields linked after earlier edits", () => {
    let next = applyBlindsAutofill(START, { sb: 80 }, EMPTY_BLINDS_MANUAL);
    expect(next.blinds).toMatchObject({ sb: 80, bb: 160, ante: 160 });

    next = applyBlindsAutofill(next.blinds, { ante: 300 }, next.manual);
    expect(next.blinds).toMatchObject({ sb: 150, bb: 300, ante: 300 });
    expect(next.manual).toMatchObject({ sb: false, bb: false, ante: true });

    next = applyBlindsAutofill(next.blinds, { bb: 400 }, next.manual);
    expect(next.blinds).toMatchObject({ sb: 200, bb: 400, ante: 400 });
    expect(next.manual).toMatchObject({ sb: false, bb: true, ante: false });
  });

  it("keeps ante = BB for occupied ante until ante is edited", () => {
    const occupied: HandBlinds = { ...START, ante_mode: "occupied" };
    const next = applyBlindsAutofill(occupied, { bb: 500 }, EMPTY_BLINDS_MANUAL);
    expect(next.blinds).toMatchObject({ sb: 250, bb: 500, ante: 500, ante_mode: "occupied" });
    expect(next.manual.ante).toBe(false);
  });

  it("does not treat ante-mode toggle as a manual amount edit", () => {
    const next = applyBlindsAutofill(START, { ante_mode: "occupied" }, EMPTY_BLINDS_MANUAL);
    expect(next.blinds).toMatchObject({ sb: 100, bb: 200, ante: 200, ante_mode: "occupied" });
    expect(next.manual).toEqual(EMPTY_BLINDS_MANUAL);
  });

  it("rounds derived blinds to whole chips", () => {
    const odd = applyBlindsAutofill(START, { bb: 201 }, EMPTY_BLINDS_MANUAL);
    expect(odd.blinds.sb).toBe(101);
    expect(odd.blinds.ante).toBe(201);
    expect(Number.isInteger(odd.blinds.sb)).toBe(true);

    const fromSb = applyBlindsAutofill(START, { sb: 75.4 }, EMPTY_BLINDS_MANUAL);
    expect(fromSb.blinds.sb).toBe(75);
    expect(fromSb.blinds.bb).toBe(150);
    expect(fromSb.blinds.ante).toBe(150);

    const fromAnte = applyBlindsAutofill(START, { ante: 75.4 }, EMPTY_BLINDS_MANUAL);
    expect(fromAnte.blinds).toMatchObject({ sb: 38, bb: 75, ante: 75 });
  });
});

describe("blindsFromBb", () => {
  it("uses BB as the default ante for both formats", () => {
    expect(blindsFromBb(200)).toEqual({ sb: 100, ante: 200 });
    expect(blindsFromBb(201)).toEqual({ sb: 101, ante: 201 });
  });
});
