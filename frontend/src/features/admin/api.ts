import { apiDelete, apiGet, apiPatch, apiPost, buildQuery } from "@/api/client";
import type {
  AdminUser,
  AdminUserRoleUpdatePayload,
  OrganizerAdmin,
  OrganizerCreatePayload,
  OrganizerUpdatePayload,
  PaginatedResponse,
} from "@/api/types/admin";
import type { UserRole } from "@/api/types/auth";

const ADMIN_PREFIX = "/api/v1/admin";

export interface AdminListParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface AdminUsersListParams extends AdminListParams {
  search?: string;
  role?: UserRole;
}

export function fetchAdminOrganizers(
  params: AdminListParams = {},
): Promise<PaginatedResponse<OrganizerAdmin>> {
  return apiGet(`${ADMIN_PREFIX}/organizers${buildQuery(params)}`);
}

export function createAdminOrganizer(body: OrganizerCreatePayload): Promise<OrganizerAdmin> {
  return apiPost(`${ADMIN_PREFIX}/organizers`, body);
}

export function updateAdminOrganizer(
  id: string,
  body: OrganizerUpdatePayload,
): Promise<OrganizerAdmin> {
  return apiPatch(`${ADMIN_PREFIX}/organizers/${id}`, body);
}

export function deleteAdminOrganizer(id: string): Promise<void> {
  return apiDelete(`${ADMIN_PREFIX}/organizers/${id}`);
}

export function fetchAdminUsers(
  params: AdminUsersListParams = {},
): Promise<PaginatedResponse<AdminUser>> {
  return apiGet(`${ADMIN_PREFIX}/users${buildQuery(params)}`);
}

export function updateAdminUserRole(
  id: string,
  body: AdminUserRoleUpdatePayload,
): Promise<AdminUser> {
  return apiPatch(`${ADMIN_PREFIX}/users/${id}/role`, body);
}
