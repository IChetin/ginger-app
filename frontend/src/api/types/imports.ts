import type { GameType } from "@/api/types/schedule";

export type ImportStatus = "uploaded" | "parsing" | "review" | "published" | "failed";
export type ImportKind = "schedule" | "structures";
export type ParsePath = "code" | "ai" | "mixed";
export type DetectedType = "xlsx" | "csv" | "pdf" | "image";

export interface DraftCellIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
  code?: string | null;
}

export interface DraftFlight {
  label?: string | null;
  play_date: string;
  play_time: string;
  confidence?: string | null;
  source_row?: number | null;
  source_sheet?: string | null;
  source_page?: number | null;
  source_cell?: string | null;
  source_fragment?: string | null;
}

export interface DraftEvent {
  number?: number | null;
  name: string;
  buyin: string;
  buyin_bounty?: string | null;
  currency_code: string;
  guarantee?: string | null;
  game_type?: GameType;
  tags?: string[];
  start_stack?: number | null;
  reentry_count?: number | null;
  reentry_unlimited?: boolean;
  late_reg_level?: number | null;
  day_end_note?: string | null;
  notes?: string | null;
  flights: DraftFlight[];
  field_confidence?: Record<string, string>;
  issues?: DraftCellIssue[];
  parse_path?: ParsePath | null;
  source_row?: number | null;
  source_sheet?: string | null;
  source_page?: number | null;
  source_cell?: string | null;
  source_fragment?: string | null;
}

export interface DraftBlindLevel {
  level_no: number;
  sb?: number | null;
  bb?: number | null;
  ante?: number | null;
  minutes: number;
  is_break: boolean;
  is_late_reg_end: boolean;
}

export interface DraftStructureSet {
  label: string;
  levels: DraftBlindLevel[];
}

export interface DraftStructure {
  source_title: string;
  parsed_buyin?: string | null;
  parsed_start_stack?: number | null;
  parsed_late_reg_level?: number | null;
  notes?: string | null;
  structure_sets: DraftStructureSet[];
  matched_event_id?: string | null;
  match_confidence?: string | null;
  selected: boolean;
  is_shared_satellites: boolean;
  shared_event_ids: string[];
  issues?: DraftCellIssue[];
  source_page?: number | null;
}

export interface ScheduleImportDraft {
  kind: "schedule";
  events: DraftEvent[];
  unparsed_rows?: string[];
  confidence?: string | null;
  issues?: DraftCellIssue[];
  series_notes?: string | null;
}

export interface StructureImportDraft {
  kind: "structures";
  structures: DraftStructure[];
  unparsed_rows?: string[];
  confidence?: string | null;
  issues?: DraftCellIssue[];
}

export type ImportDraft = ScheduleImportDraft | StructureImportDraft;

export interface ImportJob {
  id: string;
  status: ImportStatus;
  import_kind: ImportKind;
  original_filename: string;
  content_type: string;
  file_size: number;
  file_sha256: string;
  detected_type: DetectedType | string;
  organizer_id: string | null;
  series_id: string | null;
  file_timezone: string | null;
  parser_requested: string | null;
  parser_used: string | null;
  parse_path: ParsePath | null;
  parser_mismatch_reason?: string | null;
  confidence: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  estimated_cost_usd: string | null;
  fields_total: number | null;
  fields_corrected: number | null;
  draft: ImportDraft | null;
  error: string | null;
  created_at: string;
  published_at: string | null;
}

export interface ImportPublishPreview {
  preview_token: string;
  expires_in_seconds: number;
  entity_type: "import";
  entity_id: string;
  series_id: string;
  import_kind?: ImportKind;
  diffs: { field: string; old_value: unknown; new_value: unknown }[];
  impacts: {
    type: string;
    title: string;
    body: string;
    url: string;
    recipient_count: number;
  }[];
  total_recipients: number;
  requires_confirmation: boolean;
  events_to_create: number;
  structures_to_apply?: number;
}

export interface ImportPublishResponse {
  import_job_id: string;
  series_id: string;
  events_created: number;
  structures_applied: number;
}

export interface ImportStats {
  total: number;
  by_status: Record<string, number>;
  by_parse_path: Record<string, number>;
  by_parser: Record<string, number>;
  by_kind?: Record<string, number>;
  success_rate: string | null;
  avg_confidence: string | null;
  tokens_input: number;
  tokens_output: number;
  estimated_cost_usd: string;
  avg_correction_ratio: string | null;
}

export interface ImportListParams {
  limit?: number;
  offset?: number;
  status?: ImportStatus;
}
