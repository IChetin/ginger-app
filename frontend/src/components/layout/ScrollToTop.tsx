import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Resets the window scroll on forward navigation. Without it a new screen opens
 * at the scroll offset of the previous one — on short screens like /bookmarks the
 * top of the list ends up above the viewport and looks like it never rendered.
 * Back/forward keeps the browser's own restoration.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") {
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
}
