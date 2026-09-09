import { type Dispatch } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ChipAmountInput } from "@/features/hands/components/ChipAmountInput";
import { HandLinkSelect } from "@/features/hands/components/HandLinkSelect";
import { SeatEditSheet } from "@/features/hands/components/SeatEditSheet";
import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";
import { wizardAnteMode } from "@/features/hands/lib/anteMode";
import { invalidStartingStackNames, startingStackHint } from "@/features/hands/lib/hand-engine";
import { TABLE_SIZE_CHOICES, type TableSize } from "@/features/hands/lib/positions";
import {
  canUseBb,
  formatBlindsSummary,
  type StackDisplayMode,
} from "@/features/hands/lib/stackDisplay";
import {
  lineupResetWarning,
  seatsLostWhenResizing,
  tableActionCount,
  tableShrinkWarning,
  type TableInputAction,
  type TableInputState,
} from "@/features/hands/lib/tableInputState";
import { useTableStackDisplay } from "@/features/hands/lib/useTableStackDisplay";
import { useHandLinkTargets } from "@/features/hands/hooks";
import { pluralRu } from "@/lib/plural";
import { useVisualViewportInset } from "@/lib/useVisualViewportInset";
import { cn } from "@/lib/utils";

export type SetupSheet = "bar" | "settings" | number;

const STEPPER_CLASS = "border-line-strong bg-surface-2 h-11 w-full min-w-0 rounded-[12px] border";

export function SetupPanel({
  state,
  dispatch,
  sheet,
  onSheetChange,
  onStartMove,
  playing = false,
  onResume,
  focusName = false,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
  sheet: SetupSheet;
  onSheetChange: (sheet: SetupSheet) => void;
  onStartMove?: (seat: number) => void;
  playing?: boolean;
  onResume?: () => void;
  focusName?: boolean;
}) {
  const { mode, setMode } = useTableStackDisplay();
  const actionCount = tableActionCount(state);

  if (sheet === "bar") {
    return (
      <SetupBar
        state={state}
        dispatch={dispatch}
        onOpenSettings={() => onSheetChange("settings")}
        playing={playing}
        onResume={onResume}
        mode={mode}
        onModeChange={setMode}
      />
    );
  }
  if (sheet === "settings") {
    return (
      <SetupSettingsSheet
        state={state}
        dispatch={dispatch}
        onDone={() => onSheetChange("bar")}
        actionCount={actionCount}
      />
    );
  }
  return (
    <SeatEditSheet
      state={state}
      seat={sheet}
      stackMode={mode}
      actionCount={actionCount}
      focusName={focusName}
      overlay="float"
      onClose={() => onSheetChange("bar")}
      onSetName={(target, name) => dispatch({ type: "setSeatName", seat: target, name })}
      onSetStack={(target, value) => dispatch({ type: "setStack", seat: target, value })}
      onRemove={(target) => dispatch({ type: "toggleSeat", seat: target })}
      onMoveHero={(target) => dispatch({ type: "moveSeat", from: state.heroSeat, to: target })}
      onStartMove={onStartMove}
      onStackModeChange={setMode}
    />
  );
}

