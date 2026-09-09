import { apiDelete, apiGet, apiPatch, apiPost, buildQuery } from "@/api/client";
import type { PaginatedResponse } from "@/api/types/schedule";
import type {
  Result,
  ResultCreatePayload,
  ResultEventSearchItem,
  ResultListItem,
  ResultsListParams,
  ResultUpdatePayload,
  StatsChartResponse,
  StatsFilterCountsResponse,
  StatsFilterParams,
  StatsFiltersResponse,
  StatsSummary,
} from "@/api/types/tracker";
import type { CurrencyBrief } from "@/api/types/schedule";

export function fetchResults(
  params: ResultsListParams = {},
): Promise<PaginatedResponse<ResultListItem>> {
  return apiGet(`/api/v1/results${buildQuery(params)}`);
}

export function fetchResult(resultId: string): Promise<Result> {
  return apiGet(`/api/v1/results/${resultId}`);
}

export function createResult(body: ResultCreatePayload): Promise<Result> {
  return apiPost("/api/v1/results", body);
}

export function updateResult(resultId: string, body: ResultUpdatePayload): Promise<Result> {
  return apiPatch(`/api/v1/results/${resultId}`, body);
}

export function deleteResult(resultId: string): Promise<void> {
  return apiDelete(`/api/v1/results/${resultId}`);
}

export function fetchStats(params: StatsFilterParams = {}): Promise<StatsSummary> {
  return apiGet(`/api/v1/stats${buildQuery(params)}`);
}

export function fetchStatsChart(params: StatsFilterParams = {}): Promise<StatsChartResponse> {
  return apiGet(`/api/v1/stats/chart${buildQuery(params)}`);
}

export function fetchStatsFilters(): Promise<StatsFiltersResponse> {
  return apiGet("/api/v1/stats/filters");
}

export function fetchStatsFilterCounts(
  params: StatsFilterParams = {},
): Promise<StatsFilterCountsResponse> {
  return apiGet(`/api/v1/stats/filter-counts${buildQuery(params)}`);
}

export function searchResultEvents(query: string, limit = 20): Promise<ResultEventSearchItem[]> {
  return apiGet(`/api/v1/results/search-events${buildQuery({ q: query, limit })}`);
}

export function fetchResultCurrencies(): Promise<CurrencyBrief[]> {
  return apiGet("/api/v1/results/currencies");
}
