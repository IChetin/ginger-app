import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useFilterPreviewCount<TParams extends object, TResult>({
  queryKey,
  params,
  fetchCount,
  enabled = true,
  selectTotal,
}: {
  queryKey: readonly unknown[];
  params: TParams;
  fetchCount: (params: TParams) => Promise<TResult>;
  enabled?: boolean;
  selectTotal: (data: TResult) => number;
}) {
  const debounced = useDebouncedValue(params, 300);
  const query = useQuery({
    queryKey: [...queryKey, debounced],
    queryFn: () => fetchCount(debounced),
    enabled,
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  });

  return {
    total: query.data !== undefined ? selectTotal(query.data) : null,
    isFetching: query.isFetching,
  };
}
