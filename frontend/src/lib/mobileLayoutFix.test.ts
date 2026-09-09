import { describe, expect, it, vi } from "vitest";

import { isBrokenMobileLayout } from "@/lib/mobileLayoutFix";

describe("isBrokenMobileLayout", () => {
  it("detects mobile UA with coarse pointer and wide layout", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("pointer: coarse"),
      media: query,
    }));
    vi.stubGlobal("screen", { width: 980, height: 1800 });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 980,
    });
    vi.stubGlobal("visualViewport", { width: 980 });

    expect(isBrokenMobileLayout()).toBe(true);
  });

  it("returns false for normal phone viewport", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("pointer: coarse"),
      media: query,
    }));
    vi.stubGlobal("screen", { width: 412, height: 915 });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 412,
    });
    vi.stubGlobal("visualViewport", { width: 412 });

    expect(isBrokenMobileLayout()).toBe(false);
  });
});
