import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { canSharePngFiles, shareOrDownloadCard } from "@/features/tracker/lib/shareCard";

const { fetchStatsShareCard, isTouchShareDevice } = vi.hoisted(() => ({
  fetchStatsShareCard: vi.fn(),
  isTouchShareDevice: vi.fn(),
}));

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    fetchStatsShareCard: (...args: unknown[]) => fetchStatsShareCard(...args),
  };
});

vi.mock("@/features/schedule/shareSeriesPdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/schedule/shareSeriesPdf")>();
  return {
    ...actual,
    isTouchShareDevice: (...args: unknown[]) => isTouchShareDevice(...args),
  };
});

describe("shareCard", () => {
  beforeEach(() => {
    fetchStatsShareCard.mockReset();
    isTouchShareDevice.mockReturnValue(false);
    fetchStatsShareCard.mockResolvedValue({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      filename: "Day2_stats_2026-07.png",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads on desktop (no touch share)", async () => {
    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return {
          click,
          href: "",
          download: "",
          rel: "",
          remove() {},
        } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tag);
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:test"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    const outcome = await shareOrDownloadCard({ date_from: "2026-07-01", date_to: "2026-07-30" });
    expect(outcome).toBe("downloaded");
    expect(fetchStatsShareCard).toHaveBeenCalledWith(
      { date_from: "2026-07-01", date_to: "2026-07-30" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(click).toHaveBeenCalled();
    appendChild.mockRestore();
  });

  it("canSharePngFiles is false on desktop", () => {
    isTouchShareDevice.mockReturnValue(false);
    expect(canSharePngFiles()).toBe(false);
  });
});
