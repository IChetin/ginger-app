import { useEffect, useState } from "react";

export interface VisualViewportBox {
  height: number;
  offsetTop: number;
}

function read(): VisualViewportBox {
  if (typeof window === "undefined") return { height: 0, offsetTop: 0 };
  const viewport = window.visualViewport;
  return viewport
    ? { height: viewport.height, offsetTop: viewport.offsetTop }
    : { height: window.innerHeight, offsetTop: 0 };
}

/**
 * Видимая часть экрана без клавиатуры. На iPhone клавиатура не сжимает страницу, а
 * наезжает на неё — поэтому высоту экрана переписки берём отсюда, иначе поле ввода
 * окажется под клавиатурой (как в мессенджерах, оно должно прилипать к ней сверху).
 */
export function useVisualViewport(): VisualViewportBox {
  const [box, setBox] = useState(read);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setBox(read());
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return box;
}
