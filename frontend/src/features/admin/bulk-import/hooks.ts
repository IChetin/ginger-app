import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { scheduleKeys } from "@/features/schedule/api/queryKeys";
import {
  fetchBulkJob,
  fetchBulkJobs,
  previewBulkImport,
  publishBulkImport,
  uploadBulkJob,
  type BulkListParams,
  type PublishBulkParams,
} from "@/features/admin/bulk-import/api";
import { bulkImportKeys } from "@/features/admin/bulk-import/queryKeys";
import { adminKeys } from "@/features/admin/queryKeys";

export function useBulkJobs(params: BulkListParams = {}) {
  return useQuery({
    queryKey: bulkImportKeys.list(params),
    queryFn: () => fetchBulkJobs(params),
  });
}

export function useBulkJob(jobId: string | undefined) {
  return useQuery({
    queryKey: bulkImportKeys.detail(jobId ?? ""),
    queryFn: () => fetchBulkJob(jobId!),
    enabled: Boolean(jobId),
  });
}

export function useUploadBulkImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadBulkJob(file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bulkImportKeys.all });
      await queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
    },
  });
}

export function useBulkPreview(
  jobId: string,
  markMissingCancelled: boolean,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: bulkImportKeys.preview(jobId, markMissingCancelled),
    queryFn: () => previewBulkImport(jobId, markMissingCancelled),
    enabled: options.enabled ?? true,
    // Токен предпросмотра живёт недолго и привязан к состоянию базы: кэшировать нечего.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
  });
}

export function usePublishBulkImport(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: PublishBulkParams) => publishBulkImport(jobId, params),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bulkImportKeys.all });
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "series"] });
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
      await queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
    },
  });
}
