import type { Dispatch } from "react";

import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";
import { TableEquityBadge } from "@/features/hands/components/table-input/TableEquityBadge";
import { TableUndoButton } from "@/features/hands/components/table-input/TableUndoButton";
import { TABLE_SHEET_CLASS } from "@/features/hands/components/table-input/sheet";
import {
  getAvailableActions,
  lastReplayState,
  stateBeforeAction,
} from "@/features/hands/lib/hand-engine";
import { displaySeatName } from "@/features/hands/lib/playerNames";
import { canUseBb, formatStackAmount } from "@/features/hands/lib/stackDisplay";
import type { TableInputAction, TableInputState } from "@/features/hands/lib/tableInputState";
import { nextStreetToDeal, tableFollowingCount } from "@/features/hands/lib/tableInputState";
import { useTableStackDisplay } from "@/features/hands/lib/useTableStackDisplay";
import { cn } from "@/lib/utils";

export function ActionPanel({
  state,
  dispatch,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
}) {
  const { mode, setMode } = useTableStackDisplay();
  const view =
    state.editingActionIndex != null ? stateBeforeAction(state, state.editingActionIndex) : state;
  const legal = getAvailableActions(view);
  let replay;
  try {
    replay = lastReplayState(view);
  } catch {
    replay = null;
  }
  const actor = replay?.seats.find((seat) => seat.seat === replay.actorSeat) ?? null;
  const bb = state.blinds.bb;
  const useBb = mode === "bb" && canUseBb(bb);
  const amount = (value: number) => formatStackAmount(value, mode, bb);
  const cascade = tableFollowingCount(state);

  const middle = legal.canCheck
    ? {
        label: "Чек",
        hint: undefined as string | undefined,
        onClick: () => dispatch({ type: "chooseAction", kind: "check" }),
      }
    : legal.canCall
      ? {
          label: "Колл",
          hint: amount(legal.callAmount),
          onClick: () => dispatch({ type: "chooseAction", kind: "call" }),
        }
      : null;
  const aggressive = legal.canBet
    ? { label: "Бет", kind: "bet" as const }
    : legal.canRaise
      ? { label: "Рейз", kind: "raise" as const }
      : null;

  return (
    <section className={TABLE_SHEET_CLASS} data-testid="table-action-panel">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <StackDisplayToggle
          compact
          mode={useBb ? "bb" : "chips"}
          disabled={!canUseBb(bb)}
          onChange={setMode}
        />
        <TableUndoButton state={state} dispatch={dispatch} />
      </div>
      <TableEquityBadge composition={view} embedded />
      {state.heroCards.length < 2 ? (
        <p
          className="text-gold mb-1.5 text-[12.5px] font-extrabold"
          data-testid="table-hero-cards-hint"
        >
          Тапните по своим картам
        </p>
      ) : null}
      <p className="text-ink-3 text-[12px] font-semibold">
        {actor
          ? `Ход ${actor.position} · ${displaySeatName(actor.seat, state.heroSeat, state.names[actor.seat])}`
          : "Ждём ход"}
      </p>
      {actor ? (
        <p className="text-ink mt-0.5 text-[14px] font-extrabold">{amount(actor.stack)}</p>
      ) : null}
      {cascade > 0 ? (
        <p className="text-warn mt-1 text-[12px] font-semibold">
          Правка отменит {cascade} следующих действий
        </p>
      ) : null}
      {nextStreetToDeal(state) ? (
        <button
          type="button"
          data-testid="table-deal-street"
          className="border-line bg-surface-2 mb-2 flex h-11 w-full items-center justify-center rounded-xl border text-[14px] font-extrabold"
          onClick={() => dispatch({ type: "continueShowdown" })}
        >
          Раздать {nextStreetToDeal(state)}
        </button>
      ) : null}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ActionButton
          label="Фолд"
          disabled={!legal.canFold}
          className="text-danger border-danger/40 bg-[rgba(255,107,107,0.14)]"
          onClick={() => dispatch({ type: "chooseAction", kind: "fold" })}
        />
        <ActionButton
          label={middle?.label ?? "Чек"}
          hint={middle?.hint}
          disabled={!middle}
          onClick={middle?.onClick ?? (() => undefined)}
        />
        <ActionButton
          label={aggressive?.label ?? "Рейз"}
          hint="выбрать размер"
          disabled={!aggressive}
          className="bg-gold-grad text-ink-ongold border-transparent"
          onClick={() => {
            if (aggressive) dispatch({ type: "openSizing", kind: aggressive.kind });
          }}
        />
      </div>
    </section>
  );
}

function ActionButton({
  label,
  hint,
  className,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "border-line bg-surface-2 flex h-[50px] flex-col items-center justify-center gap-px rounded-xl border text-[14px] leading-[1.15] font-extrabold",
        disabled && "opacity-35",
        className,
      )}
      onClick={onClick}
    >
      {label}
      {hint ? <small className="text-[9.5px] font-semibold opacity-75">{hint}</small> : null}
    </button>
  );
}
