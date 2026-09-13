import type { AdminListParams, AdminUsersListParams } from "@/features/admin/api";

export const adminKeys = {
  all: ["admin"] as const,
  organizers: (params: AdminListParams = {}) => [...adminKeys.all, "organizers", params] as const,
  users: (params: AdminUsersListParams = {}) => [...adminKeys.all, "users", params] as const,
};
