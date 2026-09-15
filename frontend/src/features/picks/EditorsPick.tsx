import { Drawer } from "@base-ui/react/drawer";
import { useState } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

type PickKind = "mtt" | "cash";

const EXPLANATION: Record<PickKind, string> = {
  mtt: "Турниры, которые мы сами отобрали для наших игроков: выгодная гарантия за свой бай-ин, удобное время, интересный формат. Подборку обновляем раз в неделю.",
  cash: "Лимиты и клубы, которые мы сами отобрали для наших игроков: живая игра и интересные ставки. Подборку обновляем каждый день.",
};

/**
 * Фильтр «★ Editor's Pick» со знаком (?): в выдаче остаётся только отобранное Иваном.
 * Гостю чип виден с замком — тизер: подборка доступна после входа (решение 15.09).
 */
export function EditorsPickChip({
  kind,
  active,
  locked = false,
  onToggle,
}: {
  kind: PickKind;
  active: boolean;
  locked?: boolean;
  onToggle: () => void;
}) {
  const [help, setHelp] = useState(false);
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-bold whitespace-nowrap",
          active
            ? "border-line-gold bg-gold-grad text-ink-ongold"
            : "border-line-gold bg-gold-soft text-gold",
        )}
      >
        <span aria-hidden="true">★</span>
        Editor&apos;s Pick
        {locked ? (
          <span aria-hidden="true" data-testid="editors-pick-lock" className="text-[10px]">
            🔒
          </span>
        ) : null}
      </button>
      <button
        type="button"
        aria-label="Что такое Editor's Pick"
        onClick={() => setHelp(true)}
        className="border-line-gold text-gold flex size-[22px] shrink-0 items-center justify-center rounded-full border text-[11px] leading-none font-extrabold"
      >
        ?
      </button>
      <Drawer.Root open={help} onOpenChange={setHelp}>
        <Drawer.Portal>
          <Drawer.Backdrop className="bg-scrim fixed inset-0 z-40" />
          <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
            <Drawer.Popup
              data-testid="editors-pick-help"
              className="border-line-strong bg-surface w-full max-w-[420px] rounded-t-lg border border-b-0 px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] outline-none"
            >
              <div className="bg-line-strong mx-auto mb-3.5 h-1 w-9 rounded-full" />
              <Drawer.Title className="text-gold text-[18px] font-extrabold">
                ★ Editor&apos;s Pick
              </Drawer.Title>
              <Drawer.Description className="text-ink-2 mt-2 text-[14px] leading-snug">
                {EXPLANATION[kind]}
              </Drawer.Description>
              {locked ? (
                <>
                  <p className="text-gold mt-3 text-[13.5px] font-bold">
                    🔒 Доступно игрокам клуба после входа.
                  </p>
                  <Link
                    to="/login"
                    className="bg-gold-grad text-ink-ongold mt-4 flex h-11 w-full items-center justify-center rounded-md text-[14px] font-bold"
                  >
                    Войти
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setHelp(false)}
                  className="border-line-strong text-ink mt-4 h-11 w-full rounded-md border text-[14px] font-bold"
                >
                  Понятно
                </button>
              )}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </span>
  );
}

/** Плашка в карточке турнира или лимита: отобрано в Editor's Pick и почему. */
export function EditorsPickPlate({ note }: { note: string | null }) {
  return (
    <div
      data-testid="editors-pick-plate"
      className="border-line-gold bg-gold-soft mt-3 rounded-md border px-3 py-2"
    >
      <p className="text-gold text-[11px] font-extrabold tracking-[0.06em] uppercase">
        ★ Editor&apos;s Pick
      </p>
      {note ? <p className="text-ink mt-0.5 text-[13.5px] font-semibold">{note}</p> : null}
    </div>
  );
}
