import { Link } from "react-router-dom";

/**
 * TODO: заменить заглушку полноценной политикой конфиденциальности
 * перед публичным релизом (этап 11, 152-ФЗ).
 */
export function PrivacyPage() {
  return (
    <div className="bg-bg text-ink mx-auto min-h-screen w-full max-w-[420px] px-5 py-8">
      <Link to="/" className="text-gold text-sm font-bold">
        ← На главную
      </Link>
      <h1 className="mt-6 text-[23px] font-extrabold tracking-[-0.02em]">
        Политика конфиденциальности
      </h1>
      <p className="text-ink-2 mt-3 text-sm">
        Текст политики готовится. Здесь будет описание обработки персональных данных (email, сессии,
        закладки и результаты) в соответствии с 152-ФЗ.
      </p>
      <p className="text-ink-3 mt-4 text-xs">TODO: финальный юридический текст до запуска.</p>
    </div>
  );
}
