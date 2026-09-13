import { Link } from "react-router-dom";

import { isStandalone } from "@/features/onboarding/platform";

/** Пока Ginger открыт во вкладке браузера — ненавязчиво, но постоянно (экраны §3.1). */
export function InstallPlaque() {
  if (isStandalone()) return null;
  return (
    <Link
      to="/install"
      data-testid="install-plaque"
      className="border-line-gold bg-gold-soft mt-2 flex items-center gap-2 rounded-md border px-3 py-2"
    >
      <span className="text-[18px]" aria-hidden="true">
        📲
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block text-[13px] font-bold">Установите Ginger на экран</span>
        <span className="text-ink-2 block text-[12px]">Иначе уведомления о фишках не придут</span>
      </span>
      <span className="text-gold text-[18px]" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
