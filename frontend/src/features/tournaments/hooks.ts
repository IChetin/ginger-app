import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { fetchTournaments } from "@/api/client";
import type { DayPeriod, PokerApp } from "@/api/types/tournaments";

export type RangeKey = "day" | "3days" | "week";

export interface TournamentFilters {
  range: RangeKey;
  apps: PokerApp[];
  periods: DayPeriod[];
  buyinMin: number | null;
  buyinMax: number | null;
}

export const EMPTY_FILTERS: TournamentFilters = {
  range: "day",
  apps: [],
  periods: [],
  buyinMin: null,
  buyinMax: null,
};

const RANGE_HOURS: Record<RangeKey, number> = { day: 24, "3days": 72, week: 168 };

/**
 * Ступени бай-ина в рублях (ТЗ §8а.3): распределение логарифмическое, линейный ползунок
 * слипся бы. Две ручки на телефоне — риск по моторике, поэтому пока два списка «от» / «до».
 */
export const BUYIN_STEPS_RUB = [100, 300, 500, 1000, 2000, 5000, 10000] as const;

const STORAGE_KEY = "ginger.tournaments.filters.v1";

function readStoredFilters(): TournamentFilters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    return { ...EMPTY_FILTERS, ...(JSON.parse(raw) as Partial<TournamentFilters>) };
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

export function useTournaments(filters: TournamentFilters) {
  return useQuery({
    queryKey: ["tournaments", filters],
    queryFn: ({ signal }) => {
      const now = new Date();
      const to = new Date(now.getTime() + RANGE_HOURS[filters.range] * 3600_000);
      return fetchTournaments(
        {
          from: now.toISOString(),
          to: to.toISOString(),
          app: filters.apps,
          period: filters.periods,
          buyin_rub_min: filters.buyinMin ?? undefined,
          buyin_rub_max: filters.buyinMax ?? undefined,
        },
        signal,
      );
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
