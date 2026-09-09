import { useEffect, useState } from "react";

/** Сколько пикселей клавиатура перекрывает низ layout viewport. */
export function visualViewportBottomInset(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
}

/** Поднимает нижнюю шторку над экранной клавиатурой. */
export function useVisualViewportInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () => setInset(visualViewportBottomInset());
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);
  return inset;
}
