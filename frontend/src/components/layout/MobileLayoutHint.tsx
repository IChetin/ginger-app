import { useEffect, useState } from "react";

import { applyMobileLayoutFix, isBrokenMobileLayout } from "@/lib/mobileLayoutFix";

export function MobileLayoutHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => {
      applyMobileLayoutFix();
      setVisible(isBrokenMobileLayout());
    };

    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <>
      <div
        className="border-line-gold bg-surface-2 text-ink fixed inset-x-0 top-0 z-50 border-b px-4 py-3 text-center text-[13px] leading-snug"
        role="status"
      >
        Отключите «Версия для ПК» в меню Chrome (⋮) — иначе сайт отображается слишком мелко.
      </div>
      <div className="h-[52px] shrink-0" aria-hidden="true" />
    </>
  );
}
