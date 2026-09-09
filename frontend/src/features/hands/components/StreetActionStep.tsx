import { useEffect, useMemo, useState, type Dispatch } from "react";

import type { HandAction } from "@/api/types/hands";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ActionBadge } from "@/features/hands/components/ActionBadge";
import { BoardByStreet } from "@/features/hands/components/BoardByStreet";
import { CardDeck } from "@/features/hands/components/CardDeck";
import { ChipAmountInput } from "@/features/hands/components/ChipAmountInput";
import { FoldedEarlierList } from "@/features/hands/components/FoldedEarlierList";
import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";
import { formatActionPhrase, lastActionBySeat } from "@/features/hands/lib/actionTone";
import {
  foldedEarlierPlayers,
  foldStreetBySeat,
  isVisibleOnStreet,
} from "@/features/hands/lib/foldStreet";
import {
  boardPickerPrompt,
  boardReplaceHint,
  nextStreet,
  STREET_TITLE,
} from "@/features/hands/lib/handSchema";
import { postflopBetSizes, preflopBetSizes } from "@/features/hands/lib/betSizePresets";
import {
  actionOrder,
  canAct,
  type LegalActions,
  type SeatRuntime,
} from "@/features/hands/lib/hand-engine";
import { canUseBb, formatAmountInput, formatStackAmount } from "@/features/hands/lib/stackDisplay";
import { useStackDisplay } from "@/features/hands/lib/useStackDisplay";
import {
  canUndo,
  currentStreet,
  currentStreetIndex,
  followingActionCount,
  isEditingAllBoard,
  playableStreets,
  stateBeforeAction,
  usedCards,
  wizardLegal,
  type WizardAction,
  type WizardState,
} from "@/features/hands/lib/wizardState";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";

function lastActionIndex(actions: HandAction[], seat: number): number {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (actions[index]?.seat === seat) return index;
  }
  return -1;
}

function queueSeats(
  seats: SeatRuntime[],
  street: WizardState["streets"][number]["street"],
): SeatRuntime[] {
  const lookup = new Map(seats.map((seat) => [seat.seat, seat]));
  return actionOrder(seats, street)
    .map((seat) => lookup.get(seat))
    .filter((seat): seat is SeatRuntime => seat != null);
}

