import { Outlet } from "react-router-dom";

import { BottomNav } from "@/components/layout/BottomNav";
import { MobileLayoutHint } from "@/components/layout/MobileLayoutHint";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { useMe } from "@/features/auth/hooks";
import { useUnreadDialogs } from "@/features/threads/hooks";

export function AppShell() {
  const { data: user } = useMe();
  const dialogsUnread = useUnreadDialogs(Boolean(user));

  return (
    <div className="bg-stage text-ink min-h-screen" data-mobile-shell-outer>
      <ScrollToTop />
      <MobileLayoutHint />
      <div
        data-mobile-shell
        data-testid="mobile-shell"
        className="bg-bg relative mx-auto min-h-screen w-full max-w-[420px] overflow-x-clip pb-[110px]"
      >
        <Outlet />
        <BottomNav dialogsUnread={dialogsUnread} />
      </div>
    </div>
  );
}
