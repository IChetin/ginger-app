import { useEffect, useState } from "react";

/** Viewport ≥ breakpoint (default 1024). Used by dialogs and steppers to switch between sheet and popover layouts. */
export function useIsDesktop(breakpoint = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(min-width: ${breakpoint}px)`).matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const onChange = () => setIsDesktop(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isDesktop;
}
