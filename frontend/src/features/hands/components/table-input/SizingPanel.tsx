import type { Dispatch } from "react";

import { ChipAmountInput } from "@/features/hands/components/ChipAmountInput";
import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";
import { TableEquityBadge } from "@/features/hands/components/table-input/TableEquityBadge";
import { TableUndoButton } from "@/features/hands/components/table-input/TableUndoButton";
import { TABLE_SHEET_CLASS } from "@/features/hands/components/table-input/sheet";
import { postflopBetSizes, preflopBetSizes } from "@/features/hands/lib/betSizePresets";
import { getAvailableActions, lastReplayState } from "@/features/hands/lib/hand-engine";
import { canUseBb, formatAmountInput, formatStackAmount } from "@/features/hands/lib/stackDisplay";
import type { TableInputAction, TableInputState } from "@/features/hands/lib/tableInputState";
import { useTableStackDisplay } from "@/features/hands/lib/useTableStackDisplay";
import { cn } from "@/lib/utils";

export function SizingPanel({
  state,
  dispatch,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
}) {
  const { mode, setMode } = useTableStackDisplay();
  const legal = getAvailableActions(state);
  let replay;
  try {
    replay = lastReplayState(state);
  } catch {
    return null;
  }
  const bb = state.blinds.bb;
  const to = state.sizing?.to ?? null;
  const presets =
    replay.street === "preflop"
      ? preflopBetSizes(replay.currentBet, legal.minBet, legal.maxBet)
      : postflopBetSizes(replay.pot, legal.minBet, legal.maxBet);
  const amount = (value: number) => formatStackAmount(value, mode, bb);
  const belowMin = to != null && to < legal.minBet && to < legal.maxBet;
  const canConfirm = to != null && !belowMin && to > 0 && legal.maxBet > 0;
  const minHint = belowMin ? `Минимум ${amount(legal.minBet)}` : null;

  return (
    <section className={TABLE_SHEET_CLASS} data-testid="table-sizing-panel">
      <TableEquityBadge composition={state} embedded />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-extrabold">Размер ставки</p>
        <TableUndoButton state={state} dispatch={dispatch} />
      </div>
      <div className="mt-1 flex items-center justify-end">
        <StackDisplayToggle mode={mode} onChange={setMode} compact disabled={!canUseBb(bb)} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className={cn(
              "border-line flex h-10 min-h-[40px] min-w-[4.5rem] flex-col items-center justify-center rounded-[10px] border px-2.5 py-0.5",
              state.sizing?.preset === preset.key
                ? "bg-gold-grad text-ink-ongold border-transparent"
                : "bg-surface-2 text-ink",
            )}
            onClick={() => dispatch({ type: "setSizing", to: preset.to, preset: preset.key })}
          >
            <span className="text-[12px] leading-none font-extrabold">{preset.label}</span>
            <span
              className={cn(
                "num mt-0.5 text-[10px] leading-none font-semibold",
                state.sizing?.preset === preset.key ? "text-ink-ongold/80" : "text-ink-3",
              )}
            >
              {amount(preset.to)}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2">
        <ChipAmountInput
          chips={to}
          bb={bb}
          mode={mode}
          min={legal.minBet}
          max={legal.maxBet}
          stepKind="bet"
          ariaLabel="Сумма ставки"
          placeholder={`мин. ${formatAmountInput(legal.minBet, mode, bb)}`}
          error={minHint ?? undefined}
          maxHint="Больше стека"
          onChange={(value) => {
            dispatch({ type: "setSizing", to: value, preset: null });
          }}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="border-line bg-surface-2 h-[46px] rounded-xl border text-[14px] font-extrabold"
          onClick={() => dispatch({ type: "cancelSizing" })}
        >
          Отмена
        </button>
        <button
          type="button"
          data-testid="table-confirm-sizing"
          disabled={!canConfirm}
          className="bg-gold-grad text-ink-ongold h-[46px] rounded-xl text-[14px] font-extrabold disabled:opacity-40"
          onClick={() => dispatch({ type: "confirmSizing" })}
        >
          Поставить{to != null ? ` ${amount(to)}` : ""}
        </button>
      </div>
    </section>
  );
}
