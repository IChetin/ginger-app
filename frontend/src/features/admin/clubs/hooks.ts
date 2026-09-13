import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteClubTemplate,
  fetchAdminClubs,
  fetchClubTemplates,
  fetchClubTemplatesNow,
  importClubTemplates,
} from "@/features/admin/clubs/api";

const keys = {
  clubs: ["admin", "clubs"] as const,
  templates: (clubId: string) => ["admin", "clubs", clubId, "templates"] as const,
};

export function useAdminClubs() {
  return useQuery({ queryKey: keys.clubs, queryFn: fetchAdminClubs });
}

export function useClubTemplates(clubId: string | null) {
  return useQuery({
    queryKey: keys.templates(clubId ?? ""),
    queryFn: () => fetchClubTemplates(clubId ?? ""),
    enabled: Boolean(clubId),
  });
}

export function useImportClubTemplates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { clubId: string; file: File; dryRun: boolean }) =>
      importClubTemplates(vars.clubId, vars.file, vars.dryRun),
    onSuccess: async (result) => {
      if (!result.dry_run) {
        await queryClient.invalidateQueries({ queryKey: keys.clubs });
        await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      }
    },
  });
}

export function useFetchClubTemplatesNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clubId: string) => fetchClubTemplatesNow(clubId),
    onSettled: async (_result, _error, clubId) => {
      // Ошибка тоже пишется в клуб — перечитываем в любом случае.
      await queryClient.invalidateQueries({ queryKey: keys.clubs });
      await queryClient.invalidateQueries({ queryKey: keys.templates(clubId) });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}

export function useDeleteClubTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { clubId: string; templateId: string }) =>
      deleteClubTemplate(vars.clubId, vars.templateId),
    onSuccess: async (_result, vars) => {
      await queryClient.invalidateQueries({ queryKey: keys.templates(vars.clubId) });
      await queryClient.invalidateQueries({ queryKey: keys.clubs });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}
