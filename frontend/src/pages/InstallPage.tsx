import { Link } from "react-router-dom";

import { InstallSteps } from "@/features/onboarding/InstallSteps";

/** Установка на экран «Домой» — с плашки на главной и из колокольчика турнира. */
export function InstallPage() {
  return (
    <main className="bg-bg text-ink mx-auto min-h-screen w-full max-w-[420px] px-4 py-6">
      <Link to="/" className="text-gold text-[13px] font-bold">
        ← Главная
      </Link>
      <div className="pt-6">
        <img src="/icons/ginger-mark-96.png" alt="" className="h-14 w-14 rounded-full" />
        <h1 className="mt-4 text-[23px] font-extrabold">Установите Ginger</h1>
        <p className="text-ink-2 mt-1.5 mb-4 text-[14px]">
          На iPhone уведомления работают только у приложения на домашнем экране. На Android — тоже
          надёжнее: приложение не потеряется среди вкладок.
        </p>
        <InstallSteps />
      </div>
    </main>
  );
}
