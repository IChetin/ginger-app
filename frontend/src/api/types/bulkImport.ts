import type { ImportStatus } from "@/api/types/imports";
import type { NotificationPreviewImpact } from "@/api/types/notifications";

export type BulkIssueSeverity = "error" | "warning";
export type BulkAction = "create" | "update" | "unchanged" | "missing";

export interface BulkIssue {
  severity: BulkIssueSeverity;
  code: string;
  message: string;
  row: number | null;
  column: string | null;
  field: string | null;
  series_key: string | null;
}

export interface BulkPublishReport {
  series_created: number;
  series_updated: number;
  events_created: number;
  events_updated: number;
  events_cancelled: number;
  flights_created: number;
  flights_updated: number;
  organizers_created: string[];
  venues_created: string[];
  countries_created: string[];
  notifications_enqueued: number;
  notifications_suppressed: boolean;
}

export interface BulkImportDraft {
  kind: "bulk_xlsx";
  issues: BulkIssue[];
  demo_rows_skipped: number[];
  empty_rows_skipped: number;
  rows_total: number;
  report: BulkPublishReport | null;
}

export interface BulkJob {
  id: string;
  status: ImportStatus;
  original_filename: string;
  file_size: number;
  file_sha256: string;
  draft: BulkImportDraft | null;
  error: string | null;
  created_at: string;
  published_at: string | null;
}

export interface BulkFieldDiff {
  field: string;
  label: string;
  old_value: string | null;
  new_value: string | null;
}

export interface BulkFlightPlan {
  label: string | null;
  action: BulkAction;
  starts_at_local: string | null;
  diffs: BulkFieldDiff[];
}

export interface BulkEventPlan {
  import_key: string | null;
  name: string;
  action: BulkAction;
  diffs: BulkFieldDiff[];
  flights: BulkFlightPlan[];
  recipients: number;
}

export interface BulkSeriesPlan {
  import_key: string;
  name: string;
  action: BulkAction;
  series_id: string | null;
  diffs: BulkFieldDiff[];
  events: BulkEventPlan[];
  recipients: number;
  warnings: BulkIssue[];
}

export interface BulkNewVenue {
  name: string;
  city: string;
  country_code: string;
  timezone: string;
}

export interface BulkNewReferences {
  organizers: string[];
  venues: BulkNewVenue[];
  countries: string[];
}

export interface BulkCounts {
  created: number;
  updated: number;
  unchanged: number;
  missing: number;
}

export interface BulkPreview {
  preview_token: string;
  expires_in_seconds: number;
  job_id: string;
  mark_missing_cancelled: boolean;
  series: BulkCounts;
  events: BulkCounts;
  flights: BulkCounts;
  plans: BulkSeriesPlan[];
  new_references: BulkNewReferences;
  impacts: NotificationPreviewImpact[];
  total_recipients: number;
  issues: BulkIssue[];
  can_publish: boolean;
}

export interface BulkPublishResult {
  job_id: string;
  report: BulkPublishReport;
}
