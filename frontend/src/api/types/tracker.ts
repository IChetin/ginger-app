export type ResultEntryType = "live_mtt";

export type ResultEventType = "entry" | "reentry" | "note";

export interface ResultEvent {
  id: string;
  type: ResultEventType;
  amount: string | null;
  currency_code: string | null;
  text: string | null;
  occurred_at: string;
  created_at: string;
}

export interface ResultEventWrite {
  id: string;
  type: ResultEventType;
  amount?: string | null;
  currency_code?: string | null;
  text?: string | null;
  occurred_at: string;
}

export interface Result {
  id: string;
  entry_type: ResultEntryType;
  event_id: string | null;
  name: string;
  venue_text: string | null;
  series_text: string | null;
  played_on: string;
  buyin: string;
  currency_code: string;
  entries_count: number;
  payout: string;
  place: number | null;
  field_size: number | null;
  note: string | null;
  events: ResultEvent[];
  created_at: string;
  updated_at: string;
}

export interface ResultListItem extends Result {
  profit_base: string;
  base_currency: string;
}

export interface ResultEventSearchItem {
  event_id: string;
  name: string;
  series_name: string;
  venue_name: string;
  played_on: string;
  buyin: string;
  currency_code: string;
  currency_symbol: string;
}

export interface ResultCreatePayload {
  event_id?: string | null;
  name?: string | null;
  venue_text?: string | null;
  series_text?: string | null;
  played_on?: string | null;
  buyin?: string | null;
  currency_code?: string | null;
  entries_count?: number;
  payout?: string;
  place?: number | null;
  field_size?: number | null;
  note?: string | null;
  events?: ResultEventWrite[];
}

export interface ResultUpdatePayload {
  name?: string | null;
  venue_text?: string | null;
  series_text?: string | null;
  played_on?: string | null;
  buyin?: string | null;
  currency_code?: string | null;
  entries_count?: number | null;
  payout?: string | null;
  place?: number | null;
  field_size?: number | null;
  note?: string | null;
  events?: ResultEventWrite[];
}

export interface ResultsListParams extends StatsFilterParams {
  limit?: number;
  offset?: number;
}

export interface StatsFilterParams {
  date_from?: string;
  date_to?: string;
  series_id?: string;
  series?: string;
  venue_id?: string;
  venues?: string;
  country_code?: string;
  buyin_min?: string;
  buyin_max?: string;
  buyin?: string;
  result?: string;
}

export interface StatsSummary {
  base_currency: string;
  tournaments: number;
  entries: number;
  invested: string;
  won: string;
  profit: string;
  roi: string | null;
  abi: string | null;
  itm: string;
}

export interface StatsChartPoint {
  index: number;
  result_id: string;
  played_on: string;
  label: string;
  profit: string;
  cumulative_profit: string;
}

export interface StatsChartResponse {
  base_currency: string;
  points: StatsChartPoint[];
}

export interface StatsFilterOption {
  id: string;
  name: string;
}

export interface StatsCountryOption {
  code: string;
  name_ru: string;
}

export interface StatsFiltersResponse {
  series: StatsFilterOption[];
  venues: StatsFilterOption[];
  countries: StatsCountryOption[];
  unlinked_count: number;
}

export interface FilterFacetCount {
  value: string;
  count: number;
}

export interface StatsFilterCountsResponse {
  total: number;
  series: FilterFacetCount[];
  venues: FilterFacetCount[];
  buyin: FilterFacetCount[];
  result: FilterFacetCount[];
}
