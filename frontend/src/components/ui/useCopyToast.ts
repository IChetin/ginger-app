import { useEffect, useState } from "react";

export const COPIED_LINK_TOAST = "Ссылка скопирована";

export function useCopyToast(duration = 1800) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), duration);
    return () => window.clearTimeout(timer);
  }, [message, duration]);

  return {
    message,
    showCopied: () => setMessage(COPIED_LINK_TOAST),
  };
}