export function StreetActionStep({
  state,
  dispatch,
  showUndo = true,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  showUndo?: boolean;
}) {
  const confirm = useConfirm();
  const current = currentStreet(state);
  const streetIndex = currentStreetIndex(state);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [amountChips, setAmountChips] = useState<number | null>(null);
  const [sizeKey, setSizeKey] = useState<string | null>(null);
  const [sizing, setSizing] = useState(false);
  const { mode, setMode } = useStackDisplay();
  const bbOk = canUseBb(state.blinds.bb);
  const displayMode = bbOk && mode === "bb" ? "bb" : "chips";
  const formatAmount = (value: number) => formatStackAmount(value, displayMode, state.blinds.bb);

  useEffect(() => {
    setEditIndex(null);
    setAmountChips(null);
    setSizeKey(null);
    setSizing(false);
  }, [current.street, streetIndex, state.pickingBoard]);

  useEffect(() => {
    if (editIndex != null && editIndex >= current.actions.length) setEditIndex(null);
  }, [current.actions.length, editIndex]);

  const viewState = editIndex != null ? stateBeforeAction(state, editIndex) : state;
  const living = useMemo(() => {
    try {
      return wizardLegal(viewState).state.seats.filter((seat) => !seat.folded);
    } catch {
      return [];
    }
  }, [viewState]);
  const replay = useMemo(() => {
    try {
      return wizardLegal(viewState);
    } catch {
      return null;
    }
  }, [viewState]);

  useEffect(() => {
    setAmountChips(null);
    setSizeKey(null);
    setSizing(false);
  }, [replay?.state.actorSeat, current.street, editIndex]);

  const undoButton = (
    <button
      type="button"
      data-testid="undo-action"
      disabled={!canUndo(state)}
      className="text-ink-2 border-line-strong h-9 shrink-0 rounded-[10px] border px-3 text-[13px] font-extrabold disabled:opacity-40"
      onClick={() => dispatch({ type: "undo" })}
    >
      Отменить
    </button>
  );

  if (state.pickingBoard) {
    const nxt = nextStreet(current.street) ?? "flop";
    const replacing = state.replaceBoardIndex;
    const focusCard = replacing != null ? state.boardDraft[replacing] : undefined;
    const used = usedCards(state);
    const hint = replacing != null ? boardReplaceHint(replacing) : boardPickerPrompt(nxt);
    return (
      <>
        <div className="flex items-start justify-between gap-2 px-[13px] pt-3.5">
          <div>
            <div className="text-[19px] font-extrabold tracking-tight" data-testid="street-title">
              {STREET_TITLE[nxt]}
            </div>
            <div className="text-ink-2 mt-0.5 text-[12.5px]" data-testid="board-picker-hint">
              {hint}
            </div>
          </div>
          {showUndo ? undoButton : null}
        </div>
        <section className="border-line-gold mx-[13px] mt-3 rounded-[18px] border p-[13px] text-center">
          <BoardByStreet
            street={nxt}
            cards={state.boardDraft}
            replacing={replacing}
            onSelect={(index) => dispatch({ type: "startReplaceBoardCard", index })}
          />
          <div className="mt-3">
            <CardDeck
              selected={focusCard ? [focusCard] : []}
              used={used}
              onToggle={(card) =>
                replacing != null
                  ? dispatch({ type: "replaceBoardCard", card })
                  : dispatch({ type: "toggleBoardCard", card })
              }
            />
          </div>
        </section>
      </>
    );
  }

  const legal = replay?.legal;
  const actor = replay?.state.seats.find((seat) => seat.seat === replay.state.actorSeat);
  const pot = replay?.state.pot ?? 0;
  const currentBet = replay?.state.currentBet ?? 0;
  const lastBySeat = lastActionBySeat(current.actions);
  const streetsForFolds = playableStreets(viewState);
  const foldMap = foldStreetBySeat(streetsForFolds);
  const queued = replay ? queueSeats(replay.state.seats, current.street) : [];
  const rows = queued.filter((seat) => isVisibleOnStreet(seat.seat, current.street, foldMap));
  const earlier = foldedEarlierPlayers(queued, streetsForFolds, current.street);
  const actingCount = replay?.state.seats.filter(canAct).length ?? 0;
  const livingCount = replay?.state.seats.filter((seat) => !seat.folded).length ?? 0;
  const allInRunout = livingCount >= 2 && actingCount < 2;

  const applyAction = async (next: HandAction) => {
    if (editIndex == null) {
      dispatch({ type: "addAction", action: next });
      return;
    }
    const count = followingActionCount(state, editIndex);
    if (count > 0) {
      const ok = await confirm({
        title: "Действия после этого будут удалены",
        description: `Удалятся ${count} ${pluralRu(count, "действие", "действия", "действий")}.`,
        confirmLabel: "Изменить",
        cancelLabel: "Отмена",
      });
      if (!ok) return;
    }
    dispatch({ type: "replaceAction", index: editIndex, action: next });
    setEditIndex(null);
  };

  return (
    <>
      <div className="flex items-start justify-between gap-2 px-[13px] pt-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <div className="text-[15px] font-extrabold tracking-tight" data-testid="street-title">
            {STREET_TITLE[current.street]}
          </div>
          <div className="text-ink-2 text-[12.5px]" data-testid="street-living">
            Осталось {living.length} {pluralRu(living.length, "игрок", "игрока", "игроков")}
            {editIndex != null ? " · правка" : ""}
          </div>
        </div>
        {showUndo ? undoButton : null}
      </div>
      {current.street !== "preflop" ? <StreetBoardBlock state={state} dispatch={dispatch} /> : null}
      <section className="border-line bg-surface mx-[13px] mt-3 rounded-[18px] border p-[13px]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-ink-3 text-[11px] font-semibold">Банк</div>
            <div
              className="text-gold num text-[22px] leading-none font-extrabold"
              data-testid="street-pot"
            >
              {formatAmount(pot)}
            </div>
          </div>
          {currentBet > 0 ? (
            <div className="text-right">
              <div className="text-ink-3 text-[11px] font-semibold">Ставка</div>
              <div
                className="text-gold num text-[22px] leading-none font-extrabold"
                data-testid="street-bet"
              >
                {formatAmount(currentBet)}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5" data-testid="street-queue">
          {rows.map((seat) => {
            const isActor = replay?.state.actorSeat === seat.seat;
            const last = lastBySeat.get(seat.seat);
            const actedHere = lastActionIndex(current.actions, seat.seat) >= 0;
            const actedOnStreet = actedHere || seat.folded;
            const canEdit = actedHere;
            const rowState = isActor ? "acting" : actedOnStreet ? "acted" : "waiting";
            const folded = Boolean(seat.folded);
            const rowClass = cn(
              "flex items-center gap-2.5 rounded-md border px-[11px] text-left",
              isActor &&
                "border-line-gold bg-gold-soft min-h-[58px] py-3 shadow-[0_0_0_1px_rgba(217,179,106,0.55)]",
              !isActor && folded && "border-line bg-surface-2 text-ink-3 min-h-[44px] py-2",
              !isActor &&
                !folded &&
                actedOnStreet &&
                "border-line-strong bg-surface-2 min-h-[44px] py-2",
              !isActor && !actedOnStreet && "border-line-strong bg-surface-2 min-h-[44px] py-2",
            );
            const shownAction = !isActor
              ? (last ?? (folded ? ({ seat: seat.seat, action: "fold" } as const) : null))
              : null;
            const body = (
              <>
                <span
                  className={cn(
                    "w-9 shrink-0 text-[10.5px] font-extrabold",
                    isActor || !folded ? "text-gold" : "text-ink-3",
                  )}
                >
                  {seat.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[13.5px] font-bold",
                      !isActor && folded && "text-ink-3 font-semibold",
                    )}
                  >
                    {seat.name}
                  </span>
                  {!folded ? (
                    <span className="text-ink-2 mt-0.5 block text-[12px] leading-none">
                      стек {formatAmount(seat.stack)}
                    </span>
                  ) : null}
                </span>
                {isActor ? (
                  <span className="bg-gold-grad text-ink-ongold shrink-0 rounded-[7px] px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.06em] uppercase">
                    ходит
                  </span>
                ) : null}
                {shownAction ? (
                  <ActionBadge action={shownAction.action}>
                    {formatActionPhrase(shownAction, formatAmount, seat.committed)}
                  </ActionBadge>
                ) : null}
                {current.street === "preflop" && seat.committed > 0 && !actedHere && !folded ? (
                  <span
                    className="text-ink-3 shrink-0 text-right text-[11px] font-semibold"
                    data-testid="blind-mark"
                  >
                    блайнд
                    <span className="num mt-0.5 block text-[12px] font-normal">
                      {formatAmount(seat.committed)}
                    </span>
                  </span>
                ) : null}
              </>
            );
            if (canEdit) {
              return (
                <button
                  key={seat.seat}
                  type="button"
                  data-seat={seat.seat}
                  data-state={rowState}
                  data-folded={folded ? "1" : "0"}
                  data-testid={`acted-seat-${seat.seat}`}
                  className={rowClass}
                  onClick={() => {
                    const index = lastActionIndex(current.actions, seat.seat);
                    setEditIndex((currentIndex) => (currentIndex === index ? null : index));
                  }}
                >
                  {body}
                </button>
              );
            }
            return (
              <div
                key={seat.seat}
                data-seat={seat.seat}
                data-state={rowState}
                data-folded={folded ? "1" : "0"}
                className={rowClass}
              >
                {body}
              </div>
            );
          })}
        </div>
        <FoldedEarlierList players={earlier} resetKey={`${current.street}-${streetIndex}`} />
        {legal && actor && replay?.state.actorSeat !== null && !allInRunout ? (
          <ActionPad
            legal={legal}
            actorSeat={actor.seat}
            street={current.street}
            pot={pot}
            currentBet={currentBet}
            maxBet={legal.maxBet}
            minBet={legal.minBet}
            amountChips={amountChips}
            sizeKey={sizeKey}
            sizing={sizing}
            bb={state.blinds.bb}
            mode={displayMode}
            bbDisabled={!bbOk}
            onAmountChips={setAmountChips}
            onSizeKey={setSizeKey}
            onSizing={setSizing}
            onMode={setMode}
            onAct={(action) => void applyAction(action)}
          />
        ) : (
          <p
            className="text-ink-2 mt-3 text-center text-[13px]"
            data-testid={allInRunout ? "street-allin-runout" : "street-betting-done"}
          >
            {allInRunout
              ? "Все игроки в олл-ине — торговли нет, раздаются карты"
              : "Ставки на этой улице завершены"}
          </p>
        )}
      </section>
    </>
  );
}

function StreetBoardBlock({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}) {
  const current = currentStreet(state);
  const editingAll = isEditingAllBoard(state);
  const replacing = state.replaceBoardIndex;
  const cards = state.editingBoard ? state.boardDraft : current.board;
  const used = usedCards(state);
  const focusCard = replacing != null ? cards[replacing] : undefined;
  const selected = focusCard ? [focusCard] : editingAll ? state.boardDraft : [];
  const showDeck = state.editingBoard;
  const hint = replacing != null ? boardReplaceHint(replacing) : null;

  return (
    <section
      data-testid="street-board"
      className="border-line-gold mx-[13px] mt-3 rounded-[18px] border p-[13px] text-center"
    >
      <BoardByStreet
        street={current.street}
        cards={cards}
        replacing={replacing}
        onSelect={(index) => {
          if (editingAll) {
            const card = cards[index];
            if (card) dispatch({ type: "toggleBoardCard", card });
            return;
          }
          dispatch({ type: "startReplaceBoardCard", index });
        }}
      />
      {hint ? (
        <div
          className="text-gold mt-2 text-[12.5px] font-extrabold"
          data-testid="board-replace-hint"
        >
          {hint}
        </div>
      ) : null}
      <button
        type="button"
        data-testid="edit-board"
        className="text-gold mt-2.5 text-[12.5px] font-extrabold"
        onClick={(event) => {
          event.stopPropagation();
          if (current.street === "flop") {
            dispatch({ type: "startEditBoard" });
            return;
          }
          const index = current.street === "turn" ? 3 : 4;
          if (cards[index]) dispatch({ type: "startReplaceBoardCard", index });
          else dispatch({ type: "startEditBoard" });
        }}
      >
        Изменить карты
      </button>
      {showDeck ? (
        <div className="mt-3" onClick={(event) => event.stopPropagation()}>
          <CardDeck
            selected={selected}
            used={used}
            onToggle={(card) =>
              replacing != null
                ? dispatch({ type: "replaceBoardCard", card })
                : dispatch({ type: "toggleBoardCard", card })
            }
          />
        </div>
      ) : null}
    </section>
  );
}

function ActionPad({
  legal,
  actorSeat,
  street,
  pot,
  currentBet,
  maxBet,
  minBet,
  amountChips,
  sizeKey,
  sizing,
  bb,
  mode,
  bbDisabled,
  onAmountChips,
  onSizeKey,
  onSizing,
  onMode,
  onAct,
}: {
  legal: LegalActions;
  actorSeat: number;
  street: WizardState["streets"][number]["street"];
  pot: number;
  currentBet: number;
  maxBet: number;
  minBet: number;
  amountChips: number | null;
  sizeKey: string | null;
  sizing: boolean;
  bb: number;
  mode: "chips" | "bb";
  bbDisabled: boolean;
  onAmountChips: (value: number | null) => void;
  onSizeKey: (value: string | null) => void;
  onSizing: (value: boolean) => void;
  onMode: (mode: "chips" | "bb") => void;
  onAct: (action: HandAction) => void;
}) {
  const formatAmount = (value: number) => formatStackAmount(value, mode, bb);
  const presets =
    street === "preflop"
      ? preflopBetSizes(currentBet, minBet, maxBet)
      : postflopBetSizes(pot, minBet, maxBet);
  const applySize = (key: string, value: number) => {
    onSizeKey(key);
    onAmountChips(Math.max(minBet, Math.min(maxBet, value)));
  };
  const parsedAmount = amountChips;
  const belowMin =
    parsedAmount != null && parsedAmount < minBet && parsedAmount < maxBet;
  const submitBet = () => {
    if (amountChips == null || amountChips <= 0) return;
    if (belowMin) return;
    const total = Math.min(amountChips, maxBet);
    const isAllin = total >= maxBet;
    onAct({
      seat: actorSeat,
      action: isAllin ? "allin" : legal.canRaise ? "raise" : "bet",
      amount: total,
    });
  };

  return (
    <>
      <div className="mt-2.5 flex min-w-0 gap-1.5">
        {legal.canFold ? (
          <button
            type="button"
            className="text-danger h-11 min-w-0 flex-1 rounded-md border border-[rgba(255,107,107,.3)] bg-[rgba(255,107,107,.1)] px-1 text-[13px] font-extrabold"
            onClick={() => onAct({ seat: actorSeat, action: "fold" })}
          >
            Фолд
          </button>
        ) : null}
        {legal.canCheck ? (
          <button
            type="button"
            className="text-ink-2 border-line-strong bg-surface-2 h-11 min-w-0 flex-1 rounded-md border px-1 text-[13px] font-extrabold"
            onClick={() => onAct({ seat: actorSeat, action: "check" })}
          >
            Чек
          </button>
        ) : null}
        {legal.canCall ? (
          <button
            type="button"
            className="text-live h-11 min-w-0 flex-1 rounded-md border border-[rgba(67,217,163,.3)] bg-[rgba(67,217,163,.13)] px-1 text-[13px] font-extrabold"
            onClick={() => onAct({ seat: actorSeat, action: "call", amount: legal.callTarget })}
          >
            Колл {formatAmount(legal.callAmount)}
          </button>
        ) : null}
        {legal.canBet || legal.canRaise ? (
          <button
            type="button"
            disabled={sizing && (amountChips == null || belowMin)}
            className={cn(
              "text-gold border-line-gold bg-gold-soft h-11 min-w-0 flex-1 rounded-md border px-1 text-[13px] font-extrabold",
              sizing && "bg-gold-grad text-ink-ongold",
              sizing && (amountChips == null || belowMin) && "opacity-40",
            )}
            onClick={() => {
              if (!sizing) {
                onSizing(true);
                return;
              }
              submitBet();
            }}
          >
            {legal.canRaise ? "Рейз" : "Бет"}
          </button>
        ) : null}
      </div>
      {sizing && (legal.canBet || legal.canRaise) ? (
        <div
          data-testid="bet-sizing"
          className="border-line bg-surface-2 mt-2.5 rounded-[14px] border p-3"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="text-[13px] font-extrabold">
              {legal.canRaise ? "Размер рейза" : "Размер бета"}
            </div>
            <StackDisplayToggle mode={mode} disabled={bbDisabled} onChange={onMode} />
          </div>
          {bbDisabled ? (
            <p className="text-ink-3 mb-2 text-right text-[11.5px]" data-testid="bb-unit-hint">
              Укажите размер BB
            </p>
          ) : null}
          <div
            className={cn(
              "grid gap-1.5",
              street === "preflop"
                ? "grid-cols-2 min-[380px]:grid-cols-4"
                : "grid-cols-2 min-[380px]:grid-cols-3",
            )}
          >
            {presets.map((item) => {
              const selected = sizeKey === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  data-size={item.key}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-col items-center justify-center rounded-[10px] border px-1 py-1.5",
                    item.allin
                      ? "bg-gold-grad text-ink-ongold shadow-sheen border-transparent font-extrabold"
                      : "border-line-strong bg-surface text-ink-2 font-extrabold",
                    selected && !item.allin && "border-line-gold bg-gold-soft text-gold",
                  )}
                  onClick={() => applySize(item.key, item.to)}
                >
                  <span className="text-[13px] leading-none">{item.label}</span>
                  <span
                    className={cn(
                      "num mt-1 text-[10px] leading-none font-semibold",
                      item.allin ? "text-ink-ongold/80" : "text-ink-3",
                      selected && !item.allin && "text-gold",
                    )}
                  >
                    {formatAmount(item.to)}
                  </span>
                </button>
              );
            })}
          </div>
          <ChipAmountInput
            chips={amountChips}
            bb={bb}
            mode={mode}
            ariaLabel="Сумма ставки"
            placeholder={`мин. ${formatAmountInput(minBet, mode, bb)}`}
            wrapperClassName="mt-2.5 w-full"
            className="border-line-strong bg-bg num h-[46px] w-full min-w-0 rounded-md border text-center text-[18px] font-extrabold"
            min={minBet}
            max={maxBet}
            maxHint="Больше стека"
            error={
              amountChips != null && amountChips <= 0
                ? "Ставка должна быть больше нуля"
                : belowMin
                  ? `Минимум ${formatAmount(minBet)}`
                  : undefined
            }
            stepKind="bet"
            onChange={(value) => {
              onSizeKey(null);
              onAmountChips(value);
            }}
          />
        </div>
      ) : null}
    </>
  );
}
