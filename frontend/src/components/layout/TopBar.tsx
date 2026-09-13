import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { HeaderProfileButton } from "@/components/layout/HeaderProfileButton";
import { useMe } from "@/features/auth/hooks";
import { buildLoginLocation } from "@/features/auth/lib/redirect";
import { useUnreadNotificationCount } from "@/features/notifications/hooks";

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0-6 6v4l-1.5 3h15L18 13V9a6 6 0 0 0-6-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

const iconBtnClass =
  "relative inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-md bg-surface-2 text-ink-2";

const iconClass =
  "h-5 w-5 stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

export function TopBar({ filters }: { filters?: ReactNode }) {
  const { data: user } = useMe();
  const unread = useUnreadNotificationCount({ enabled: Boolean(user) });
  const hasUnread = Boolean(user) && (unread.data?.count ?? 0) > 0;
  const notificationsTarget = user
    ? { pathname: "/notifications" }
    : buildLoginLocation("/notifications");

  return (
    <div className="border-line bg-bg/88 sticky top-0 z-20 border-b backdrop-blur-[14px]">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <div className="inline-flex items-center gap-1.5 text-[19px] font-extrabold tracking-tight">
          <img
            src="/icons/ginger-mark-96.png"
            alt=""
            aria-hidden="true"
            className="h-7 w-7 rounded-full"
          />
          Ginger
        </div>
        <div className="flex gap-2">
          <Link to="/search" className={iconBtnClass} aria-label="Поиск">
            <IconSearch className={iconClass} />
          </Link>
          <Link
            to={notificationsTarget.pathname}
            state={"state" in notificationsTarget ? notificationsTarget.state : undefined}
            className={iconBtnClass}
            aria-label="Уведомления"
          >
            <IconBell className={iconClass} />
            {hasUnread ? (
              <span
                className="bg-gold absolute top-2 right-2 h-2 w-2 rounded-full"
                data-testid="notifications-unread-dot"
              />
            ) : null}
          </Link>
          <HeaderProfileButton />
        </div>
      </div>
      {filters}
    </div>
  );
}
