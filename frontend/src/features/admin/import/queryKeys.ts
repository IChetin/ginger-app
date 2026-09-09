import type { ImportListParams } from "@/api/types/imports";
import { adminKeys } from "@/features/admin/queryKeys";

export const importKeys = {
  all: [...adminKeys.all, "import"] as const,
  list: (params: ImportListParams = {}) => [...importKeys.all, "list", params] as const,
  detail: (jobId: string) => [...importKeys.all, "detail", jobId] as const,
  stats: () => [...importKeys.all, "stats"] as const,
};
