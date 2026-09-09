import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANTE_MODE,
  formatAnteCaption,
  publishedWizardAnteMode,
  resolveAnteMode,
  wizardAnteMode,
} from "@/features/hands/lib/anteMode";

describe("anteMode", () => {
  it("defaults new wizard hands to BB-ante and missing JSON to table", () => {
    expect(DEFAULT_ANTE_MODE).toBe("bb");
    expect(resolveAnteMode({})).toBe("table");
    expect(resolveAnteMode({ ante_mode: "bb" })).toBe("bb");
    expect(resolveAnteMode({ ante_mode: "occupied" })).toBe("occupied");
    expect(wizardAnteMode({})).toBe("bb");
    expect(publishedWizardAnteMode({})).toBe("occupied");
  });

  it("labels BB-ante in the replay header and hides a zero ante", () => {
    expect(formatAnteCaption({ ante: 0, ante_mode: "bb" }, (value) => String(value))).toBe("");
    expect(formatAnteCaption({ ante: 2000, ante_mode: "bb" }, (value) => String(value))).toBe(
      " · BB-анте 2000",
    );
    expect(formatAnteCaption({ ante: 2000, ante_mode: "occupied" }, (value) => String(value))).toBe(
      " · анте 2000",
    );
  });
});
