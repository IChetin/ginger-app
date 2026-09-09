import type { Dispatch } from "react";

import type { TableInputAction, TableInputState } from "@/features/hands/lib/tableInputState";
import { canTableUndo } from "@/features/hands/lib/tableInputState";
import { cn } from "@/lib/utils";

export function TableUndoButton({
  state,
  dispatch,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
}) {
  const enabled = canTableUndo(state);
  return (
    <button
      type="button"
      data-testid="table-undo"
      aria-label="Отменить последнее действие"
      title="Отменить последнее действие"
      disabled={!enabled}
      className={cn(
        "border-line-strong text-ink inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 whitespace-nowrap",
        !enabled && "opacity-35",
      )}
      onClick={() => dispatch({ type: "undo" })}
    >
      <svg
        data-testid="table-undo-icon"
        className="h-[18px] w-[18px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path d="M9 14l-4-4 4-4" />
        <path d="M5 10h9a5 5 0 0 1 0 10h-2" />
      </svg>
      <span data-testid="table-undo-label" className="hidden text-[13px] font-extrabold min-[420px]:inline">
        Отменить
      </span>
    </button>
  );
}
