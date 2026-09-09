export type BuyinPreset = "lt10k" | "10-50k" | "gte50k";

export const BUYIN_PRESETS: Array<{ value: BuyinPreset; label: string }> = [
  { value: "lt10k", label: "до 10 тыс. ₽" },
  { value: "10-50k", label: "10–50 тыс. ₽" },
  { value: "gte50k", label: "от 50 тыс. ₽" },
];

export const BUYIN_HINT =
  "Серия попадает в фильтр, если в ней есть хотя бы один турнир с таким бай-ином. Валюты пересчитываются в вашу базовую.";

export function buyinLabel(value: string): string {
  return BUYIN_PRESETS.find((item) => item.value === value)?.label ?? value;
}
