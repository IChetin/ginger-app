import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText, isTouchShareDevice, shareOrCopyUrl } from "@/lib/share";

function stubShareEnv(options: { touch: boolean }) {
  const share = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    maxTouchPoints: options.touch ? 5 : 0,
    share,
    clipboard: { writeText },
  });
  window.matchMedia = ((query: string) => ({
    matches: options.touch && query.includes("pointer: coarse"),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
  return { share, writeText };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isTouchShareDevice", () => {
  it("is false on desktop even when Web Share exists", () => {
    stubShareEnv({ touch: false });
    expect(isTouchShareDevice()).toBe(false);
  });

  it("is true on a coarse pointer with touch points", () => {
    stubShareEnv({ touch: true });
    expect(isTouchShareDevice()).toBe(true);
  });
});

describe("shareOrCopyUrl", () => {
  it("copies on desktop and never calls navigator.share", async () => {
    const { share, writeText } = stubShareEnv({ touch: false });
    const outcome = await shareOrCopyUrl({
      title: "Турнир",
      url: "https://day2.pro/events/abc",
    });
    expect(outcome).toBe("copied");
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith("https://day2.pro/events/abc");
  });

  it("uses Web Share on touch devices", async () => {
    const { share, writeText } = stubShareEnv({ touch: true });
    const outcome = await shareOrCopyUrl({
      title: "Турнир",
      url: "https://day2.pro/events/abc",
    });
    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Турнир",
      url: "https://day2.pro/events/abc",
      text: "Турнир · Day2",
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies after Web Share fails on touch", async () => {
    const { share, writeText } = stubShareEnv({ touch: true });
    share.mockRejectedValueOnce(new Error("abort"));
    const outcome = await shareOrCopyUrl({
      title: "Серия",
      url: "https://day2.pro/series/rpt",
    });
    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://day2.pro/series/rpt");
  });
});

describe("copyText", () => {
  it("falls back to execCommand when clipboard.writeText throws", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    expect(await copyText("hello")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});
