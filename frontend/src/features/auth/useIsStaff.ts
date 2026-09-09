import { isStaffUser, useMe } from "@/features/auth/hooks";

/**
 * Staff (admin|editor) gate for UI entry points.
 * Returns false while /me has no settled data — no flash for regular users.
 */
export function useIsStaff(): boolean {
  const { data: user, isPending } = useMe();
  if (isPending) {
    return false;
  }
  return isStaffUser(user);
}
