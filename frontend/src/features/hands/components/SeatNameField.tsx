import { useEffect, useRef, useState } from "react";

import {
  commitSeatName,
  displaySeatName,
  filterNameSuggestions,
  NAME_PRIVACY_HINT,
  SEAT_NAME_MAX,
} from "@/features/hands/lib/playerNames";

const CHIP_LONG_PRESS_MS = 500;
const CHIP_ROW_CLASS = "mb-2.5 flex h-[3.75rem] flex-wrap content-start gap-1.5 overflow-hidden";

export function SeatNameField({
  seat,
  heroSeat,
  name,
  onCommit,
  suggestions = [],
  showPrivacyHint = false,
  onRemember,
  onForget,
  onPrivacySeen,
  autoFocus = false,
}: {
  seat: number;
  heroSeat: number;
  name: string;
  onCommit: (name: string) => void;
  suggestions?: string[];
  showPrivacyHint?: boolean;
  onRemember?: (name: string) => void;
  onForget?: (name: string) => void;
  onPrivacySeen?: () => void;
  autoFocus?: boolean;
}) {
  const isHero = seat === heroSeat;
  const shown = displaySeatName(seat, heroSeat, name);
  const [draft, setDraft] = useState(shown);
  const inputRef = useRef<HTMLInputElement>(null);
  const ignoreBlur = useRef(false);
  const longPressTimer = useRef<number>(0);
  const suppressClick = useRef(false);

  useEffect(() => {
    setDraft(shown);
  }, [shown]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [autoFocus, seat]);

  if (isHero) {
    return (
      <span
        className="min-w-0 flex-1 truncate text-[13.5px] font-bold"
        title={shown}
        data-testid={`seat-name-${seat}`}
      >
        {shown}
      </span>
    );
  }

  const finish = (raw: string) => {
    ignoreBlur.current = true;
    const committed = commitSeatName(raw, seat, heroSeat);
    const next = displaySeatName(seat, heroSeat, committed);
    if (next !== shown) {
      onCommit(next);
      if (committed) onRemember?.(next);
      onPrivacySeen?.();
    }
    setDraft(next);
  };

  const cancel = () => {
    ignoreBlur.current = true;
    setDraft(shown);
  };

  const filtered = filterNameSuggestions(suggestions, draft);
  const showChips = suggestions.length > 0;

  return (
    <div className="relative w-full min-w-0" data-testid="seat-name-editor">
      <input
        ref={inputRef}
        data-testid="seat-name-input"
        maxLength={SEAT_NAME_MAX}
        value={draft}
        aria-label="Имя игрока"
        autoComplete="off"
        placeholder={displaySeatName(seat, heroSeat)}
        className="border-line-strong bg-surface-2 mb-2.5 h-[42px] w-full min-w-0 rounded-[8px] border px-3 text-[14px] font-bold outline-none"
        onChange={(event) => setDraft(event.target.value.slice(0, SEAT_NAME_MAX))}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finish(draft);
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        onBlur={() => {
          if (ignoreBlur.current) {
            ignoreBlur.current = false;
            return;
          }
          finish(draft);
        }}
      />
      {showPrivacyHint ? (
        <p
          className="text-ink-3 bg-surface border-line absolute bottom-full left-1/2 z-30 mb-1 w-40 -translate-x-1/2 rounded-[8px] border px-1.5 py-1 text-center text-[10.5px] leading-snug shadow-md"
          data-testid="name-privacy-hint"
        >
          {NAME_PRIVACY_HINT}
        </p>
      ) : null}
      {showChips ? (
        <div data-testid="seat-name-chips" className={CHIP_ROW_CLASS}>
          {filtered.map((item) => (
            <button
              key={item}
              type="button"
              className="border-line-strong bg-surface-2 max-w-full truncate rounded-full border px-2.5 py-1 text-[12px] font-semibold"
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                suppressClick.current = false;
                window.clearTimeout(longPressTimer.current);
                longPressTimer.current = window.setTimeout(() => {
                  suppressClick.current = true;
                  onForget?.(item);
                }, CHIP_LONG_PRESS_MS);
              }}
              onPointerUp={() => window.clearTimeout(longPressTimer.current)}
              onPointerCancel={() => window.clearTimeout(longPressTimer.current)}
              onClick={(event) => {
                event.preventDefault();
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                setDraft(item);
                finish(item);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const SEAT_NAME_CHIP_ROW_CLASS = CHIP_ROW_CLASS;
