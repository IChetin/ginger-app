import { fetchSeriesSchedulePdf } from "@/api/client";
import { isTouchShareDevice } from "@/lib/share";

export { isTouchShareDevice };

export type PdfDownloadOutcome = "downloaded" | "error";
export type PdfShareOutcome = "shared" | "cancelled" | "error" | "unsupported";

const PDF_FETCH_TIMEOUT_MS = 20_000;

export function canSharePdfFiles(): boolean {
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
    const probe = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "probe.pdf", {
      type: "application/pdf",
    });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revoke so Safari finishes the download handshake.
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

/** Always downloads. Never calls Web Share API. */
export async function downloadSeriesPdf(seriesId: string): Promise<PdfDownloadOutcome> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);
  try {
    const { blob, filename } = await fetchSeriesSchedulePdf(seriesId, {
      signal: controller.signal,
    });
    triggerBlobDownload(blob, filename);
    return "downloaded";
  } catch {
    return "error";
  } finally {
    window.clearTimeout(timer);
  }
}

/** Mobile-only share. Failures/cancel are silent. */
export async function shareSeriesPdf(seriesId: string): Promise<PdfShareOutcome> {
  if (!canSharePdfFiles()) {
    return "unsupported";
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);
  try {
    const { blob, filename } = await fetchSeriesSchedulePdf(seriesId, {
      signal: controller.signal,
    });
    const file = new File([blob], filename, { type: "application/pdf" });
    const nav = navigator as Navigator & {
      share: (data?: ShareData) => Promise<void>;
    };
    await nav.share({
      files: [file],
      title: filename,
      text: "Расписание серии · Day2",
    });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      // AbortController timeout vs user cancel — treat both as silent.
      return "cancelled";
    }
    return "error";
  } finally {
    window.clearTimeout(timer);
  }
}
