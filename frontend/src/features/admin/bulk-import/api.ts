import { apiGet, apiPost, apiPostForm, buildQuery, withPreviewToken } from "@/api/client";
import type { PaginatedResponse } from "@/api/types/admin";
import type { BulkJob, BulkPreview, BulkPublishResult } from "@/api/types/bulkImport";

const PREFIX = "/api/v1/admin/import/bulk";

export const TEMPLATE_URL = "/day2_series_upload.xlsx";

export interface BulkListParams {
  limit?: number;
  offset?: number;
}

export function fetchBulkJobs(params: BulkListParams = {}): Promise<PaginatedResponse<BulkJob>> {
  return apiGet(`${PREFIX}${buildQuery(params)}`);
}

export function fetchBulkJob(jobId: string): Promise<BulkJob> {
  return apiGet(`${PREFIX}/${jobId}`);
}

export function uploadBulkJob(file: File): Promise<BulkJob> {
  const form = new FormData();
  form.set("file", file);
  return apiPostForm(PREFIX, form);
}

export function previewBulkImport(
  jobId: string,
  markMissingCancelled: boolean,
): Promise<BulkPreview> {
  return apiPost(
    `${PREFIX}/${jobId}/preview${buildQuery({ mark_missing_cancelled: markMissingCancelled })}`,
  );
}

export interface PublishBulkParams {
  previewToken: string;
  markMissingCancelled: boolean;
  notify: boolean;
}

export function publishBulkImport(
  jobId: string,
  params: PublishBulkParams,
): Promise<BulkPublishResult> {
  return apiPost(
    `${PREFIX}/${jobId}/publish${buildQuery({
      mark_missing_cancelled: params.markMissingCancelled,
    })}`,
    undefined,
    withPreviewToken(undefined, params.previewToken, params.notify),
  );
}
