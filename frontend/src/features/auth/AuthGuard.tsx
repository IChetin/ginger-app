import { Outlet } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useMe } from "@/api/auth";
import { DetailSkeleton } from "@/components/ui/DetailSkeleton";
import { AuthGate } from "@/features/auth/AuthGate";

/**
 * Личные разделы (фишки, диалоги, профиль). Гостя не выкидываем на /login — он остаётся в
 * приложении и видит на месте раздела приглашение войти (решение Ивана 14.09).
 */
export function AuthGuard() {
  const { data: user, isLoading, isError, error } = useMe();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <DetailSkeleton />
      </div>
    );
  }

  const guest = !user || (isError && error instanceof ApiError && error.status === 401);
  if (guest) {
    return (
      <div className="pt-10" data-testid="guest-gate">
        <AuthGate
          icon={
            <svg viewBox="0 0 24 24" className="fill-none stroke-current [stroke-width:1.8]">
              <rect x="5" y="10.5" width="14" height="10" rx="2" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
            </svg>
          }
          title="Войдите, чтобы продолжить"
          description="Фишки, диалоги с менеджером и профиль — для игроков клуба. Расписание, клубы и лента открыты всем."
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-danger mx-auto max-w-lg px-4 py-16 text-center">
        Не удалось проверить сессию.
      </div>
    );
  }

  return <Outlet />;
}
