import { Link, useLocation } from "react-router-dom";

import { buildLoginLocation } from "@/features/auth/lib/redirect";

export function DemoBanner({
  message = "Пример данных · войдите, чтобы вести свои",
  testId = "demo-banner",
}: {
  message?: string;
  testId?: string;
}) {
  const location = useLocation();
  const login = buildLoginLocation(`${location.pathname}${location.search}`);

  return (
    <div
      className="border-line-gold bg-gold-soft text-ink-2 mx-4 mt-3 flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] leading-tight"
      data-testid={testId}
    >
      <p className="min-w-0 flex-1">{message}</p>
      <Link
        to={login.pathname}
        state={login.state}
        className="text-gold shrink-0 font-bold"
      >
        Войти
      </Link>
    </div>
  );
}