function SetupBar({
  state,
  dispatch,
  onOpenSettings,
  playing,
  onResume,
  mode,
  onModeChange,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
  onOpenSettings: () => void;
  playing: boolean;
  onResume?: () => void;
  mode: StackDisplayMode;
  onModeChange: (mode: StackDisplayMode) => void;
}) {
  const links = useHandLinkTargets();
  const count = state.occupied.length;
  const stackErrorNames = invalidStartingStackNames(state);
  const stackHint = startingStackHint(stackErrorNames);
  const startBlocked = stackErrorNames.length > 0 || count < 2;
  const bb = state.blinds.bb;
  const blindsLine = formatBlindsSummary(state.blinds, mode);
  const currentLink = links.data?.find((item) =>
    state.liveSessionId
      ? item.live_session_id === state.liveSessionId
      : state.seriesId
        ? item.series_id === state.seriesId
        : item.event_id === state.eventId,
  );
  const linkLabel =
    currentLink?.label ??
    (state.eventId || state.liveSessionId ? "турнир" : state.seriesId ? "серия" : "без турнира");
  const meta = `${state.tableSize} ${pluralRu(state.tableSize, "место", "места", "мест")} · ${linkLabel}`;

  return (
    <section
      className="border-line-strong bg-surface shrink-0 border-t px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      data-testid="table-setup-panel"
    >
      <div className="mb-2.5 flex w-full min-w-0 items-center gap-2">
        <button
          type="button"
          data-testid="table-open-settings"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onOpenSettings}
        >
          <div className="min-w-0 flex-1">
            <p className="num truncate text-[14px] font-extrabold">{blindsLine}</p>
            <p className="text-ink-3 truncate text-[10.5px]">{meta}</p>
          </div>
        </button>
        <StackDisplayToggle
          compact
          mode={mode === "bb" && canUseBb(bb) ? "bb" : "chips"}
          disabled={!canUseBb(bb)}
          onChange={onModeChange}
        />
        <button
          type="button"
          data-testid="table-open-settings-btn"
          className="border-line-strong bg-surface-2 text-ink-2 inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-bold whitespace-nowrap min-[390px]:px-3 min-[390px]:text-[12.5px]"
          onClick={onOpenSettings}
        >
          Настройки
        </button>
      </div>
      <button
        type="button"
        data-testid={playing ? "table-resume-hand" : "table-start-hand"}
        disabled={playing ? false : startBlocked}
        className="bg-gold-grad text-ink-ongold disabled:bg-surface-2 disabled:text-ink-3 flex h-[52px] w-full items-center justify-center rounded-xl text-[15.5px] font-extrabold disabled:opacity-100"
        onClick={() => {
          if (playing) onResume?.();
          else dispatch({ type: "startHand" });
        }}
      >
        {playing
          ? "Продолжить"
          : `Начать раздачу · ${count} ${pluralRu(count, "игрок", "игрока", "игроков")}`}
      </button>
      {stackHint ? (
        <p
          className="text-ink-3 mt-1.5 text-center text-[12px] font-semibold"
          data-testid="table-start-hint"
        >
          {stackHint}
        </p>
      ) : null}
    </section>
  );
}

