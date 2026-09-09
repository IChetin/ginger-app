import { Outlet } from "react-router-dom";

import { DetailSkeleton } from "@/features/schedule/components/QueryState";
import { isStaffUser, useMe } from "@/features/auth/hooks";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function AdminGuard() {
  const { data: user, isLoading, isError } = useMe();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <DetailSkeleton />
      </div>
    );
  }

  // Нет staff-роли (в т.ч. без сессии / ошибка me) → 404, без подсказки о разделе.
  if (isError || !isStaffUser(user)) {
    return <NotFoundPage />;
  }

  return <Outlet />;
}
