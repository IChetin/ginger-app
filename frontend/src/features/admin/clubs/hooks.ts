import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchAdminClubs,
  fetchClubTemplates,
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
