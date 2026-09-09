export const REMINDER_PRESET_OFFSETS = [15, 60, 120, 360, 1440, 2880] as const;

export type ReminderPresetOffset = (typeof REMINDER_PRESET_OFFSETS)[number];

export const DEFAULT_REMINDER_OFFSETS: number[] = [1440, 120];

export const REMINDER_PRESET_LABELS: Record<ReminderPresetOffset, string> = {
  15: "15 мин",
  60: "1 ч",
  120: "2 ч",
  360: "6 ч",
  1440: "24 ч",
  2880: "48 ч",
};

export function formatReminderOffsets(offsets: number[]): string {
  return offsets
    .map((offset) => REMINDER_PRESET_LABELS[offset as ReminderPresetOffset] ?? `${offset} мин`)
    .join(", ");
}

/** Design phrase: «за 24 ч и 2 ч» / «за 48 ч, 24 ч и 6 ч». */
export function formatReminderOffsetsPhrase(offsets: number[]): string {
  const labels = [...offsets]
    .sort((a, b) => b - a)
    .map((offset) => REMINDER_PRESET_LABELS[offset as ReminderPresetOffset] ?? `${offset} мин`);
  if (labels.length === 0) {
    return "за —";
  }
  if (labels.length === 1) {
    return `за ${labels[0]}`;
  }
  if (labels.length === 2) {
    return `за ${labels[0]} и ${labels[1]}`;
  }
  const head = labels.slice(0, -1).join(", ");
  return `за ${head} и ${labels[labels.length - 1]}`;
}
