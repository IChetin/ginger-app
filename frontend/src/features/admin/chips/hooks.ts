import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acceptChipRequest,
  completeChipRequest,
  createInvite,
  createRequisiteTemplate,
  fetchAdminChipRequest,
  fetchAdminChipRequests,
  fetchAdminPlayers,
  fetchInvites,
  fetchPendingAccounts,
  fetchRequisiteTemplates,
  rejectChipRequest,
  revokeInvite,
  reviewAccount,
  sendRequisites,
  updateAdminPlayer,
  updateRequisiteTemplate,
  type ChipRequestAdmin,
  type RequestScope,
} from "@/features/admin/chips/api";
import { isOpen } from "@/features/chips/lib/format";

const keys = {
  requests: (scope: RequestScope) => ["admin", "chip-requests", scope] as const,
  request: (id: string) => ["admin", "chip-request", id] as const,
  templates: ["admin", "requisite-templates"] as const,
  players: ["admin", "players"] as const,
  pending: ["admin", "pending-accounts"] as const,
  invites: ["admin", "invites"] as const,
};

/** Очередь живая: заявки приходят круглосуточно, менеджер держит экран открытым. */
export function useAdminChipRequests(scope: RequestScope) {
  return useQuery({
    queryKey: keys.requests(scope),
    queryFn: () => fetchAdminChipRequests(scope),
    refetchInterval: 15_000,
  });
}

export function useAdminChipRequest(id: string) {
  return useQuery({
    queryKey: keys.request(id),
    queryFn: () => fetchAdminChipRequest(id),
    refetchInterval: (query) =>
      query.state.data && isOpen(query.state.data.status) ? 10_000 : false,
  });
}

export function useChipRequestAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      action:
        | { type: "accept" }
        | { type: "complete" }
        | { type: "reject"; comment: string }
        | { type: "requisites"; templateId?: string; text?: string },
    ): Promise<ChipRequestAdmin> => {
      switch (action.type) {
        case "accept":
          return acceptChipRequest(id);
        case "complete":
          return completeChipRequest(id);
        case "reject":
          return rejectChipRequest(id, action.comment);
        case "requisites":
          return sendRequisites(
            id,
            action.templateId ? { template_id: action.templateId } : { text: action.text },
          );
      }
    },
    onSuccess: async (request) => {
      queryClient.setQueryData(keys.request(id), request);
      await queryClient.invalidateQueries({ queryKey: ["admin", "chip-requests"] });
    },
  });
}

export function useRequisiteTemplates() {
  return useQuery({ queryKey: keys.templates, queryFn: fetchRequisiteTemplates });
}

export function useSaveRequisiteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      vars: { id?: undefined; title: string; body: string } | { id: string; is_active: boolean },
    ) =>
      "is_active" in vars
        ? updateRequisiteTemplate(vars.id, { is_active: vars.is_active })
        : createRequisiteTemplate({ title: vars.title, body: vars.body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.templates });
    },
  });
}

export function useAdminPlayers() {
  return useQuery({ queryKey: keys.players, queryFn: fetchAdminPlayers });
}

export function useUpdateAdminPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Parameters<typeof updateAdminPlayer>[1] }) =>
      updateAdminPlayer(vars.id, vars.body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.players });
      await queryClient.invalidateQueries({ queryKey: ["admin", "player-card"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "crm-summary"] });
    },
  });
}

export function usePendingAccounts() {
  return useQuery({
    queryKey: keys.pending,
    queryFn: fetchPendingAccounts,
    refetchInterval: 30_000,
  });
}

export function useReviewAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; approve: boolean }) => reviewAccount(vars.id, vars.approve),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.pending });
      await queryClient.invalidateQueries({ queryKey: keys.players });
    },
  });
}

export function useInvites() {
  return useQuery({ queryKey: keys.invites, queryFn: fetchInvites });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInvite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.invites });
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeInvite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.invites });
    },
  });
}
