import { describe, expect, it } from "vitest";

import {
  eventPath,
  eventPublicKey,
  seriesPath,
  seriesSchedulePath,
} from "@/lib/paths";

describe("paths", () => {
  it("builds series path without day", () => {
    expect(seriesPath({ slug: "rpt-sochi-2026-08" })).toBe("/series/rpt-sochi-2026-08");
  });

  it("builds series path with day query", () => {
    expect(seriesPath({ slug: "rpt-sochi-2026-08" }, { day: "2026-08-02" })).toBe(
      "/series/rpt-sochi-2026-08?day=2026-08-02",
    );
  });

  it("omits empty day query", () => {
    expect(seriesPath({ slug: "rpt-sochi-2026-08" }, { day: null })).toBe(
      "/series/rpt-sochi-2026-08",
    );
  });

  it("builds schedule path", () => {
    expect(seriesSchedulePath({ slug: "rpt-sochi-2026-08" })).toBe(
      "/series/rpt-sochi-2026-08/schedule",
    );
  });

  it("builds compound event public key", () => {
    expect(eventPublicKey("rpt-sochi-2026-08", "5-main-event")).toBe(
      "rpt-sochi-2026-08-5-main-event",
    );
  });

  it("builds event path", () => {
    expect(
      eventPath({ slug: "5-main-event" }, { slug: "rpt-sochi-2026-08" }),
    ).toBe("/events/rpt-sochi-2026-08-5-main-event");
  });

});
