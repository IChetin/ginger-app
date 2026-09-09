export type SeriesStatus =
  "announced" | "schedule_published" | "running" | "finished" | "cancelled";

export type EventStatus = "scheduled" | "changed" | "cancelled";

export type GameType = "nlh" | "plo" | "plo5" | "mixed" | "other";

export interface CountryBrief {
  code: string;
  name_ru: string;
}

export interface CurrencyBrief {
  code: string;
  symbol: string;
}

export interface OrganizerBrief {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

export interface VenueBrief {
  id: string;
  name: string;
  city: string;
  country_code: string;
  zone: string | null;
  timezone: string;
  address: string | null;
}

export interface DateTimeWithTimezone {
  utc: string;
  venue_local: string;
  venue_timezone: string;
}

export interface FlightRead {
  id: string;
  label: string | null;
  start_at: DateTimeWithTimezone;
}

export interface BlindLevelRead {
  level_no: number;
  structure_set_label: string;
  sb: number | null;
  bb: number | null;
  ante: number | null;
  minutes: number;
  is_break: boolean;
  is_late_reg_end: boolean;
}

export interface EventSummary {
  id: string;
  slug: string;
  number: number | null;
  name: string;
  buyin: string;
  buyin_bounty: string | null;
  currency: CurrencyBrief;
  guarantee: string | null;
  game_type: GameType;
  tags: string[];
  status: EventStatus;
  start_stack: number | null;
  start_blinds: string | null;
  reentry_count: number | null;
  reentry_unlimited: boolean;
  late_reg_level: number | null;
  day_end_note: string | null;
  flights: FlightRead[];
}

export interface EventsDayGroup {
  date: string;
  events: EventSummary[];
}

export interface MinBuyinByCurrency {
  amount: string;
  currency: CurrencyBrief;
}

export interface SeriesHighlight {
  name: string;
  date: string;
}

export interface SeriesListItem {
  id: string;
  slug: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: SeriesStatus;
  poster_url: string | null;
  organizer: OrganizerBrief;
  venue: VenueBrief;
  country: CountryBrief;
  events_count: number;
  days_until_start: number | null;
  min_buyins: MinBuyinByCurrency[];
  today_events_count: number | null;
  highlight: SeriesHighlight | null;
}

export interface SeriesDetail extends SeriesListItem {
  description: string | null;
  links: Record<string, string>;
  events_by_day: EventsDayGroup[];
}

export interface EventDetail {
  id: string;
  slug: string;
  number: number | null;
  name: string;
  buyin: string;
  buyin_bounty: string | null;
  currency: CurrencyBrief;
  guarantee: string | null;
  game_type: GameType;
  tags: string[];
  start_stack: number | null;
  start_blinds: string | null;
  reentry_count: number | null;
  reentry_unlimited: boolean;
  late_reg_level: number | null;
  day_end_note: string | null;
  status: EventStatus;
  notes: string | null;
  series: SeriesListItem;
  venue: VenueBrief;
  country: CountryBrief;
  flights: FlightRead[];
  blind_levels: BlindLevelRead[];
}

export type ScheduleHighlight = "main" | "champ" | "sat" | "closed" | "normal";

export interface SeriesScheduleRow {
  event_id: string;
  event_slug: string;
  flight_id: string;
  number: number | null;
  name: string;
  flight_label: string | null;
  start_at: DateTimeWithTimezone;
  buyin: string;
  buyin_bounty: string | null;
  buyin_display: string;
  guarantee: string | null;
  guarantee_display: string | null;
  game_type: GameType;
  tags: string[];
  pdf_tags: string[];
  start_stack: number | null;
  late_reg_level: number | null;
  level_duration: string | null;
  day_end_note: string | null;
  highlight: ScheduleHighlight;
  status: EventStatus;
}

export interface SeriesScheduleDay {
  date: string;
  label: string;
  band_label: string;
  events_count: number;
  rows: SeriesScheduleRow[];
}

export interface SeriesScheduleResponse {
  id: string;
  slug: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: SeriesStatus;
  poster_url: string | null;
  organizer: OrganizerBrief;
  venue: VenueBrief;
  country: CountryBrief;
  currency: CurrencyBrief | null;
  total_guarantee: string | null;
  timezone_label: string;
  date_range_label: string;
  events_count: number;
  days: SeriesScheduleDay[];
  blinds_by_event?: Record<string, BlindLevelRead[]> | null;
}

export interface CalendarSeriesMarker {
  id: string;
  name: string;
  status: SeriesStatus;
  venue_city: string;
  is_start: boolean;
  is_end: boolean;
  is_bookmarked: boolean;
}

export interface CalendarSeriesItem extends SeriesListItem {
  is_bookmarked: boolean;
  coverage?: "full" | "partial" | null;
  overlap_starts_on?: string | null;
  overlap_ends_on?: string | null;
  events_in_period?: number | null;
  min_buyins_in_period?: MinBuyinByCurrency[] | null;
}

export interface CalendarDay {
  date: string;
  series: CalendarSeriesMarker[];
}

export interface CalendarResponse {
  month: string;
  from?: string | null;
  to?: string | null;
  days: CalendarDay[];
  series: CalendarSeriesItem[];
}

export interface ScheduleFiltersResponse {
  countries: CountryBrief[];
  zones: string[];
  organizers: OrganizerBrief[];
  statuses: SeriesStatus[];
  game_types: GameType[];
  tags: string[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SeriesTabCounts {
  all: number;
  running: number;
  archive: number;
}

export interface SeriesListResponse extends PaginatedResponse<SeriesListItem> {
  counts: SeriesTabCounts;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retry_after?: number | null;
    attempts_left?: number | null;
    active_session_id?: string | null;
    result_id?: string | null;
    server?: unknown;
  };
}

export type SeriesListStatusFilter = SeriesStatus | "actual" | "live_soon" | "upcoming";

export interface SeriesListParams {
  country_code?: string;
  country?: string;
  countries?: string;
  zone?: string;
  organizer_id?: string;
  organizer?: string;
  organizers?: string;
  venues?: string;
  status?: SeriesListStatusFilter;
  starts_from?: string;
  starts_to?: string;
  buyin_min?: string;
  buyin_max?: string;
  max_buyin?: string;
  buyin?: string;
  game_type?: GameType;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface FilterFacetCount {
  value: string;
  count: number;
}

export interface ScheduleFilterCountsResponse {
  total: number;
  countries: FilterFacetCount[];
  organizers: FilterFacetCount[];
  buyin: FilterFacetCount[];
}

export interface CalendarParams {
  month: string;
  from?: string;
  to?: string;
  country_code?: string;
  zone?: string;
  organizer_id?: string;
  status?: SeriesStatus;
  buyin_min?: string;
  buyin_max?: string;
  game_type?: GameType;
  tags?: string[];
}
