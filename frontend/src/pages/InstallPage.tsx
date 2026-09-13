import { Link } from "react-router-dom";

export function InstallPage() {
  return (
    <main className="bg-bg text-ink mx-auto min-h-screen w-full max-w-[420px] px-4 py-6">
      <Link to="/profile" className="text-gold text-[13px] font-bold">
        ← Профиль
      </Link>
      <div className="pt-10 text-center">
        <div className="bg-gold-grad text-ink-ongold mx-auto flex h-16 w-16 -rotate-3 items-center justify-center rounded-lg text-[24px] font-extrabold">
          2
        </div>
        <h1 className="mt-5 text-[23px] font-extrabold">Установите Ginger</h1>
        <p className="text-ink-2 mt-2 text-[14px]">
          На iPhone push-уведомления работают только для приложения на домашнем экране.
        </p>
      </div>
      <ol className="mt-8 space-y-3">
        <li className="border-line bg-surface flex gap-3 rounded-md border p-4">
          <span className="bg-gold-soft text-gold flex h-8 w-8 shrink-0 items-center justify-center rounded-sm font-extrabold">
            1
          </span>
          <span>
            <b className="block text-[15px]">Нажмите «Поделиться»</b>
            <span className="text-ink-2 text-[13px]">Кнопка со стрелкой в панели Safari.</span>
          </span>
        </li>
        <li className="border-line bg-surface flex gap-3 rounded-md border p-4">
          <span className="bg-gold-soft text-gold flex h-8 w-8 shrink-0 items-center justify-center rounded-sm font-extrabold">
            2
          </span>
          <span>
            <b className="block text-[15px]">Выберите «На экран „Домой“»</b>
            <span className="text-ink-2 text-[13px]">
              Подтвердите добавление приложения Ginger.
            </span>
          </span>
        </li>
      </ol>
    </main>
  );
}
