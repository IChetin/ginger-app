import { useEffect, useState, type Dispatch } from "react";

import { STREET_TITLE } from "@/features/hands/lib/handSchema";
import {
  streetTabLockedHint,
  streetTabs,
  type WizardAction,
  type WizardState,
} from "@/features/hands/lib/wizardState";
import { cn } from "@/lib/utils";

type Props = {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
};

export function StreetTabs({ state, dispatch }: Props) {
  const [hint, setHint] = useState<string | null>(null);
  const tabs = streetTabs(state);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 1800);
    return () => window.clearTimeout(timer);
  }, [hint]);

  return (
    <div>
      <nav aria-label="Улицы раздачи" data-testid="street-tabs" className="flex gap-1 px-4 pb-2">
        {tabs.map((tab) => {
          const isCurrent = tab.state === "current";
          const locked = tab.state === "locked";
          return (
            <button
              key={tab.street}
              type="button"
              data-testid={`street-tab-${tab.street}`}
              data-state={tab.state}
              aria-current={isCurrent ? "true" : undefined}
              aria-disabled={locked || isCurrent ? true : undefined}
              aria-label={STREET_TITLE[tab.street]}
              className={cn(
                "relative flex h-7 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[8px] px-1",
                isCurrent && "bg-gold-soft text-gold",
                tab.state === "done" && "bg-surface-2 text-ink-2",
                tab.state === "next" && "bg-surface-2 text-gold",
                locked && "text-ink-3 opacity-50",
              )}
              onClick={() => {
                if (isCurrent) return;
                if (locked) {
                  setHint(streetTabLockedHint(state));
                  return;
                }
                dispatch({ type: "goToStreet", street: tab.street });
              }}
            >
              <span className="truncate text-[11px] font-extrabold">
                {STREET_TITLE[tab.street]}
              </span>
              {isCurrent ? (
                <span
                  aria-hidden
                  className="bg-gold absolute inset-x-2 bottom-0 h-[2px] rounded-full"
                />
              ) : null}
            </button>
          );
        })}
      </nav>
      {hint ? (
        <p
          role="status"
          data-testid="street-tab-hint"
          className="text-ink-3 px-4 pb-2 text-center text-[11.5px]"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
