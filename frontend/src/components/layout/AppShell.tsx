import { Outlet, useLocation, matchPath } from "react-router-dom";

import { BottomNav } from "@/components/layout/BottomNav";
import { MobileLayoutHint } from "@/components/layout/MobileLayoutHint";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { UserTimezoneSync } from "@/components/layout/UserTimezoneSync";
import { useMe } from "@/features/auth/hooks";
import { EnableRemindersBanner } from "@/features/push/components/EnableRemindersBanner";
import { useUnreadDialogs } from "@/features/threads/hooks";
import { cn } from "@/lib/utils";

export function AppShell() {
  const location = useLocation();
  const { data: user } = useMe();
  const dialogsUnread = useUnreadDialogs(Boolean(user));
  const hideBottomNav = Boolean(
    matchPath({ path: "/events/:eventId", end: true }, location.pathname) ||
    location.pathname === "/search" ||
    location.pathname === "/notifications",
  );
  const hidePushBanner =
    location.pathname === "/profile" ||
    location.pathname === "/search" ||
    location.pathname === "/notifications";

  return (
    <div className="bg-stage text-ink min-h-screen" data-mobile-shell-outer>
      <ScrollToTop />
      <UserTimezoneSync />
      <MobileLayoutHint />
      <div
        data-mobile-shell
        data-testid="mobile-shell"
        className={cn(
          "bg-bg relative mx-auto min-h-screen w-full max-w-[420px] overflow-x-clip",
          hideBottomNav ? "pb-0" : "pb-[110px]",
        )}
      >
        {hidePushBanner ? null : (
          <div className="px-4 empty:hidden">
            <EnableRemindersBanner />
          </div>
        )}
        <Outlet />
        {hideBottomNav ? null : <BottomNav dialogsUnread={dialogsUnread} />}
      </div>
    </div>
  );
}
