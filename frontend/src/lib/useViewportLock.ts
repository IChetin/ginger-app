import { useEffect } from "react";

const CLASS = "day2-viewport-lock";

/** Блокирует скролл html/body, пока смонтирован столовый ввод. */
export function useViewportLock(): void {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add(CLASS);
    return () => {
      html.classList.remove(CLASS);
    };
  }, []);
}
