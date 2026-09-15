import { Drawer } from "@base-ui/react/drawer";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useMe } from "@/features/auth/hooks";
import {
  findRouteHint,
  markHintSeen,
  ROUTE_HINTS,
  seenHints,
  type RouteHint,
} from "@/features/hints/hints";

const SHOW_DELAY_MS = 700;

function HintSheet({ hint, onClose }: { hint: RouteHint | null; onClose: () => void }) {
  return (
    <Drawer.Root
      open={hint !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-scrim fixed inset-0 z-40" />
        <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
          <Drawer.Popup
            data-testid="route-hint"
            className="border-line-strong bg-surface w-full max-w-[420px] rounded-t-lg border border-b-0 px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] outline-none"
          >
            <div className="bg-line-strong mx-auto mb-3.5 h-1 w-9 rounded-full" />
            {hint ? (
              <>
                <p className="text-gold text-[11px] font-bold tracking-[0.1em] uppercase">
                  Как это работает
                </p>
                <Drawer.Title className="text-ink mt-0.5 text-[20px] leading-tight font-bold">
                  {hint.title}
                </Drawer.Title>
                <ol className="mt-3 flex flex-col gap-2.5">
                  {hint.steps.map((step, index) => (
                    <li key={step} className="flex gap-2.5 text-[14px] leading-snug">
                      <span className="bg-gold-soft text-gold num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold">
                        {index + 1}
                      </span>
                      <span className="text-ink-2 pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-gold-grad text-ink-ongold mt-5 flex h-12 w-full items-center justify-center rounded-md text-[15px] font-bold"
                >
                  Понятно
                </button>
              </>
            ) : null}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * Памятка по экранам: при первом заходе на экран с развилками — шторка с шагами.
 * Только вошедшим; в тестах страниц выключена, чтобы шторка не перекрывала проверки.
 */
export function RouteHints({ enabled = import.meta.env.MODE !== "test" }: { enabled?: boolean }) {
  const { data: user } = useMe();
  const { pathname } = useLocation();
  const [openId, setOpenId] = useState<string | null>(null);
  const hintId = enabled && user ? (findRouteHint(pathname)?.id ?? null) : null;

  useEffect(() => {
    setOpenId(null);
    if (!hintId || seenHints().has(hintId)) return;
    const timer = window.setTimeout(() => setOpenId(hintId), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hintId]);

  const hint = ROUTE_HINTS.find((item) => item.id === openId) ?? null;
  return (
    <HintSheet
      hint={hint}
      onClose={() => {
        if (hint) markHintSeen(hint.id);
        setOpenId(null);
      }}
    />
  );
}
