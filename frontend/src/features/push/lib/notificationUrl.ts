const UNSAFE_PREFIXES = ["//", "http:", "https:", "javascript:"];

export function resolveNotificationClickUrl(
  url: string | null | undefined,
  fallback = "/",
): string {
  if (!url) {
    return fallback;
  }

  const trimmed = url.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  const lower = trimmed.toLowerCase();
  for (const prefix of UNSAFE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return fallback;
    }
  }

  return trimmed;
}
