import type { AnteMode, HandBlinds } from "@/api/types/hands";

export type { AnteMode };
export type ResolvedAnteMode = AnteMode | "table";

/** Новые раздачи и черновики без поля. */
export const DEFAULT_ANTE_MODE: AnteMode = "bb";

/** Правка старой раздачи без поля: ближе к «по сидящим», чем BB-анте. */
export const LEGACY_WIZARD_ANTE_MODE: AnteMode = "occupied";

export function isAnteMode(value: unknown): value is AnteMode {
  return value === "bb" || value === "occupied";
}

/** Движок: нет поля — легаси `table_size × ante` (включая пустые места). */
export function resolveAnteMode(blinds: Pick<HandBlinds, "ante_mode">): ResolvedAnteMode {
  return isAnteMode(blinds.ante_mode) ? blinds.ante_mode : "table";
}

/** Визард и новые черновики: нет поля → BB-анте. */
export function wizardAnteMode(blinds: Pick<HandBlinds, "ante_mode">): AnteMode {
  return isAnteMode(blinds.ante_mode) ? blinds.ante_mode : DEFAULT_ANTE_MODE;
}

/** Редактирование опубликованной раздачи без поля. */
export function publishedWizardAnteMode(blinds: Pick<HandBlinds, "ante_mode">): AnteMode {
  return isAnteMode(blinds.ante_mode) ? blinds.ante_mode : LEGACY_WIZARD_ANTE_MODE;
}

export function formatAnteCaption(
  blinds: Pick<HandBlinds, "ante" | "ante_mode">,
  formatAmount: (value: number) => string,
): string {
  if (!blinds.ante) return "";
  if (blinds.ante_mode === "bb") return ` · BB-анте ${formatAmount(blinds.ante)}`;
  return ` · анте ${formatAmount(blinds.ante)}`;
}
