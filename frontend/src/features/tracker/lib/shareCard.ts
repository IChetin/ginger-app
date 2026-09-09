import { fetchStatsShareCard } from "@/api/client";
import type { StatsFilterParams } from "@/api/types/tracker";
import { isTouchShareDevice } from "@/features/schedule/shareSeriesPdf";

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "unsupported" | "error";

const SHARE_FETCH_TIMEOUT_MS = 30_000;

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function canSharePngFiles(): boolean {
  if (!isTouchShareDevice()) {
    return false;
  }
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") {
    return false;
  }
  try {
    const probe = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "probe.png", {
      type: "image/png",
    });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Touch → Web Share with file; desktop → download. Never the reverse. */
export async function shareOrDownloadCard(params: StatsFilterParams): Promise<ShareOutcome> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SHARE_FETCH_TIMEOUT_MS);
  try {
    const { blob, filename } = await fetchStatsShareCard(params, {
      signal: controller.signal,
    });

    if (canSharePngFiles()) {
      try {
        const file = new File([blob], filename, { type: "image/png" });
        const nav = navigator as Navigator & {
          share: (data?: ShareData) => Promise<void>;
        };
        await nav.share({
          files: [file],
          title: filename,
          text: "Личная статистика · Day2",
        });
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "cancelled";
        }
        // Fall through to download on share failure (except cancel).
      }
    }

    triggerBlobDownload(blob, filename);
    return "downloaded";
  } catch {
    return "error";
  } finally {
    window.clearTimeout(timer);
  }
}
