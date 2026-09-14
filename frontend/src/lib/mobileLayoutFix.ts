/** Detect mobile browser with broken layout viewport (desktop site mode, stale cache, etc.). */
export function isBrokenMobileLayout(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const clientWidth = document.documentElement.clientWidth;
  const screenMin = Math.min(window.screen.width, window.screen.height);
  const visualWidth = window.visualViewport?.width ?? clientWidth;

  return (
    (mobile && coarse && clientWidth >= 600) ||
    (screenMin > 0 && screenMin <= 520 && clientWidth > screenMin + 80) ||
    (mobile && visualWidth > 0 && clientWidth > visualWidth + 80)
  );
}

export function applyMobileLayoutFix(): boolean {
  const broken = isBrokenMobileLayout();
  document.documentElement.classList.toggle("ginger-layout-wide", broken);
  return broken;
}
