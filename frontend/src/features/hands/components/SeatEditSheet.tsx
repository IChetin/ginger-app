import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ChipAmountInput } from "@/features/hands/components/ChipAmountInput";
import { SeatNameField } from "@/features/hands/components/SeatNameField";
import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";
import {
  STACK_MUST_BE_POSITIVE,
  formatChipInput,
  parseChipInput,
  type HandComposition,
} from "@/features/hands/lib/hand-engine";
import { displaySeatName } from "@/features/hands/lib/playerNames";
import { chairPosition, positionLabel, requiredSeats } from "@/features/hands/lib/positions";
import {
  canUseBb,
  stackPlaceholder,
  type StackDisplayMode,
} from "@/features/hands/lib/stackDisplay";
import { lineupResetWarning } from "@/features/hands/lib/tableInputState";
import { useOpponentNames } from "@/features/hands/lib/useOpponentNames";
import { useVisualViewportInset } from "@/lib/useVisualViewportInset";
import { cn } from "@/lib/utils";

const STEPPER_CLASS = "border-line-strong bg-surface-2 h-11 w-full min-w-0 rounded-[12px] border";

export function SeatEditSheet({
  state,
  seat,
  stackMode,
  actionCount,
  focusName = false,
  overlay = "float",
  onClose,
  onSetName,
  onSetStack,
  onRemove,
  onMoveHero,
  onStartMove,
  onStackModeChange,
}: {
  state: HandComposition;
  seat: number;
  stackMode: StackDisplayMode;
  actionCount: number;
  focusName?: boolean;
  overlay?: "float" | "modal" | "dock";
  onClose: () => void;
  onSetName: (seat: number, name: string) => void;
  onSetStack: (seat: number, value: string) => void;
  onRemove: (seat: number) => void;
  onMoveHero: (seat: number) => void;
  onStartMove?: (seat: number) => void;
  onStackModeChange: (mode: StackDisplayMode) => void;
}) {
  const names = useOpponentNames();
  const confirm = useConfirm();
  const keyboardInset = useVisualViewportInset();
  const bb = state.blinds.bb;
  const displayMode = stackMode === "bb" && canUseBb(bb) ? "bb" : "chips";
  const required = requiredSeats(state.tableSize, state.buttonSeat, state.heroSeat, state.occupied);
  const canRemove = !required.includes(seat);
  const isHero = seat === state.heroSeat;
  const chips = parseChipInput(state.stacks[seat] ?? "");
  const stackInvalid = chips != null && chips <= 0;
  const name = displaySeatName(seat, state.heroSeat, state.names[seat]);
  const modal = overlay === "modal";
  const dock = overlay === "dock";

  const confirmLineup = async () => {
    if (actionCount <= 0) return true;
    return confirm({
      title: "Изменить состав?",
      description: lineupResetWarning(actionCount),
      confirmLabel: "Сбросить",
      cancelLabel: "Отмена",
      variant: "danger",
    });
  };

  const sheet = (
    <section
      className={cn(
        "border-line-gold bg-surface pointer-events-auto overflow-hidden rounded-[18px] border p-3.5",
        modal || dock ? "relative mx-3.5 mb-3.5" : "absolute inset-x-3.5",
      )}
      style={
        modal || dock
          ? { marginBottom: Math.max(14, keyboardInset) }
          : {
              bottom: Math.max(14, keyboardInset),
              maxHeight: keyboardInset > 0 ? `calc(100% - ${keyboardInset}px)` : "100%",
            }
      }
      data-testid="table-seat-sheet"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="border-line-gold bg-gold-soft text-gold inline-flex h-5 items-center rounded-[5px] border px-2 text-[10px] font-extrabold">
          {positionLabel(
            chairPosition(state.tableSize, state.buttonSeat, seat),
            state.occupied.length,
          )}
        </span>
        <p className="min-w-0 flex-1 truncate text-[14px] font-extrabold">
          {isHero ? name : "Игрок"}
        </p>
        <button
          type="button"
          aria-label="Закрыть"
          data-testid="seat-edit-close"
          className="bg-surface-2 text-ink-3 flex h-7 w-7 items-center justify-center rounded-[9px] text-[16px]"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {isHero ? null : (
        <SeatNameField
          autoFocus={focusName}
          seat={seat}
          heroSeat={state.heroSeat}
          name={name}
          suggestions={names.suggestions}
          showPrivacyHint={names.showPrivacyHint}
          onRemember={(value) => void names.remember(value)}
          onForget={(value) => {
            void (async () => {
              const ok = await confirm({
                title: "Удалить из истории?",
                description: value,
                confirmLabel: "Удалить",
                cancelLabel: "Отмена",
                variant: "danger",
              });
              if (!ok) return;
              await names.forget(value);
            })();
          }}
          onPrivacySeen={() => void names.markPrivacySeen()}
          onCommit={(value) => onSetName(seat, value)}
        />
      )}
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-ink-3 text-[10.5px] font-extrabold tracking-[0.06em] uppercase">
          Стек
        </span>
        <StackDisplayToggle
          compact
          mode={displayMode}
          disabled={!canUseBb(bb)}
          onChange={onStackModeChange}
        />
      </div>
      <ChipAmountInput
        chips={chips}
        bb={bb}
        mode={displayMode}
        testId="stack-input"
        ariaLabel={`Стек ${name}`}
        placeholder={stackPlaceholder(displayMode, bb)}
        wrapperClassName={STEPPER_CLASS}
        error={stackInvalid ? STACK_MUST_BE_POSITIVE : undefined}
        onChange={(value) => onSetStack(seat, value != null ? formatChipInput(value) : "")}
      />
      <div className="mt-2.5 flex gap-2">
        {canRemove ? (
          <button
            type="button"
            data-testid="table-seat-remove"
            className="border-danger/30 text-danger bg-surface-2 h-[38px] min-w-0 flex-1 rounded-xl border text-[12.5px] font-bold"
            onClick={() => {
              void (async () => {
                if (!(await confirmLineup())) return;
                onRemove(seat);
                onClose();
              })();
            }}
          >
            Убрать со стола
          </button>
        ) : null}
        {isHero ? null : (
          <button
            type="button"
            data-testid="table-seat-set-hero"
            className="border-line-strong bg-surface-2 text-ink-2 h-[38px] min-w-0 flex-1 rounded-xl border text-[12.5px] font-bold"
            onClick={() => {
              void (async () => {
                if (!(await confirmLineup())) return;
                onMoveHero(seat);
                onClose();
              })();
            }}
          >
            Перенести героя сюда
          </button>
        )}
      </div>
      {onStartMove ? (
        <button
          type="button"
          data-testid="table-seat-move"
          className="border-line-strong bg-surface-2 text-ink-2 mt-2 h-[38px] w-full rounded-xl border text-[12.5px] font-bold"
          onClick={() => {
            onStartMove(seat);
            onClose();
          }}
        >
          Пересадить
        </button>
      ) : null}
    </section>
  );

  if (modal || dock) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-30 flex flex-col justify-end",
          dock && "pointer-events-none",
        )}
        data-testid="seat-edit-overlay"
      >
        {modal ? (
          <button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
          />
        ) : null}
        {sheet}
      </div>
    );
  }

  return <div className="pointer-events-none absolute inset-0 z-10">{sheet}</div>;
}
