import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ImportDraft, ImportListParams } from "@/api/types/imports";
import { scheduleKeys } from "@/features/schedule/api/queryKeys";
import {
  cancelImportJob,
  fetchImportJob,
  fetchImportJobs,
  fetchImportStats,
  previewImportPublish,
  publishImportJob,
  updateImportDraft,
  uploadImportJob,
  type UploadImportParams,
} from "@/features/admin/import/api";
import { importKeys } from "@/features/admin/import/queryKeys";
import { adminKeys } from "@/features/admin/queryKeys";

export function useImportJobs(params: ImportListParams = {}) {
  return useQuery({
    queryKey: importKeys.list(params),
    queryFn: () => fetchImportJobs(params),
  });
}

export function useImportJob(jobId: string | undefined) {
  return useQuery({
    queryKey: importKeys.detail(jobId ?? ""),
    queryFn: () => fetchImportJob(jobId!),
    enabled: Boolean(jobId),
  });
}

export function useImportStats() {
  return useQuery({
    queryKey: importKeys.stats(),
    queryFn: fetchImportStats,
  });
}

export function useUploadImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: UploadImportParams) => uploadImportJob(params),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: importKeys.all });
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "series"] });
      await queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
    },
  });
}

export function useUpdateImportDraft(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: ImportDraft) => updateImportDraft(jobId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: importKeys.detail(jobId) });
      await queryClient.invalidateQueries({ queryKey: importKeys.stats() });
    },
  });
}

export function usePreviewImportPublish(jobId: string) {
  return useMutation({
    mutationFn: () => previewImportPublish(jobId),
  });
}

export function usePublishImport(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previewToken: string) => publishImportJob(jobId, previewToken),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: importKeys.all });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesDetail(result.series_id) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesEvents(result.series_id) });
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
      await queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
    },
  });
}

export function useCancelImport(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelImportJob(jobId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: importKeys.all });
      await queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
    },
  });
}
