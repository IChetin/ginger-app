import { useEffect, useState } from "react";

import { GingerLogo } from "@/components/brand/GingerLogo";

/** Через сколько считаем, что сервер не отвечает: проверка сессии обычно укладывается в секунду. */
export const SLOW_AFTER_MS = 10_000;

/**
 * Экран загрузки на весь экран (Иван, 28.09) вместо серых заглушек: логотип мерцает, внизу
 * бежит золотая полоска. Показывается, пока проверяется сессия. При «уменьшить движение» — стоит.
 * Если сервер молчит дольше SLOW_AFTER_MS — подсказка и «Повторить»: в РФ провайдеры
 * замораживают соединения с зарубежными серверами, и без подсказки игрок видит вечную лису (30.09).
 */
export function LoadingScreen() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="loading-screen"
      className="bg-bg fixed inset-0 z-50 flex flex-col items-center justify-center px-8"
    >
      <GingerLogo className="w-40 animate-[deco-breathe_1.6s_ease-in-out_infinite]" />
      <span className="sr-only">Загрузка…</span>
      {slow ? (
        <div className="mt-8 max-w-[300px] text-center" data-testid="loading-slow">
          <p className="text-ink text-[15px] font-bold">Сервер не отвечает</p>
          <p className="text-ink-2 mt-1.5 text-[13px]">
            Проверьте интернет. Если вы в России — включите VPN: некоторые провайдеры ограничивают
            соединение с приложением.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-gold-grad text-ink-ongold mt-4 h-11 w-full rounded-md text-[15px] font-bold"
          >
            Повторить
          </button>
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-[calc(28px+env(safe-area-inset-bottom,0px))] mx-auto h-[2px] w-[min(240px,60%)] overflow-hidden bg-[var(--frame-inner)]"
      >
        <div className="bg-gold h-full w-1/3 animate-[deco-loading_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
