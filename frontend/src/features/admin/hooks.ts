import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAdminOrganizer,
  deleteAdminOrganizer,
  fetchAdminOrganizers,
  fetchAdminUsers,
  updateAdminOrganizer,
  updateAdminUserRole,
  type AdminListParams,
  type AdminUsersListParams,
} from "@/features/admin/api";
import { adminKeys } from "@/features/admin/queryKeys";
import {
  isAdminUser,
  isStaffUser,
  useLogin,
  useLogout,
  useMe,
  useRequestCode,
} from "@/features/auth/hooks";
import { authKeys } from "@/features/auth/queryKeys";

export { isAdminUser, isStaffUser, useLogin, useLogout, useMe, useRequestCode };

export function useUsersAdmin(
  params: AdminUsersListParams = { limit: 50, offset: 0 },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => fetchAdminUsers(params),
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateAdminUserRole>[1] }) =>
      updateAdminUserRole(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useOrganizersAdmin(params: AdminListParams = { limit: 100, offset: 0 }) {
  return useQuery({
    queryKey: adminKeys.organizers(params),
    queryFn: () => fetchAdminOrganizers(params),
  });
}

export function useCreateOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAdminOrganizer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizers() });
    },
  });
}

export function useUpdateOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateAdminOrganizer>[1] }) =>
      updateAdminOrganizer(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizers() });
    },
  });
}

export function useDeleteOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminOrganizer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizers() });
    },
  });
}
