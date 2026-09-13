import { useCallback, useEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";

import { useIsDesktop } from "@/hooks/useIsDesktop";
import {
  canLadderDecrement,
  canLadderIncrement,
  nextLadder,
  parseStepperInt,
} from "@/lib/numberStep";
import { cn } from "@/lib/utils";

const HOLD_DELAY_MS = 500;
const HOLD_FIRST_REPEAT_MS = 140;
const HOLD_MIN_REPEAT_MS = 50;
const HOLD_ACCEL = 0.82;

function tapVibrate(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(10);
}

function useHoldRepeat(onTick: () => void, enabled: boolean) {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const stopRef = useRef<() => void>(() => undefined);

  const stop = useCallback(() => {
    stopRef.current();
  }, []);

  const start = useCallback(() => {
    if (!enabled) return;
    stopRef.current();
    onTickRef.current();

    let cancelled = false;
    const timeouts: number[] = [];
    let delay = HOLD_FIRST_REPEAT_MS;
    const repeat = () => {
      if (cancelled) return;
      onTickRef.current();
      delay = Math.max(HOLD_MIN_REPEAT_MS, delay * HOLD_ACCEL);
      timeouts.push(window.setTimeout(repeat, delay));
    };
    timeouts.push(window.setTimeout(repeat, HOLD_DELAY_MS));
    stopRef.current = () => {
      cancelled = true;
      for (const id of timeouts) window.clearTimeout(id);
      timeouts.length = 0;
      stopRef.current = () => undefined;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  useEffect(() => {
    const onUp = () => stop();
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      stop();
    };
  }, [stop]);

  return { start, stop };
}

export function NumberStepper({
  onStep,
  canDecrement,
  canIncrement,
  incrementHint,
  error,
  className,
  children,
}: {
  onStep: (direction: 1 | -1) => void;
  canDecrement: boolean;
  canIncrement: boolean;
  incrementHint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const desktop = useIsDesktop(640);
  const atMax = !canIncrement && Boolean(incrementHint);

  const apply = useCallback(
    (direction: 1 | -1) => {
      if (direction < 0 && !canDecrement) return;
      if (direction > 0 && !canIncrement) return;
      tapVibrate();
      onStep(direction);
    },
    [canDecrement, canIncrement, onStep],
  );

  const decHold = useHoldRepeat(() => apply(-1), canDecrement);
  const incHold = useHoldRepeat(() => apply(1), canIncrement);

  const btnClass = (enabled: boolean) =>
    cn(
      "relative inline-flex shrink-0 items-center justify-center rounded-[8px] font-extrabold select-none",
      "text-gold touch-manipulation before:absolute before:content-['']",
      desktop ? "h-8 w-8 text-[20px] before:-inset-0.5" : "h-9 w-9 text-[22px] before:-inset-1",
      desktop && enabled && "hover:bg-gold-soft",
      !enabled && "text-ink-3 pointer-events-none opacity-40",
    );

  return (
    <div className="w-full min-w-0">
      <div
        data-testid="number-stepper"
        className={cn("flex min-w-0 items-center", className)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            apply(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            apply(-1);
          }
        }}
      >
        <button
          type="button"
          data-testid="number-stepper-dec"
          aria-label="Уменьшить"
          disabled={!canDecrement}
          className={btnClass(canDecrement)}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            decHold.start();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          −
        </button>
        <div className="flex min-w-0 flex-1 items-center self-stretch px-1">{children}</div>
        <button
          type="button"
          data-testid="number-stepper-inc"
          aria-label={atMax ? incrementHint : "Увеличить"}
          title={atMax ? incrementHint : undefined}
          disabled={!canIncrement}
          className={btnClass(canIncrement)}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            incHold.start();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          +
        </button>
      </div>
      {error ? (
        <p className="text-danger mt-1 text-[11px]" data-testid="number-stepper-error">
          {error}
        </p>
      ) : atMax ? (
        <p className="text-ink-3 mt-1 text-[11px]" data-testid="number-stepper-max-hint">
          {incrementHint}
        </p>
      ) : null}
    </div>
  );
}

type LadderInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "inputMode"
> & {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  error?: string;
  frameClassName?: string;
};

/** Числовое поле с рядом 25 / 50 / 100 … (блайнды, бай-ин, выплата). */
export function LadderNumberStepper({
  value,
  onChange,
  min = 0,
  max,
  error,
  frameClassName,
  className,
  ...inputProps
}: LadderInputProps) {
  const parsed = parseStepperInt(value);
  return (
    <NumberStepper
      className={cn(frameClassName, error && "border-danger")}
      canDecrement={canLadderDecrement(parsed, min)}
      canIncrement={canLadderIncrement(parsed, min, max)}
      error={error}
      onStep={(direction) => onChange(String(nextLadder(parsed, direction, min)))}
    >
      <input
        {...inputProps}
        inputMode="numeric"
        aria-invalid={error ? true : inputProps["aria-invalid"]}
        className={cn("h-full min-w-0 flex-1 bg-transparent outline-none", className)}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\s/g, "").replace(",", "."))}
      />
    </NumberStepper>
  );
}
