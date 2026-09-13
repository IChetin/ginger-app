import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChipRequest, ChipRequestCreatePayload } from "@/api/types/chips";
import {
  addPlayerAccount,
  createChipRequest,
  fetchChipRequest,
  fetchChipRequests,
  fetchPlayerMe,
  fetchPublicClubs,
  fetchReferral,
  rotateReferral,
  uploadScreenshot,
} from "@/features/chips/api";
import { isOpen } from "@/features/chips/lib/format";

export const chipsKeys = {
  player: ["chips", "player"] as const,
  requests: ["chips", "requests"] as const,
  request: (id: string) => ["chips", "request", id] as const,
  clubs: ["chips", "clubs"] as const,
  referral: ["chips", "referral"] as const,
};

export function usePlayerMe() {
  return useQuery({ queryKey: chipsKeys.player, queryFn: fetchPlayerMe, retry: false });
}

/** Пока есть незакрытые заявки — опрашиваем: пуш не приходит, если игрок в приложении. */
export function useChipRequests(enabled = true) {
  return useQuery({
    queryKey: chipsKeys.requests,
    queryFn: fetchChipRequests,
    enabled,
    refetchInterval: (query) =>
      query.state.data?.some((item) => isOpen(item.status)) ? 15_000 : false,
  });
}

export function useChipRequest(id: string) {
  return useQuery({
    queryKey: chipsKeys.request(id),
    queryFn: () => fetchChipRequest(id),
    refetchInterval: (query) =>
      query.state.data && isOpen(query.state.data.status) ? 10_000 : false,
  });
}

function useStoreRequest() {
  const queryClient = useQueryClient();
  return async (request: ChipRequest) => {
    queryClient.setQueryData(chipsKeys.request(request.id), request);
    await queryClient.invalidateQueries({ queryKey: chipsKeys.requests });
  };
}

export function useCreateChipRequest() {
  const store = useStoreRequest();
  return useMutation({
    mutationFn: (body: ChipRequestCreatePayload) => createChipRequest(body),
    onSuccess: store,
  });
}

export function useUploadScreenshot(id: string) {
  const store = useStoreRequest();
  return useMutation({
    mutationFn: (vars: { file: Blob; filename: string }) =>
      uploadScreenshot(id, vars.file, vars.filename),
    onSuccess: store,
  });
}

export function useAddPlayerAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addPlayerAccount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: chipsKeys.player });
    },
  });
}

export function useReferral() {
  return useQuery({ queryKey: chipsKeys.referral, queryFn: fetchReferral });
}

export function useRotateReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rotateReferral,
    onSuccess: (referral) => queryClient.setQueryData(chipsKeys.referral, referral),
  });
}

export function usePublicClubs() {
  return useQuery({ queryKey: chipsKeys.clubs, queryFn: fetchPublicClubs, staleTime: 5 * 60_000 });
}
