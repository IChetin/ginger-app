import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { fetchTournaments } from "@/api/client";
import type { Tournament } from "@/api/types/tournaments";

export type RangeKey = "day" | "3days" | "week";
export type PriceTier = "low" | "mid" | "high";

export interface TournamentFilters {
  range: RangeKey;
  prices: PriceTier[];
}

export const EMPTY_FILTERS: TournamentFilters = {
  range: "day",
  prices: [],
};

const RANGE_HOURS: Record<RangeKey, number> = { day: 24, "3days": 72, week: 168 };

/** Ступени цены — рублёвый эквивалент бай-ина, одинаковый для клубов в $ и в ₽. */
export const PRICE_TIERS: { value: PriceTier; label: string }[] = [
  { value: "low", label: "до 1 000 ₽" },
  { value: "mid", label: "1–3 тыс. ₽" },
  { value: "high", label: "от 3 000 ₽" },
];

export function priceTier(buyinRub: string | null): PriceTier | null {
  if (buyinRub === null) return null;
  const value = Number(buyinRub);
  if (value < 1000) return "low";
  if (value < 3000) return "mid";
  return "high";
}

/**
 * Фильтры работают на месте: турниры за выбранный период уже загружены. Сателлиты в выдачу
 * не попадают вовсе — решение Ивана 14.09: они рвут ленту и игрокам неважны.
 */
export function applyTournamentFilters<
  T extends Pick<Tournament, "buyin_rub" | "satellite_target">,
>(items: T[], filters: TournamentFilters): T[] {
  return items.filter((item) => {
    if (item.satellite_target) return false;
    if (filters.prices.length === 0) return true;
    const tier = priceTier(item.buyin_rub);
    return tier !== null && filters.prices.includes(tier);
  });
}

const STORAGE_KEY = "ginger.tournaments.filters.v2";

function readStoredFilters(): TournamentFilters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const stored = JSON.parse(raw) as Partial<TournamentFilters>;
    return {
      range: stored.range && stored.range in RANGE_HOURS ? stored.range : EMPTY_FILTERS.range,
      prices: Array.isArray(stored.prices)
        ? stored.prices.filter((tier) => PRICE_TIERS.some((option) => option.value === tier))
        : [],
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

/** Фильтр настраивается один раз и запоминается между заходами. */
export function useTournamentFilters() {
  const [filters, setFilters] = useState<TournamentFilters>(readStoredFilters);

  const update = useCallback((patch: Partial<TournamentFilters>) => {
    setFilters((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // приватный режим / запрет хранилища — фильтр просто не запомнится
      }
      return next;
    });
  }, []);

  return { filters, update, reset: () => update(EMPTY_FILTERS) };
}

export function useTournaments(filters: Pick<TournamentFilters, "range">) {
  return useQuery({
    queryKey: ["tournaments", filters.range],
    queryFn: ({ signal }) => {
      const now = new Date();
      const to = new Date(now.getTime() + RANGE_HOURS[filters.range] * 3600_000);
      return fetchTournaments({ from: now.toISOString(), to: to.toISOString() }, signal);
    },
    placeholderData: keepPreviousData,
    // Турниры стартуют и закрывают регистрацию — список живой.
    refetchInterval: 60_000,
  });
}

/** Текущее время с тиком — для фаз турниров и обратных отсчётов. */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
