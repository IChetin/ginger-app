import { useEffect, useState } from "react";

/**
 * Counts down from `seconds` to 0. Pass a new `seconds` / bump `token`
 * to restart (e.g. after request-code retry_after).
 */
export function useCountdown(
  seconds: number,
  token = 0,
): {
  remaining: number;
  isFinished: boolean;
} {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor(seconds)));

  useEffect(() => {
    setRemaining(Math.max(0, Math.floor(seconds)));
    if (seconds <= 0) {
      return;
    }
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds, token]);

  return { remaining, isFinished: remaining <= 0 };
}
