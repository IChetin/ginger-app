import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { SearchParams, SearchResponse } from "@/api/types/search";
import { fetchSearch } from "@/features/search/api";
import {
  clearRecentSearches,
  deleteRecentSearch,
  listRecentSearches,
  pushRecentSearch,
  type RecentSearchRecord,
} from "@/features/search/lib/recentSearchesIdb";

export const searchKeys = {
  all: ["search"] as const,
  query: (params: SearchParams) => [...searchKeys.all, params] as const,
  recent: ["search", "recent"] as const,
};

export function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useSearchQuery(
  params: SearchParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: searchKeys.query(params),
    queryFn: ({ signal }) => fetchSearch(params, { signal }),
    enabled: (options?.enabled ?? true) && params.q.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useRecentSearches() {
  return useQuery({
    queryKey: searchKeys.recent,
    queryFn: listRecentSearches,
    staleTime: Infinity,
  });
}

export function usePushRecentSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query: string) => pushRecentSearch(query),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: searchKeys.recent });
    },
  });
}

export function useDeleteRecentSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query: string) => deleteRecentSearch(query),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: searchKeys.recent });
    },
  });
}

export function useClearRecentSearches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearRecentSearches(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: searchKeys.recent });
    },
  });
}

export type { RecentSearchRecord, SearchResponse };
