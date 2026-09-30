import type { Promo, PromoWindow } from "@/features/promos/promosApi";

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const dayFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});
const timeFormat = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});
const MSK_OFFSET_MINUTES = 3 * 60;
const DAY_MS = 86_400_000;

/** «₽610 000», «$1 500» — символ перед числом, как во всём приложении (Иван, 13.09). */
export function formatPromoMoney(amount: string | null, symbol: string | null): string | null {
  if (amount === null) return null;
  return `${symbol ?? ""}${numberFormat.format(Number(amount))}`;
}

/** «28 декабря», «28 декабря, 06:00» — время показываем, только если оно не полночь. */
export function promoDate(iso: string): string {
  const time = timeFormat.format(new Date(iso));
  return time === "00:00"
    ? dayFormat.format(new Date(iso))
    : `${dayFormat.format(new Date(iso))}, ${time}`;
}

export type PromoPhase =
  | { kind: "upcoming"; startsInDays: number }
  | { kind: "running"; daysLeft: number }
  | { kind: "ended" };

export function promoPhase(promo: Promo, now: Date): PromoPhase {
  const starts = promo.starts_at ? new Date(promo.starts_at).getTime() : null;
  const ends = promo.ends_at ? new Date(promo.ends_at).getTime() : null;
  if (ends !== null && ends <= now.getTime()) return { kind: "ended" };
  if (starts !== null && starts > now.getTime()) {
    return { kind: "upcoming", startsInDays: Math.ceil((starts - now.getTime()) / DAY_MS) };
  }
  return {
    kind: "running",
    daysLeft: ends === null ? 0 : Math.max(0, Math.ceil((ends - now.getTime()) / DAY_MS)),
  };
}

function minutesOfDay(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Минуты от полуночи по Москве — окна двойных очков союзы пишут по МСК. */
function mskMinutes(now: Date): number {
  const utc = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utc + MSK_OFFSET_MINUTES) % (24 * 60);
}

/** Идёт ли сейчас окно с множителем и сколько минут ему осталось. */
export function activeWindow(
  windows: PromoWindow[],
  now: Date,
): { window: PromoWindow; minutesLeft: number } | null {
  const current = mskMinutes(now);
  for (const window of windows) {
    const start = minutesOfDay(window.start);
    const end = minutesOfDay(window.end);
    const inside =
      start <= end ? current >= start && current < end : current >= start || current < end;
    if (inside) {
      const minutesLeft = (end - current + 24 * 60) % (24 * 60);
      return { window, minutesLeft };
    }
  }
  return null;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/** «бай-ин ₽500 – ₽10 000», «бай-ин до ₽400», пусто — любой. */
export function buyinLabel(promo: Promo): string {
  const low = formatPromoMoney(promo.buyin_min, promo.currency_symbol);
  const high = formatPromoMoney(promo.buyin_max, promo.currency_symbol);
  if (low && high) return `бай-ин ${low} – ${high}`;
  if (low) return `бай-ин от ${low}`;
  if (high) return `бай-ин до ${high}`;
  return "любой бай-ин";
}

export const GAME_LABEL: Record<Promo["game"], string> = {
  mtt: "MTT",
  cash: "CASH",
  any: "MTT и CASH",
};
export const KIND_LABEL: Record<Promo["kind"], string> = {
  leaderboard: "LEADERBOARD",
  freeroll: "FREEROLL",
  bonus: "BONUS",
  other: "PROMO",
};
