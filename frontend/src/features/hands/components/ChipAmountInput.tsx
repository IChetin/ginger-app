import { useEffect, useRef, useState, type CSSProperties } from "react";

import { NumberStepper } from "@/components/ui/NumberStepper";
import { minStackChips, stepBetChips, stepStackChips } from "@/features/hands/lib/chipStep";
import { resolvedStack } from "@/features/hands/lib/hand-engine";
import {
  canUseBb,
  formatAmountInput,
  inputToChips,
  type StackDisplayMode,
} from "@/features/hands/lib/stackDisplay";
import { cn } from "@/lib/utils";

export function ChipAmountInput({
  chips,
  bb,
  mode,
  onChange,
  placeholder,
  className,
  wrapperClassName,
  testId,
  ariaLabel,
  style,
  min = 1,
  max,
  maxHint,
  error,
  stepKind = "stack",
  muted = false,
}: {
  chips: number | null;
  bb: number;
  mode: StackDisplayMode;
  onChange: (chips: number | null) => void;
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
  testId?: string;
  ariaLabel?: string;
  style?: CSSProperties;
  min?: number;
  max?: number;
  maxHint?: string;
  error?: string;
  stepKind?: "stack" | "bet";
  muted?: boolean;
}) {
  const unit: StackDisplayMode = mode === "bb" && canUseBb(bb) ? "bb" : "chips";
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  const bbOk = canUseBb(bb);
  const stackFloor = minStackChips(unit, bb);
  const floor = stepKind === "bet" ? min : stackFloor;
  const implicitStack =
    stepKind === "stack" && chips == null && bbOk ? resolvedStack(undefined, bb) : null;
  const effective = chips ?? implicitStack;
  const current = effective ?? (stepKind === "bet" ? min : 0);
  const cap = max ?? Number.POSITIVE_INFINITY;
  const nextDown =
    stepKind === "bet"
      ? stepBetChips(chips, -1, unit, bb, floor, cap)
      : stepStackChips(effective, -1, unit, bb, floor, max);
  const nextUp =
    stepKind === "bet"
      ? stepBetChips(chips, 1, unit, bb, floor, cap)
      : stepStackChips(effective, 1, unit, bb, floor, max);
  const canDecrement = bbOk && effective != null && nextDown < current;
  const canIncrement =
    bbOk &&
    (effective == null
      ? stepKind === "bet" && (max == null || min <= max)
      : nextUp > current && (max == null || current < max));

  function draftFromChips(value: number | null): string {
    const shown = value ?? implicitStack;
    return shown == null ? "" : formatAmountInput(shown, unit, bb);
  }

  useEffect(() => {
    if (!focused) return;
    const stored = chipsRef.current;
    const shown =
      stored ?? (stepKind === "stack" && canUseBb(bb) ? resolvedStack(undefined, bb) : null);
    setDraft(shown == null ? "" : formatAmountInput(shown, unit, bb));
  }, [bb, focused, stepKind, unit]);

  const display = focused ? draft : draftFromChips(chips);

  return (
    <NumberStepper
      className={cn(className, wrapperClassName, error && "border-danger")}
      canDecrement={canDecrement}
      canIncrement={canIncrement}
      incrementHint={maxHint}
      error={error}
      onStep={(direction) => {
        if (stepKind === "bet" && chips == null && direction === 1) {
          onChange(min);
          return;
        }
        const next =
          stepKind === "bet"
            ? stepBetChips(chips, direction, unit, bb, floor, cap)
            : stepStackChips(effective, direction, unit, bb, floor, max);
        onChange(next);
      }}
    >
      <input
        inputMode={unit === "bb" ? "decimal" : "numeric"}
        size={1}
        data-testid={testId}
        aria-label={ariaLabel}
        aria-invalid={Boolean(error)}
        className={cn(
          "h-full w-full min-w-0 flex-1 bg-transparent text-center text-[16px] font-extrabold outline-none",
          className,
          muted ? "text-ink-3" : "text-ink",
        )}
        style={style}
        placeholder={placeholder}
        value={display}
        onFocus={(event) => {
          setFocused(true);
          setDraft(draftFromChips(chips));
          event.currentTarget.select();
        }}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const raw = event.target.value;
          const nextRaw = unit === "chips" ? raw.replace(/[^\d\s]/g, "") : raw;
          setDraft(nextRaw);
          if (!nextRaw.trim()) {
            onChange(null);
            return;
          }
          const next = inputToChips(nextRaw, unit, bb);
          if (next != null) onChange(next);
        }}
      />
      {unit === "bb" ? (
        <span
          className="text-ink-3 pointer-events-none ml-1.5 shrink-0 text-[11px] font-normal"
          data-testid="amount-bb-suffix"
        >
          BB
        </span>
      ) : (
        <span
          className="text-ink-3 pointer-events-none ml-1.5 shrink-0 text-[11px] font-normal"
          data-testid="amount-chips-suffix"
        >
          фишки
        </span>
      )}
    </NumberStepper>
  );
}
