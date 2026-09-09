import { useEffect, useRef, useState } from "react";

import { formatSavedAgo } from "@/features/hands/lib/useDraftSaveIndicator";

export function DraftHeaderMenu({
  lastSavedAt,
  onRestart,
  onOpenSettings,
  moreTestId,
  restartTestId,
  settingsTestId,
}: {
  lastSavedAt: string | null;
  onRestart: () => void;
  onOpenSettings?: () => void;
  moreTestId: string;
  restartTestId: string;
  settingsTestId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid={moreTestId}
        aria-label="Ещё"
        aria-expanded={open}
        className="border-line-gold text-gold inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border bg-transparent text-[18px] leading-none font-extrabold"
        onClick={() => setOpen((value) => !value)}
      >
        ···
      </button>
      {open ? (
        <div
          role="menu"
          className="border-line bg-surface-2 absolute right-0 z-30 mt-1 flex min-w-[200px] flex-col rounded-md border py-1 text-[13px] font-semibold shadow-lg"
        >
          <p data-testid="draft-last-saved" className="text-ink-3 px-3 py-2 font-semibold">
            {lastSavedAt ? formatSavedAgo(lastSavedAt, now) : "Ещё не сохранялось"}
          </p>
          {onOpenSettings ? (
            <button
              type="button"
              role="menuitem"
              data-testid={settingsTestId ?? "draft-header-settings"}
              className="text-ink px-3 py-2 text-left"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              Настройки стола
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            data-testid={restartTestId}
            className="text-danger px-3 py-2 text-left"
            onClick={() => {
              setOpen(false);
              onRestart();
            }}
          >
            Начать заново
          </button>
        </div>
      ) : null}
    </div>
  );
}
