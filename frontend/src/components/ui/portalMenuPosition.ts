import { STICKY_HEADER_COMPACT_PX } from "@/components/layout/StickyHeader";

const GAP = 4;
const PAD = 8;

export function stickyHeaderOffset(): number {
  if (typeof document === "undefined") return STICKY_HEADER_COMPACT_PX;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--sticky-h").trim();
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return STICKY_HEADER_COMPACT_PX;
}

export function computeMenuPosition(
  anchor: Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width" | "height">,
  menuSize: { width: number; height: number },
  viewport: { width: number; height: number },
  stickyTop: number,
): { top: number; left: number; maxHeight: number } {
  const topMin = Math.max(PAD, stickyTop + PAD);
  const bottomMax = viewport.height - PAD;
  const availBelow = bottomMax - (anchor.bottom + GAP);
  const availAbove = anchor.top - GAP - topMin;
  const fitsBelow = menuSize.height <= availBelow;
  const fitsAbove = menuSize.height <= availAbove;
  const openBelow = fitsBelow || (!fitsAbove && availBelow >= availAbove);

  let left = anchor.right - menuSize.width;
  if (left < PAD) left = PAD;
  if (left + menuSize.width > viewport.width - PAD) {
    left = Math.max(PAD, viewport.width - PAD - menuSize.width);
  }

  if (openBelow) {
    const maxHeight = Math.max(0, Math.min(menuSize.height, availBelow));
    const top = Math.min(anchor.bottom + GAP, Math.max(topMin, bottomMax - maxHeight));
    return { top: Math.max(top, topMin), left, maxHeight };
  }

  const maxHeight = Math.max(0, Math.min(menuSize.height, availAbove));
  const top = Math.max(topMin, anchor.top - GAP - maxHeight);
  return { top, left, maxHeight: Math.min(maxHeight, anchor.top - GAP - top) };
}
