import type { UserRole } from "@/api/types/auth";
import type { PaginatedResponse } from "@/api/types/common";

export type { PaginatedResponse };

export interface AdminUser {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  is_superadmin: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface AdminUserRoleUpdatePayload {
  role: UserRole;
}

/** Союз клубов (NUTS, Black Sea, Poker21): название и ссылки. */
export interface OrganizerAdmin {
  id: string;
  name: string;
  slug: string;
  links: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface OrganizerCreatePayload {
  name: string;
  slug: string;
  links?: Record<string, string>;
}

export interface OrganizerUpdatePayload {
  name?: string;
  slug?: string;
  links?: Record<string, string>;
}
