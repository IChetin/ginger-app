import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="bg-bg text-ink flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-lg font-extrabold" data-testid="not-found">
        Страница не найдена
      </p>
      <p className="text-ink-2 mt-2 text-sm">Такой страницы нет или у вас нет к ней доступа</p>
      <Link
        to="/"
        className="bg-gold-grad text-ink-ongold mt-5 inline-flex h-11 items-center justify-center rounded-full px-5 text-[13px] font-bold"
      >
        На главную
      </Link>
    </div>
  );
}
