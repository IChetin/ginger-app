import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ResultCreatePayload,
  ResultsListParams,
  ResultUpdatePayload,
  StatsFilterParams,
} from "@/api/types/tracker";
import { useDemo } from "@/demo/DemoContext";
import {
  computeDemoChart,
  computeDemoFilterCounts,
  computeDemoStats,
  getDemoResult,
  listDemoCurrencies,
  listDemoFilters,
  listDemoResults,
} from "@/demo/tracker";
import { useMe } from "@/features/auth/hooks";
import {
  createResult,
  deleteResult,
  fetchResult,
  fetchResultCurrencies,
  fetchResults,
  fetchStats,
  fetchStatsChart,
  fetchStatsFilterCounts,
  fetchStatsFilters,
  searchResultEvents,
  updateResult,
} from "@/features/tracker/api";
import { trackerKeys } from "@/features/tracker/queryKeys";

const DEMO_READONLY = new Error("demo_readonly");

function useTrackerSource() {
  const { data: user } = useMe();
  const { isDemo, baseCurrency, requestLogin } = useDemo();
  return {
    isDemo,
    baseCurrency: user?.base_currency ?? baseCurrency,
    enabled: isDemo || Boolean(user),
    keyPart: isDemo ? (`demo:${baseCurrency}` as const) : ("live" as const),
    requestLogin,
  };
}

export function useResults(params: ResultsListParams = {}, options?: { enabled?: boolean }) {
  const { isDemo, baseCurrency, enabled, keyPart } = useTrackerSource();
  return useQuery({
    queryKey: [...trackerKeys.results(params), keyPart],
    queryFn: () => (isDemo ? listDemoResults(params, baseCurrency) : fetchResults(params)),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useInfiniteResults(
  filters: StatsFilterParams,
  pageSize = 20,
  options?: { enabled?: boolean },
) {
  const { isDemo, baseCurrency, enabled, keyPart } = useTrackerSource();
  return useInfiniteQuery({
    queryKey: [...trackerKeys.results({ ...filters, limit: pageSize }), keyPart],
    queryFn: ({ pageParam }) =>
      isDemo
        ? listDemoResults({ ...filters, limit: pageSize, offset: pageParam }, baseCurrency)
        : fetchResults({ ...filters, limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.items.length;
      return next < lastPage.total ? next : undefined;
    },
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useResult(resultId: string | undefined, options?: { enabled?: boolean }) {
  const { isDemo, baseCurrency, enabled, keyPart } = useTrackerSource();
  return useQuery({
    queryKey: [...trackerKeys.result(resultId ?? ""), keyPart],
    queryFn: () => {
      if (isDemo) {
        const row = getDemoResult(resultId!, baseCurrency);
        if (!row) throw new Error("demo_result_not_found");
        return row;
      }
      return fetchResult(resultId!);
    },
    enabled: enabled && Boolean(resultId) && (options?.enabled ?? true),
  });
}

export function useStats(params: StatsFilterParams = {}, options?: { enabled?: boolean }) {
  const { isDemo, baseCurrency, enabled, keyPart } = useTrackerSource();
  return useQuery({
    queryKey: [...trackerKeys.stats(params), keyPart],
    queryFn: () => (isDemo ? computeDemoStats(params, baseCurrency) : fetchStats(params)),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 30_000,
    retry: (count, error) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "fx_rate_missing"
      ) {
        return false;
      }
      return count < 2;
    },
  });
}

export function useStatsChart(params: StatsFilterParams = {}, options?: { enabled?: boolean }) {
  const { isDemo, baseCurrency, enabled, keyPart } = useTrackerSource();
  return useQuery({
    queryKey: [...trackerKeys.chart(params), keyPart],
    queryFn: () => (isDemo ? computeDemoChart(params, baseCurrency) : fetchStatsChart(params)),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 30_000,
    retry: (count, error) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "fx_rate_missing"
      ) {
        return false;
      }
      return count < 2;
    },
  });
}

export function useStatsFilters(options?: { enabled?: boolean }) {
  const { isDemo, enabled, keyPart } = useTrackerSource();
  return useQuery({
    queryKey: [...trackerKeys.filters(), keyPart],
    queryFn: () => (isDemo ? listDemoFilters() : fetchStatsFilters()),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useStatsFilterCounts(
  params: StatsFilterParams = {},
  options?: { enabled?: boolean },
) {
  const { isDemo, baseCurrency, enabled, keyPart } = useTrackerSource();
  return useQuery({
    queryKey: [...trackerKeys.filterCounts(params), keyPart],
    queryFn: () =>
      isDemo ? computeDemoFilterCounts(params, baseCurrency) : fetchStatsFilterCounts(params),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  });
}

export function useResultEventSearch(query: string, options?: { enabled?: boolean }) {
  const { data: user } = useMe();
  return useQuery({
    queryKey: trackerKeys.eventSearch(query),
    queryFn: () => searchResultEvents(query),
    enabled: Boolean(user) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useResultCurrencies(options?: { enabled?: boolean }) {
  const { isDemo, enabled, keyPart } = useTrackerSource();
  return useQuery({
    queryKey: [...trackerKeys.currencies(), keyPart],
    queryFn: () => (isDemo ? listDemoCurrencies() : fetchResultCurrencies()),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 5 * 60_000,
  });
}

async function invalidateTracker(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: trackerKeys.all });
}

export function useCreateResult() {
  const queryClient = useQueryClient();
  const { isDemo, requestLogin } = useDemo();
  return useMutation({
    mutationFn: (body: ResultCreatePayload) => {
      if (isDemo) {
        requestLogin();
        return Promise.reject(DEMO_READONLY);
      }
      return createResult(body);
    },
    onSuccess: async () => {
      await invalidateTracker(queryClient);
    },
  });
}

export function useUpdateResult() {
  const queryClient = useQueryClient();
  const { isDemo, requestLogin } = useDemo();
  return useMutation({
    mutationFn: ({ resultId, body }: { resultId: string; body: ResultUpdatePayload }) => {
      if (isDemo) {
        requestLogin();
        return Promise.reject(DEMO_READONLY);
      }
      return updateResult(resultId, body);
    },
    onSuccess: async () => {
      await invalidateTracker(queryClient);
    },
  });
}

export function useDeleteResult() {
  const queryClient = useQueryClient();
  const { isDemo, requestLogin } = useDemo();
  return useMutation({
    mutationFn: (resultId: string) => {
      if (isDemo) {
        requestLogin();
        return Promise.reject(DEMO_READONLY);
      }
      return deleteResult(resultId);
    },
    onSuccess: async () => {
      await invalidateTracker(queryClient);
    },
  });
}
