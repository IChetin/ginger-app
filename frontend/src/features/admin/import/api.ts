import { apiGet, apiPost, apiPostForm, apiPut, buildQuery, withPreviewToken } from "@/api/client";
import type { PaginatedResponse } from "@/api/types/admin";
import type {
  ImportDraft,
  ImportJob,
  ImportKind,
  ImportListParams,
  ImportPublishPreview,
  ImportPublishResponse,
  ImportStats,
} from "@/api/types/imports";

const PREFIX = "/api/v1/admin/import";

export interface UploadImportParams {
  file: File;
  importKind?: ImportKind;
  seriesId?: string;
  createSeries?: boolean;
  organizerId?: string;
  venueId?: string;
  seriesName?: string;
  startsOn?: string;
  endsOn?: string;
  fileTimezone?: string;
  parserRequested?: string;
}

export function fetchImportJobs(
  params: ImportListParams = {},
): Promise<PaginatedResponse<ImportJob>> {
  return apiGet(`${PREFIX}${buildQuery(params)}`);
}

export function fetchImportJob(jobId: string): Promise<ImportJob> {
  return apiGet(`${PREFIX}/${jobId}`);
}

export function fetchImportStats(): Promise<ImportStats> {
  return apiGet(`${PREFIX}/stats`);
}

export function uploadImportJob(params: UploadImportParams): Promise<ImportJob> {
  const form = new FormData();
  form.set("file", params.file);
  form.set("import_kind", params.importKind ?? "schedule");
  if (params.createSeries) {
    form.set("create_series", "true");
    if (params.organizerId) form.set("organizer_id", params.organizerId);
    if (params.venueId) form.set("venue_id", params.venueId);
    if (params.seriesName) form.set("series_name", params.seriesName);
    if (params.startsOn) form.set("starts_on", params.startsOn);
    if (params.endsOn) form.set("ends_on", params.endsOn);
  } else if (params.seriesId) {
    form.set("series_id", params.seriesId);
  }
  if (params.fileTimezone) {
    form.set("file_timezone", params.fileTimezone);
  }
  if (params.parserRequested) {
    form.set("parser_requested", params.parserRequested);
  }
  return apiPostForm(PREFIX, form);
}

export function updateImportDraft(jobId: string, draft: ImportDraft): Promise<ImportJob> {
  return apiPut(`${PREFIX}/${jobId}/draft`, { draft });
}

export function previewImportPublish(jobId: string): Promise<ImportPublishPreview> {
  return apiPost(`${PREFIX}/${jobId}/publish/preview`);
}

export function publishImportJob(
  jobId: string,
  previewToken: string,
): Promise<ImportPublishResponse> {
  return apiPost(
    `${PREFIX}/${jobId}/publish`,
    undefined,
    withPreviewToken(undefined, previewToken),
  );
}

export function cancelImportJob(jobId: string): Promise<ImportJob> {
  return apiPost(`${PREFIX}/${jobId}/cancel`);
}
