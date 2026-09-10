/**
 * Форматирование денег и чисел в ru-RU.
 *
 * Символы валют нужны там, где API отдаёт только код валюты.
 * Где приходит объект валюты — берём `currency.symbol` из ответа, а не эту карту.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: "₽",
  BYN: "Br",
  EUR: "€",
  USD: "$",
};

/** Символ валюты по коду; для незнакомого кода возвращает сам код. */
export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

export function formatNumberRu(value: number | string, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(Number(value));
}

/** «+», «−» (U+2212) или пусто — для величин, где знак несёт смысл. */
export function signPrefix(value: number): string {
  if (value > 0) {
    return "+";
  }
  if (value < 0) {
    return "−";
  }
  return "";
}
