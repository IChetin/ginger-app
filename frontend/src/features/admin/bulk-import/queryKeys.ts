import type { BulkListParams } from "@/features/admin/bulk-import/api";
import { adminKeys } from "@/features/admin/queryKeys";

export const bulkImportKeys = {
  all: [...adminKeys.all, "bulk-import"] as const,
  list: (params: BulkListParams = {}) => [...bulkImportKeys.all, "list", params] as const,
  detail: (jobId: string) => [...bulkImportKeys.all, "detail", jobId] as const,
  preview: (jobId: string, markMissingCancelled: boolean) =>
    [...bulkImportKeys.all, "preview", jobId, markMissingCancelled] as const,
};
