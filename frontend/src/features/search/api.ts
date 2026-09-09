import { apiGet, buildQuery } from "@/api/client";
import type { SearchParams, SearchResponse } from "@/api/types/search";

export function fetchSearch(
  params: SearchParams,
  options?: { signal?: AbortSignal },
): Promise<SearchResponse> {
  return apiGet(`/api/v1/search${buildQuery(params)}`, undefined, options?.signal);
}
