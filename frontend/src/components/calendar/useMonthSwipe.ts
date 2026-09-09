import { useRef, type TouchEventHandler } from "react";

const AXIS_LOCK_PX = 10;
const SWIPE_THRESHOLD_PX = 56;

type Axis = "h" | "v" | null;

type TouchOrigin = {
  x: number;
  y: number;
};

/**
 * Horizontal month swipe: left → next, right → previous.
 * Locks to the dominant axis after a short move so vertical scroll still works.
 * Month changes instantly (no slide animation) — respects prefers-reduced-motion.
 */
export function useMonthSwipe(handlers: {
  onPrevMonth: () => void;
  onNextMonth: () => void;
  enabled?: boolean;
}): {
  onTouchStart: TouchEventHandler;
  onTouchMove: TouchEventHandler;
  onTouchEnd: TouchEventHandler;
  onTouchCancel: TouchEventHandler;
} {
  const origin = useRef<TouchOrigin | null>(null);
  const axis = useRef<Axis>(null);
  const enabled = handlers.enabled !== false;

  const reset = () => {
    origin.current = null;
    axis.current = null;
  };

  const onTouchStart: TouchEventHandler = (event) => {
    if (!enabled || event.touches.length !== 1) {
      reset();
      return;
    }
    const touch = event.touches[0];
    origin.current = { x: touch.clientX, y: touch.clientY };
    axis.current = null;
  };

  const onTouchMove: TouchEventHandler = (event) => {
    if (!enabled || !origin.current || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    const dx = touch.clientX - origin.current.x;
    const dy = touch.clientY - origin.current.y;
    if (axis.current != null) {
      return;
    }
    if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) {
      return;
    }
    axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
  };

  const onTouchEnd: TouchEventHandler = (event) => {
    if (!enabled || !origin.current || axis.current !== "h") {
      reset();
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - origin.current.x;
    reset();
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) {
      return;
    }
    if (dx < 0) {
      handlers.onNextMonth();
    } else {
      handlers.onPrevMonth();
    }
  };

  const onTouchCancel: TouchEventHandler = () => {
    reset();
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
