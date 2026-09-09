import { useEffect, useState } from "react";

/** Desktop breakpoint for admin shell (matches design 900px). */
export const ADMIN_DESKTOP_MIN_WIDTH = 900;

export function useAdminDesktop(minWidth = ADMIN_DESKTOP_MIN_WIDTH): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.matchMedia(`(min-width: ${minWidth}px)`).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${minWidth}px)`);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [minWidth]);

  return matches;
}
