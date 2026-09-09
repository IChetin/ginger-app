export type SeriesStatus =
  | "announced"
  | "schedule_published"
  | "running"
  | "finished"
  | "cancelled";

export interface DateTimeWithTimezone {
  utc: string;
  venue_local: string;
  venue_timezone: string;
}

export interface SearchSeriesItem {
  id: string;
  slug: string;
  name: string;
  status: SeriesStatus;
  starts_on: string;
  ends_on: string;
  venue_name: string;
  venue_city: string;
  organizer_name: string;
  organizer_slug: string;
  events_count: number;
}

export interface SearchVenueItem {
  id: string;
  name: string;
  city: string;
  country_code: string;
  zone: string | null;
  series_count: number;
}

export interface SearchEventItem {
  id: string;
  slug: string;
  number: number | null;
  name: string;
  series_id: string;
  series_slug: string;
  series_name: string;
  buyin: string;
  currency_code: string;
  nearest_start_at: DateTimeWithTimezone | null;
}

export interface SearchGroup<T> {
  items: T[];
  total: number;
  has_more: boolean;
}

export interface SearchResponse {
  q: string;
  series: SearchGroup<SearchSeriesItem>;
  venues: SearchGroup<SearchVenueItem>;
  events: SearchGroup<SearchEventItem>;
}

export interface SearchParams {
  q: string;
  limit?: number;
  series_limit?: number;
  venues_limit?: number;
  events_limit?: number;
}
