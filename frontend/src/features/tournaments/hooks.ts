import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { fetchTournaments } from "@/api/client";
import type { Tournament } from "@/api/types/tournaments";

export type RangeKey = "day" | "3days" | "week";
/** Что показывать в списке — один выбор из четырёх (Иван, 27.09; ступени цены убраны). */
export type ListMode = "all" | "picked" | "free" | "major";

export interface TournamentFilters {
  range: RangeKey;
  mode: ListMode;
}

export const EMPTY_FILTERS: TournamentFilters = {
  range: "day",
  mode: "all",
};

const RANGE_HOURS: Record<RangeKey, number> = { day: 24, "3days": 72, week: 168 };
const LIST_MODES: ListMode[] = ["all", "picked", "free", "major"];

/**
 * Фильтры работают на месте: турниры за выбранный период уже загружены. Сателлиты в выдачу
 * не попадают вовсе — решение Ивана 14.09: они рвут ленту и игрокам неважны.
 * Free — вход 0 в любой валюте; Major — крупнейшая гарантия клуба за день (флаг с сервера).
 */
export function applyTournamentFilters<
  T extends Pick<Tournament, "buyin" | "satellite_target" | "is_editor_pick" | "is_major">,
>(items: T[], filters: Pick<TournamentFilters, "mode">): T[] {
  return items.filter((item) => {
    if (item.satellite_target) return false;
    switch (filters.mode) {
      case "picked":
        return Boolean(item.is_editor_pick);
      case "free":
        return Number(item.buyin) === 0;
      case "major":
        return Boolean(item.is_major);
      default:
        return true;
    }
  });
}

const STORAGE_KEY = "ginger.tournaments.filters.v3";

function readStoredFilters(): TournamentFilters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const stored = JSON.parse(raw) as Partial<TournamentFilters>;
    return {
      range: stored.range && stored.range in RANGE_HOURS ? stored.range : EMPTY_FILTERS.range,
      mode: stored.mode && LIST_MODES.includes(stored.mode) ? stored.mode : EMPTY_FILTERS.mode,
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

export function useTournaments(filters: Pick<TournamentFilters, "range">, enabled = true) {
  return useQuery({
    queryKey: ["tournaments", filters.range],
    enabled,
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
