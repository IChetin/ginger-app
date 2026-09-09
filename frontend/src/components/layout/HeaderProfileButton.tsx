import { Link } from "react-router-dom";

import { useMe } from "@/features/auth/hooks";
import { buildLoginLocation } from "@/features/auth/lib/redirect";
import { cn } from "@/lib/utils";

const iconBtnClass =
  "relative inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-md bg-surface-2 text-ink-2";

const iconClass =
  "h-5 w-5 stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

export function HeaderProfileButton({ compact = false }: { compact?: boolean }) {
  const { data: user } = useMe();
  const target = user ? { pathname: "/profile" as const } : buildLoginLocation("/profile");

  return (
    <Link
      to={target.pathname}
      state={"state" in target ? target.state : undefined}
      className={cn(iconBtnClass, compact && "h-[38px] w-[38px]")}
      aria-label="Профиль"
      data-testid="header-profile"
    >
      <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5" />
      </svg>
    </Link>
  );
}