function SetupSettingsSheet({
  state,
  dispatch,
  onDone,
  actionCount,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
  onDone: () => void;
  actionCount: number;
}) {
  const confirm = useConfirm();
  const keyboardInset = useVisualViewportInset();
  const bb = state.blinds.bb;
  const anteMode = wizardAnteMode(state.blinds);

  const requestTableSize = async (next: TableSize) => {
    if (next === state.tableSize) return;
    if (actionCount > 0) {
      const ok = await confirm({
        title: "Изменить состав?",
        description: lineupResetWarning(actionCount),
        confirmLabel: "Сбросить",
        cancelLabel: "Отмена",
        variant: "danger",
      });
      if (!ok) return;
    }
    const lost = seatsLostWhenResizing(state.occupied, next);
    if (lost.length > 0) {
      const ok = await confirm({
        title: "Уменьшить стол?",
        description: tableShrinkWarning(lost),
        confirmLabel: "Уменьшить",
        cancelLabel: "Отмена",
      });
      if (!ok) return;
    }
    dispatch({ type: "setTableSize", size: next });
  };

  return (
    <div className="absolute inset-0 z-10 overflow-hidden" data-testid="table-settings-sheet">
      <button
        type="button"
        aria-label="Закрыть настройки"
        className="absolute inset-0 bg-black/55"
        onClick={onDone}
      />
      <section
        className="border-line-strong bg-surface absolute inset-x-0 flex flex-col overflow-hidden rounded-t-[20px] border-t px-3.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        style={{
          bottom: keyboardInset,
          maxHeight: keyboardInset > 0 ? `calc(100% - ${keyboardInset}px)` : "100%",
        }}
      >
        <div className="bg-line-strong mx-auto mb-2 h-1 w-9 rounded-full" />
        <div className="mb-3 flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[16px] font-extrabold">Настройки стола</h2>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <BlindField
            label="SB"
            chips={state.blinds.sb}
            bb={bb}
            mode="chips"
            muted={!state.blindsManual.sb}
            onChange={(value) => {
              if (value != null && value > 0)
                dispatch({ type: "setBlinds", blinds: { sb: value } });
            }}
          />
          <BlindField
            label="BB"
            chips={state.blinds.bb}
            bb={bb}
            mode="chips"
            muted={!state.blindsManual.bb}
            onChange={(value) => {
              if (value != null && value > 0)
                dispatch({ type: "setBlinds", blinds: { bb: value } });
            }}
          />
        </div>
        <div className="mb-4">
          <BlindField
            label="Анте"
            chips={state.blinds.ante}
            bb={bb}
            mode="chips"
            min={0}
            testId="setup-ante-stepper"
            muted={!state.blindsManual.ante}
            onChange={(value) => {
              if (value != null && value >= 0)
                dispatch({ type: "setBlinds", blinds: { ante: value } });
            }}
          />
          <p className="text-ink-3 mt-1.5 text-[11px] leading-snug">
            <span data-testid="ante-mode-hint">
              {anteMode === "bb"
                ? "Анте платит только большой блайнд"
                : "Анте платит каждый игрок за столом"}
            </span>
            {" · "}
            <button
              type="button"
              data-testid="ante-mode-toggle"
              aria-pressed={anteMode === "occupied"}
              aria-label="Формат анте"
              className="text-gold font-extrabold underline-offset-2 hover:underline"
              onClick={() =>
                dispatch({
                  type: "setBlinds",
                  blinds: { ante_mode: anteMode === "bb" ? "occupied" : "bb" },
                })
              }
            >
              изменить
            </button>
          </p>
        </div>
        <div className="mb-3.5">
          <span className="text-ink-3 mb-1.5 block text-[10.5px] font-extrabold tracking-[0.06em] uppercase">
            Мест за столом
          </span>
          <div
            role="group"
            aria-label="Мест за столом"
            data-testid="table-size-select"
            className="flex min-w-0 items-center gap-1.5"
          >
            {TABLE_SIZE_CHOICES.map((size) => (
              <button
                key={size}
                type="button"
                data-testid={`table-size-${size}`}
                aria-pressed={state.tableSize === size}
                className={cn(
                  "border-line-strong bg-surface-2 h-11 min-w-0 flex-1 rounded-xl border text-[14px] font-extrabold",
                  state.tableSize === size && "border-line-gold bg-gold-soft text-gold",
                )}
                onClick={() => void requestTableSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3.5">
          <span className="text-ink-3 mb-1.5 block text-[10.5px] font-extrabold tracking-[0.06em] uppercase">
            Турнир
          </span>
          <HandLinkSelect
            labeled={false}
            eventId={state.eventId}
            seriesId={state.seriesId}
            liveSessionId={state.liveSessionId}
            onChange={(next) => dispatch({ type: "setLink", ...next })}
          />
        </div>
        <button
          type="button"
          data-testid="table-settings-done"
          className="bg-gold-grad text-ink-ongold flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-extrabold"
          onClick={onDone}
        >
          Готово
        </button>
      </section>
    </div>
  );
}

function BlindField({
  label,
  chips,
  bb,
  mode,
  min = 1,
  testId,
  muted = false,
  onChange,
}: {
  label: string;
  chips: number;
  bb: number;
  mode: "chips" | "bb";
  min?: number;
  testId?: string;
  muted?: boolean;
  onChange: (chips: number | null) => void;
}) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <span className="text-ink-3 mb-1 block text-[10.5px] font-extrabold tracking-[0.06em] uppercase">
        {label}
      </span>
      <ChipAmountInput
        chips={chips}
        bb={bb}
        mode={mode}
        min={min}
        stepKind="bet"
        muted={muted}
        ariaLabel={label}
        onChange={onChange}
        className="text-center text-[16px] font-extrabold"
        wrapperClassName={STEPPER_CLASS}
      />
    </div>
  );
}
