import { describe, expect, it } from "vitest";

import {
  filterLevelsBySet,
  normalizeStructureSetLabel,
  structureSetLabels,
} from "@/features/schedule/lib/structureSets";

describe("structureSets", () => {
  it("normalizes empty labels to default", () => {
    expect(normalizeStructureSetLabel(undefined)).toBe("default");
    expect(normalizeStructureSetLabel("")).toBe("default");
    expect(normalizeStructureSetLabel("  turbo  ")).toBe("turbo");
  });

  it("collects unique labels in order and filters by set", () => {
    const levels = [
      { level_no: 1, structure_set_label: "default" },
      { level_no: 1, structure_set_label: "turbo" },
      { level_no: 2, structure_set_label: "default" },
      { level_no: 2, structure_set_label: "turbo" },
    ];
    expect(structureSetLabels(levels)).toEqual(["default", "turbo"]);
    expect(filterLevelsBySet(levels, "turbo").map((row) => row.level_no)).toEqual([1, 2]);
  });
});
