import { describe, expect, it } from "vitest";

import { highlightMatch } from "@/features/search/lib/highlight";

describe("highlightMatch", () => {
  it("wraps case-insensitive substring hits", () => {
    expect(highlightMatch("RPT Калининград", "кали")).toEqual([
      "RPT ",
      { mark: "Кали" },
      "нинград",
    ]);
  });

  it("returns original text when query is empty", () => {
    expect(highlightMatch("Main Event", "")).toEqual(["Main Event"]);
  });
});
