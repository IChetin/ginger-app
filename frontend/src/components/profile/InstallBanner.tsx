import { Link } from "react-router-dom";

import { isIosSafariInstallPromptVisible } from "@/lib/profile";

export function InstallBanner() {
  if (!isIosSafariInstallPromptVisible()) {
    return null;
  }

  return (
    <Link
      to="/install"
      className="border-line-gold bg-gold-soft mx-4 mb-2 flex items-center gap-3 rounded-md border p-3.5"
      data-testid="install-banner"
    >
      <span className="bg-gold-grad text-ink-ongold shadow-sheen flex h-10 w-10 shrink-0 -rotate-[4deg] items-center justify-center rounded-[12px] text-[17px] font-extrabold">
        2
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block text-[14px] font-bold">Установите Ginger на экран</span>
        <span className="text-ink-2 block text-[12px]">
          Иначе push-напоминания на iPhone не работают
        </span>
      </span>
      <svg
        className="stroke-gold h-5 w-5 shrink-0 fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
