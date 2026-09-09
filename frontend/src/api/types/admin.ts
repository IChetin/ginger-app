import type {
  CountryBrief,
  CurrencyBrief,
  DateTimeWithTimezone,
  EventStatus,
  GameType,
  OrganizerBrief,
  PaginatedResponse,
  SeriesStatus,
  VenueBrief,
} from "@/api/types/schedule";
import type { UserRole } from "@/api/types/auth";

export type { PaginatedResponse };

export interface AdminUser {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  is_superadmin: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface AdminUserRoleUpdatePayload {
  role: UserRole;
}

export interface VenueAdmin {
  id: string;
  country_code: string;
  city: string;
  name: string;
  slug: string;
  zone: string | null;
  timezone: string;
  address: string | null;
  lat: string | null;
  lng: string | null;
  logo_url: string | null;
  country: CountryBrief;
  series_count: number;
  created_at: string;
  updated_at: string;
}

export interface VenueCreatePayload {
  country_code: string;
  city: string;
  name: string;
  slug?: string | null;
  zone?: string | null;
  timezone: string;
  address?: string | null;
  lat?: string | null;
  lng?: string | null;
  logo_url?: string | null;
}

export interface VenueUpdatePayload {
  country_code?: string;
  city?: string;
  name?: string;
  slug?: string | null;
  zone?: string | null;
  timezone?: string;
  address?: string | null;
  lat?: string | null;
  lng?: string | null;
  logo_url?: string | null;
}

export interface OrganizerAdmin {
  id: string;
  name: string;
  slug: string;
  links: Record<string, string>;
  logo_url: string | null;
  series_count: number;
  schedule_parser_id: string | null;
  structure_parser_id: string | null;
  schedule_parser_code: string | null;
  structure_parser_code: string | null;
  schedule_parser_title: string | null;
  structure_parser_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizerCreatePayload {
  name: string;
  slug: string;
  links?: Record<string, string>;
  schedule_parser_id?: string | null;
  structure_parser_id?: string | null;
}

export interface OrganizerUpdatePayload {
  name?: string;
  slug?: string;
  links?: Record<string, string>;
  schedule_parser_id?: string | null;
  structure_parser_id?: string | null;
}

export type ChangeType = "created" | "updated" | "cancelled" | "schedule_published";

export interface ChangeLogAdmin {
  id: string;
  entity_type: string;
  entity_id: string;
  change_type: ChangeType;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor_id?: string | null;
  actor_email: string | null;
  actor_nickname: string | null;
  notified_at: string | null;
  created_at: string;
  series_id?: string | null;
  series_name?: string | null;
  event_id?: string | null;
  event_number?: number | null;
  event_name?: string | null;
  flight_label?: string | null;
  notifications_sent?: number;
  notifications_failed?: number;
  notifications_pending?: number;
  via_import?: boolean;
}

export interface ParserOrganizerBrief {
  id: string;
  name: string;
  slug: string;
}

export interface ParserInfo {
  id: string;
  name: string;
  title: string;
  kind: "schedule" | "structures" | string;
  organizer_slugs: string[];
  supported_types: string[];
  description: string;
  is_active: boolean;
  is_available: boolean;
  notes: string | null;
  organizers: ParserOrganizerBrief[];
  created_at: string | null;
  updated_at: string | null;
}

export interface ParserProfileUpdatePayload {
  title?: string;
  is_active?: boolean;
  notes?: string | null;
}

export interface ChangeLogListParams {
  limit?: number;
  offset?: number;
  entity_type?: string;
  change_type?: ChangeType;
  actor_id?: string;
  q?: string;
  period?: "7" | "30" | "all";
}

export interface DashboardAlertItem {
  id: string;
  label: string;
  series_id: string | null;
}

export interface DashboardAlertCount {
  count: number;
  items: DashboardAlertItem[];
}

export interface AdminDashboard {
  generated_at: string;
  attention: {
    imports_review: DashboardAlertCount;
    series_without_schedule: DashboardAlertCount;
    push_failed_24h: { count: number };
    stale_series: DashboardAlertCount;
  };
  kpis: {
    active_series: { value: number; running_now: number };
    events_next_7d: { value: number; series_count: number };
    users: { value: number; delta_7d: number };
    bookmarks: { value: number; delta_7d: number };
    push_24h: { sent: number; failed: number };
  };
  upcoming: Array<{
    kind: "flight" | "series" | string;
    start_at: string;
    local_time: string | null;
    title: string;
    subtitle: string;
    event_id: string | null;
    series_id: string;
    subscribers: number;
  }>;
  recent_changes: Array<{
    id: string;
    change_type: ChangeType;
    via_import: boolean;
    title: string;
    detail: string | null;
    created_at: string;
    series_id: string | null;
    event_id: string | null;
  }>;
  nav: {
    imports_review_count: number;
  };
}

export interface SeriesAdmin {
  id: string;
  slug: string;
  organizer_id: string;
  venue_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: SeriesStatus;
  poster_url: string | null;
  links: Record<string, string>;
  description: string | null;
  organizer: OrganizerBrief;
  venue: VenueBrief;
  country: CountryBrief;
  events_count: number;
  bookmarks_count: number;
  created_at: string;
  updated_at: string;
}

export interface SeriesCreatePayload {
  organizer_id: string;
  venue_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  poster_url?: string | null;
  links?: Record<string, string>;
  description?: string | null;
}

export interface SeriesUpdatePayload {
  slug?: string | null;
  organizer_id?: string;
  venue_id?: string;
  name?: string;
  starts_on?: string;
  ends_on?: string;
  status?: SeriesStatus;
  poster_url?: string | null;
  links?: Record<string, string>;
  description?: string | null;
}

export interface FlightAdmin {
  id: string;
  label: string | null;
  start_at: DateTimeWithTimezone;
  bookmarks_count: number;
}

export interface FlightUpsert {
  id?: string;
  label?: string | null;
  start_at: string;
}

export interface BlindLevelAdmin {
  id: string;
  level_no: number;
  structure_set_label: string;
  sb: number | null;
  bb: number | null;
  ante: number | null;
  minutes: number;
  is_break: boolean;
  is_late_reg_end: boolean;
}

export interface BlindLevelUpsert {
  id?: string;
  structure_set_label?: string;
  level_no: number;
  sb?: number | null;
  bb?: number | null;
  ante?: number | null;
  minutes: number;
  is_break: boolean;
  is_late_reg_end?: boolean;
}

export interface EventAdmin {
  id: string;
  slug: string;
  series_id: string;
  number: number | null;
  name: string;
  buyin: string;
  buyin_bounty: string | null;
  currency_code: string;
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
  flights: FlightAdmin[];
  blind_levels: BlindLevelAdmin[];
  bookmarks_count: number;
  created_at: string;
  updated_at: string;
}

export interface EventCreatePayload {
  number?: number | null;
  name: string;
  buyin: string;
  buyin_bounty?: string | null;
  currency_code: string;
  guarantee?: string | null;
  game_type?: GameType;
  tags?: string[];
  start_stack?: number | null;
  start_blinds?: string | null;
  reentry_count?: number | null;
  reentry_unlimited?: boolean;
  late_reg_level?: number | null;
  day_end_note?: string | null;
  notes?: string | null;
}

export interface EventUpdatePayload {
  slug?: string | null;
  number?: number | null;
  name?: string;
  buyin?: string;
  buyin_bounty?: string | null;
  currency_code?: string;
  guarantee?: string | null;
  game_type?: GameType;
  tags?: string[];
  start_stack?: number | null;
  start_blinds?: string | null;
  reentry_count?: number | null;
  reentry_unlimited?: boolean;
  late_reg_level?: number | null;
  day_end_note?: string | null;
  status?: EventStatus;
  notes?: string | null;
}
