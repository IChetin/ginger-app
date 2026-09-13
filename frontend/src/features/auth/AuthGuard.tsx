import { Navigate, Outlet, useLocation } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useMe } from "@/api/auth";
import { buildLoginLocation } from "@/features/auth/lib/redirect";
import { DetailSkeleton } from "@/components/ui/DetailSkeleton";

export function AuthGuard() {
  const location = useLocation();
  const { data: user, isLoading, isError, error } = useMe();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <DetailSkeleton />
      </div>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.status === 401) {
      const login = buildLoginLocation(location.pathname + location.search);
      return <Navigate to={login.pathname} state={login.state} replace />;
    }
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-rose-200">
        Не удалось проверить сессию.
      </div>
    );
  }

  if (!user) {
    const login = buildLoginLocation(location.pathname + location.search);
    return <Navigate to={login.pathname} state={login.state} replace />;
  }

  return <Outlet />;
}
