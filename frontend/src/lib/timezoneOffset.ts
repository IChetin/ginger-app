/** Format IANA timezone offset as UTC±N using Intl (no hardcoded offsets). */
export function formatUtcOffset(timeZone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "UTC";
    // GMT+3 / UTC+3 / GMT+05:30 / GMT
    const normalized = raw.replace("GMT", "UTC");
    if (normalized === "UTC" || normalized === "UTC+0" || normalized === "UTC-0") {
      return "UTC+0";
    }
    const match = normalized.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) {
      return normalized;
    }
    const sign = match[1]!;
    const hours = Number(match[2]);
    const minutes = match[3] ? Number(match[3]) : 0;
    if (minutes === 0) {
      return `UTC${sign}${hours}`;
    }
    return `UTC${sign}${hours}:${String(minutes).padStart(2, "0")}`;
  } catch {
    return "UTC";
  }
}

export function listIanaTimeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supported === "function") {
    return supported.call(Intl, "timeZone");
  }
  return [
    "Europe/Kaliningrad",
    "Europe/Moscow",
    "Europe/Minsk",
    "Asia/Nicosia",
    "Asia/Barnaul",
    "Asia/Vladivostok",
    "UTC",
  ];
}
