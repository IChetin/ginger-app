import { useEffect, useState } from "react";

import type { WizardStep } from "@/features/hands/lib/wizardState";
import { cn } from "@/lib/utils";

const STEPS = [
  { step: 1 as const, label: "Стол" },
  { step: 2 as const, label: "Карты" },
  { step: 3 as const, label: "Действия" },
  { step: 4 as const, label: "Итог" },
];

type Props = {
  current: WizardStep;
  furthest: WizardStep;
  onSelect: (step: WizardStep) => void;
};

export function WizardStepNav({ current, furthest, onSelect }: Props) {
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 1800);
    return () => window.clearTimeout(timer);
  }, [hint]);

  return (
    <div>
      <nav
        aria-label="Шаги ввода раздачи"
        data-testid="wizard-steps"
        className="flex gap-1 px-4 pb-2.5"
      >
        {STEPS.map(({ step, label }) => {
          const isCurrent = step === current;
          const reachable = step <= furthest;
          return (
            <button
              key={step}
              type="button"
              data-testid={`wizard-step-${step}`}
              data-state={isCurrent ? "current" : reachable ? "done" : "future"}
              aria-current={isCurrent ? "step" : undefined}
              aria-disabled={!reachable || isCurrent ? true : undefined}
              aria-label={label}
              className={cn(
                "flex min-h-8 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] px-1",
                isCurrent && "bg-gold-grad text-ink-ongold",
                reachable && !isCurrent && "bg-gold-soft text-gold",
                !reachable && "bg-surface-2 text-ink-3",
              )}
              onClick={() => {
                if (isCurrent) return;
                if (!reachable) {
                  setHint("Сначала заполните текущий шаг");
                  return;
                }
                onSelect(step);
              }}
            >
              <span
                className={cn(
                  "truncate text-[11px] font-extrabold",
                  !isCurrent && "max-[379px]:hidden",
                )}
              >
                {label}
              </span>
              <span
                aria-hidden
                className={cn(
                  "hidden h-[3px] w-full min-w-[12px] rounded-[2px] max-[379px]:block",
                  isCurrent && "max-[379px]:hidden",
                  reachable ? "bg-[rgba(217,179,106,0.55)]" : "bg-surface-3",
                )}
              />
            </button>
          );
        })}
      </nav>
      {hint ? (
        <p
          role="status"
          data-testid="wizard-step-hint"
          className="text-ink-3 px-4 pb-2 text-center text-[11.5px]"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
