import { Outlet } from "react-router-dom";

import { isAdminUser, useMe } from "@/features/admin/hooks";
import { NotFoundPage } from "@/pages/NotFoundPage";

/** Только admin. Editor и прочие получают 404 приложения. */
export function AdminRoleGuard() {
  const { data: user } = useMe();

  if (!isAdminUser(user)) {
    return <NotFoundPage />;
  }

  return <Outlet />;
}
