import { GingerLogo } from "@/components/brand/GingerLogo";

/**
 * Экран загрузки на весь экран (Иван, 28.09) вместо серых заглушек: логотип мерцает, внизу
 * бежит золотая полоска. Показывается, пока проверяется сессия. При «уменьшить движение» — стоит.
 */
export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="loading-screen"
      className="bg-bg fixed inset-0 z-50 flex flex-col items-center justify-center"
    >
      <GingerLogo className="w-40 animate-[deco-breathe_1.6s_ease-in-out_infinite]" />
      <span className="sr-only">Загрузка…</span>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-[calc(28px+env(safe-area-inset-bottom,0px))] mx-auto h-[2px] w-[min(240px,60%)] overflow-hidden bg-[var(--frame-inner)]"
      >
        <div className="bg-gold h-full w-1/3 animate-[deco-loading_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
