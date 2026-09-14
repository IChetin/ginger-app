import { apiDelete, apiGet, apiPost, apiPostForm } from "@/api/client";
import type { BountyKind, PokerApp } from "@/api/types/tournaments";

const ADMIN = "/api/v1/admin";

export interface AdminClub {
  id: string;
  name: string;
  slug: string;
  app: PokerApp;
  organizer_name: string | null;
  chip_value: string | null;
  chip_currency_code: string | null;
  is_visible: boolean;
  templates_count: number;
  schedule_source_url: string | null;
  schedule_fetched_at: string | null;
  schedule_fetch_error: string | null;
}

export interface TemplateAdmin {
  id: string;
  name: string;
  bounty_kind: BountyKind;
  buyin: string;
  guarantee: string | null;
  ticket_value: string | null;
  satellite_target: string | null;
  lobby_name?: string | null;
  weekdays: number[];
  start_time: string;
  valid_from: string | null;
  valid_until: string | null;
  month_week: number | null;
  source: string | null;
  is_active: boolean;
}

export interface ParseIssue {
  row: number | null;
  message: string;
}

export interface TemplatesImportResult {
  dry_run: boolean;
  rows_total: number;
  templates_parsed: number;
  issues: ParseIssue[];
  templates_created: number;
  templates_updated: number;
  templates_unchanged: number;
  templates_removed: number;
  tournaments_created: number;
  tournaments_updated: number;
  tournaments_deleted: number;
  tournaments_detached_kept: number;
}

export function fetchAdminClubs(): Promise<AdminClub[]> {
  return apiGet(`${ADMIN}/clubs`);
}

export function fetchClubTemplates(clubId: string): Promise<TemplateAdmin[]> {
  return apiGet(`${ADMIN}/clubs/${clubId}/templates`);
}

export function importClubTemplates(
  clubId: string,
  file: File,
  dryRun: boolean,
): Promise<TemplatesImportResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("dry_run", dryRun ? "true" : "false");
  return apiPostForm(`${ADMIN}/clubs/${clubId}/templates/import`, form);
}

export function fetchClubTemplatesNow(clubId: string): Promise<TemplatesImportResult> {
  return apiPost(`${ADMIN}/clubs/${clubId}/templates/fetch`);
}

export interface TemplateDeleteResult {
  tournaments_deleted: number;
}

export function deleteClubTemplate(
  clubId: string,
  templateId: string,
): Promise<TemplateDeleteResult> {
  return apiDelete(`${ADMIN}/clubs/${clubId}/templates/${templateId}`, { allowEmpty: false });
}
