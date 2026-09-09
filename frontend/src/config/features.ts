export type HandInputMode = "wizard" | "table";

const ALL_MODES: readonly HandInputMode[] = ["wizard", "table"];

function parseFlag(raw: string | undefined): boolean {
  if (raw == null) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

/**
 * Equity vs random opponent hands. Off by default — the number is inflated
 * and unused until opponent ranges (13×13) land. Keep the worker path.
 */
export const EQUITY_VS_RANDOM = parseFlag(import.meta.env.VITE_EQUITY_VS_RANDOM);

function parseModes(raw: string | undefined): HandInputMode[] | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = trimmed
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is HandInputMode => item === "wizard" || item === "table");
  const unique = [...new Set(parsed)];
  return unique.length > 0 ? unique : null;
}

/** Which hand-input shells are compiled in. Empty env → both. */
export const HAND_INPUT_MODES: readonly HandInputMode[] =
  parseModes(import.meta.env.VITE_HAND_INPUT_MODES) ?? ALL_MODES;

export function isHandInputMode(value: unknown): value is HandInputMode {
  return value === "wizard" || value === "table";
}

export function resolveHandInputMode(preferred: HandInputMode | null | undefined): HandInputMode {
  const available = HAND_INPUT_MODES;
  if (preferred && available.includes(preferred)) return preferred;
  return available.includes("table") ? "table" : (available[0] ?? "wizard");
}

export function handInputModeAvailable(mode: HandInputMode): boolean {
  return HAND_INPUT_MODES.includes(mode);
}
