import type { PokerApp, Tournament, TournamentClub } from "@/api/types/tournaments";

/** Всё расписание — по Москве (ТЗ §8а.3): так публикуют союзы, так ждут игроки. */
export const MSK = "Europe/Moscow";

export const APP_LABELS: Record<PokerApp, string> = {
  pppoker: "PPPoker",
  xpoker: "X-Poker",
  poker21: "Poker21+",
  other: "Другое",
};

/** Официальные иконки приложений из App Store, лежат в public/apps. */
export const APP_ICONS: Partial<Record<PokerApp, string>> = {
  pppoker: "/apps/pppoker.png",
  xpoker: "/apps/xpoker.png",
  poker21: "/apps/poker21.png",
};

const amountFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

/**
 * Сумма турнира в деньгах клуба с символом впереди: «$16», «₽500», «$1,6».
 * Суммы в API — в фишках, курс клуба переводит их в деньги. Без курса — просто фишки.
 */
export function formatMoney(chips: string | null, club: TournamentClub): string | null {
  if (chips === null) {
    return null;
  }
  const value = Number(chips);
  if (club.chip_value === null || club.currency_symbol === null) {
    return `${amountFormat.format(value)} фиш.`;
  }
  return `${club.currency_symbol}${amountFormat.format(value * Number(club.chip_value))}`;
}

const timeFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MSK,
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTimeMsk(iso: string): string {
  return timeFormat.format(new Date(iso));
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: MSK,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** «2026-09-13» по Москве — ключ группировки по дням. */
export function mskDayKey(date: Date): string {
  return dayKeyFormat.format(date);
}

const dayLabelFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MSK,
  weekday: "short",
  day: "numeric",
  month: "long",
});

export function formatDayLabel(dayKey: string, now: Date): string {
  const today = mskDayKey(now);
  const tomorrow = mskDayKey(new Date(now.getTime() + 24 * 3600_000));
  // Полдень по Москве — чтобы дата не съехала при форматировании.
  const label = dayLabelFormat.format(new Date(`${dayKey}T12:00:00+03:00`));
  if (dayKey === today) return `Сегодня, ${label}`;
  if (dayKey === tomorrow) return `Завтра, ${label}`;
  return label;
}

export type TournamentPhase =
  { kind: "upcoming" } | { kind: "late_reg"; closesAt: Date } | { kind: "closed" };

export function tournamentPhase(tournament: Tournament, now: Date): TournamentPhase {
  if (new Date(tournament.starts_at) > now) {
    return { kind: "upcoming" };
  }
  if (tournament.late_reg_closes_at) {
    const closesAt = new Date(tournament.late_reg_closes_at);
    if (closesAt > now) {
      return { kind: "late_reg", closesAt };
    }
  }
  return { kind: "closed" };
}

/** «47:05» или «1:12:05» — сколько ещё открыта поздняя регистрация. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** «Аддон в 20:40» там, где аддон есть, иначе «Рег. до 20:40» (ТЗ §8а.3.1). */
export function lateRegLabel(tournament: Tournament): string | null {
  if (!tournament.late_reg_closes_at) {
    return null;
  }
  const time = formatTimeMsk(tournament.late_reg_closes_at);
  return tournament.has_addon ? `Аддон в ${time}` : `Рег. до ${time}`;
}

/** Сателлит показываем как «Sat → Main Event», остальные турниры — по названию. */
export function displayName(tournament: Tournament): string {
  return tournament.satellite_target ? `Sat → ${tournament.satellite_target}` : tournament.name;
}

/** Короткие метки формата: PKO, Mystery, PLO5, Early Bird. */
export function formatTags(tournament: Tournament): string[] {
  const tags: string[] = [];
  if (tournament.game_type === "plo") tags.push("PLO");
  if (tournament.game_type === "plo5") tags.push("PLO5");
  if (tournament.bounty_kind === "pko") tags.push("PKO");
  if (tournament.bounty_kind === "ko") tags.push("KO");
  if (tournament.bounty_kind === "mystery") tags.push("Mystery");
  // Ответ Ивана 14.09: у союзов всё, что не PKO и не Mystery, идёт с ребаями и аддоном.
  if (tournament.bounty_kind !== "pko" && tournament.bounty_kind !== "mystery") tags.push("R+A");
  if (tournament.early_bird_players) tags.push(`Early Bird ×${tournament.early_bird_players}`);
  if (tournament.ticket_value) {
    const ticket = formatMoney(tournament.ticket_value, tournament.club);
    if (ticket) tags.push(`Билет ${ticket}`);
  }
  return tags;
}

export function groupByDay<T extends { starts_at: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = mskDayKey(new Date(item.starts_at));
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()];
}
