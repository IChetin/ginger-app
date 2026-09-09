export function nicknameInitials(nickname: string): string {
  const parts = nickname
    .trim()
    .split(/[._\-\s]+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return (
    nickname
      .replace(/[._\-\s]/g, "")
      .slice(0, 2)
      .toUpperCase() || "D2"
  );
}

export function isIosSafariInstallPromptVisible({
  userAgent = navigator.userAgent,
  platform = navigator.platform,
  maxTouchPoints = navigator.maxTouchPoints,
  standalone = (typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches) ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
}: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
} = {}): boolean {
  const ios =
    /iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const safari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(userAgent);
  return ios && safari && !standalone;
}
