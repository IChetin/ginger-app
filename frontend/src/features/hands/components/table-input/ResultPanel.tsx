import type { Dispatch } from "react";

import { PlayingCard } from "@/features/hands/components/PlayingCard";
import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";
import { TABLE_SHEET_CLASS } from "@/features/hands/components/table-input/sheet";
import { TableUndoButton } from "@/features/hands/components/table-input/TableUndoButton";
import { describeMadeHand } from "@/features/hands/lib/describeHand";
import {
  buildHandData,
  isSeatMucked,
  lastReplayState,
  livingSeats,
  resolveWinners,
} from "@/features/hands/lib/hand-engine";
import { displaySeatName } from "@/features/hands/lib/playerNames";
import { canUseBb, formatReplayProfit } from "@/features/hands/lib/stackDisplay";
import type { TableInputAction, TableInputState } from "@/features/hands/lib/tableInputState";
import { nextStreetToDeal } from "@/features/hands/lib/tableInputState";
import { useTableStackDisplay } from "@/features/hands/lib/useTableStackDisplay";
import { cn } from "@/lib/utils";

const CARDS_HINT = "Карты игрока — тап по его рубашкам на столе";

export function ResultPanel({
  state,
  dispatch,
  onSave,
  saving,
  error,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  const { mode, setMode } = useTableStackDisplay();
  const living = livingSeats(state);
  const winners = resolveWinners(state);
  const heroNeedsCards = living.includes(state.heroSeat) && state.heroCards.length !== 2;
  let profit = 0;
  try {
    profit = buildHandData(state).result.hero_profit;
  } catch {
    profit = 0;
  }
  const saveBlocked =
    winners.length === 0
      ? "Укажите, кто забрал банк"
      : state.heroCards.length !== 2
        ? "Без своих карт эквити не считается, победителя нужно указать вручную"
        : null;
  let sidePotWarning = false;
  try {
    sidePotWarning = lastReplayState(state).hasSidePotWarning;
  } catch {
    sidePotWarning = false;
  }
  const dealLabel = nextStreetToDeal(state);
  const bb = state.blinds.bb;
  const unit = mode === "bb" && canUseBb(bb) ? "bb" : "chips";

  return (
    <section className={TABLE_SHEET_CLASS} data-testid="table-result-panel">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <StackDisplayToggle compact mode={unit} disabled={!canUseBb(bb)} onChange={setMode} />
        <TableUndoButton state={state} dispatch={dispatch} />
      </div>
      {state.phase === "showdown" ? (
        <>
          <h2 className="text-[15px] font-extrabold">Вскрытие</h2>
          <p className="text-ink-3 mt-1 text-[12px]">
            Карты оппонентов можно не вводить. Если не показали — отметьте это, затем укажите
            победителя тапом по месту.
          </p>
          <p className="text-ink-3 mt-1 text-[12px]">{CARDS_HINT}</p>
          {heroNeedsCards ? <EnterHeroCards dispatch={dispatch} /> : null}
          <ShowdownList state={state} dispatch={dispatch} living={living} />
          {sidePotWarning ? (
            <p
              className="text-warn mt-2 text-[12px] font-semibold"
              data-testid="table-sidepot-warning"
            >
              Несколько игроков в олл-ине с разными стеками: итог может быть неточным (сайд-поты
              пока не считаются).
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2">
            {dealLabel ? (
              <button
                type="button"
                data-testid="table-deal-street"
                className="bg-gold-grad text-ink-ongold flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-extrabold"
                onClick={() => dispatch({ type: "continueShowdown" })}
              >
                Раздать {dealLabel}
              </button>
            ) : null}
            <button
              type="button"
              data-testid="table-skip-to-result"
              className="border-line flex h-11 w-full items-center justify-center rounded-xl border text-[14px] font-extrabold"
              onClick={() => dispatch({ type: "skipToResult" })}
            >
              К итогу
            </button>
          </div>
        </>
      ) : state.phase === "winner" ? (
        <>
          <h2 className="text-[15px] font-extrabold">Кто забрал банк?</h2>
          <p className="text-ink-3 mt-1 text-[12px]">
            Тапните по месту на столе или выберите ниже.
          </p>
          <p className="text-ink-3 mt-1 text-[12px]">{CARDS_HINT}</p>
          {heroNeedsCards ? <EnterHeroCards dispatch={dispatch} /> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {living.map((seat) => (
              <button
                key={seat}
                type="button"
                className={cn(
                  "border-line rounded-full border px-3 py-1.5 text-[13px] font-extrabold",
                  winners.includes(seat) && "bg-gold-grad text-ink-ongold border-transparent",
                )}
                onClick={() => dispatch({ type: "pickWinner", seat })}
              >
                {displaySeatName(seat, state.heroSeat, state.names[seat])}
              </button>
            ))}
          </div>
          <ShowdownList state={state} dispatch={dispatch} living={living} />
        </>
      ) : (
        <>
          <p className="text-[22px] font-extrabold">{formatReplayProfit(profit, unit, bb)}</p>
          <p className="text-ink-3 mt-1 text-[12px]">{CARDS_HINT}</p>
          {heroNeedsCards ? <EnterHeroCards dispatch={dispatch} /> : null}
          <ShowdownList state={state} dispatch={dispatch} living={living} />
          {sidePotWarning ? (
            <p
              className="text-warn mt-2 text-[12px] font-semibold"
              data-testid="table-sidepot-warning"
            >
              Несколько игроков в олл-ине с разными стеками: итог может быть неточным (сайд-поты
              пока не считаются).
            </p>
          ) : null}
          <label className="text-ink-3 mt-3 block text-[12px] font-bold">
            Заметка
            <textarea
              className="border-line bg-surface-2 text-ink mt-1 min-h-[72px] w-full rounded-xl border px-3 py-2 text-[14px] font-medium"
              value={state.note}
              onChange={(event) => dispatch({ type: "setNote", note: event.target.value })}
            />
          </label>
          <label className="mt-2 flex items-center gap-2 text-[14px] font-semibold">
            <input
              type="checkbox"
              checked={state.isPublic}
              onChange={(event) => dispatch({ type: "setPublic", value: event.target.checked })}
            />
            Публичная ссылка
          </label>
          {error ? <p className="text-danger mt-2 text-[13px] font-semibold">{error}</p> : null}
          <button
            type="button"
            data-testid="table-save-hand"
            disabled={saving || winners.length === 0}
            className="bg-gold-grad text-ink-ongold mt-3 flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-extrabold disabled:opacity-50"
            onClick={onSave}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          {saveBlocked ? (
            <p
              className="text-ink-3 mt-1.5 text-center text-[12px] font-semibold"
              data-testid="table-save-hint"
            >
              {saveBlocked}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function ShowdownList({
  state,
  dispatch,
  living,
}: {
  state: TableInputState;
  dispatch: Dispatch<TableInputAction>;
  living: number[];
}) {
  const board = state.streets.at(-1)?.board ?? [];
  return (
    <div className="mt-2 max-h-[28vh] overflow-y-auto" data-testid="table-showdown-list">
      {living.map((seat) => {
        const isHero = seat === state.heroSeat;
        const cards = isHero ? state.heroCards : (state.showdownCards[seat] ?? []);
        const mucked = !isHero && isSeatMucked(state, seat);
        const cat = describeMadeHand(cards, board);
        const canMuck = !isHero && cards.length !== 2 && !mucked;
        const name = displaySeatName(seat, state.heroSeat, state.names[seat]);
        return (
          <div
            key={seat}
            data-testid={`table-showdown-row-${seat}`}
            className="border-line mb-1.5 flex items-center gap-2 rounded-md border px-2 py-1.5"
          >
            <div className="flex shrink-0 gap-0.5">
              {cards.length === 2 ? (
                cards.map((card) => <PlayingCard key={card} card={card} size="xs" />)
              ) : (
                <>
                  <PlayingCard back size="xs" />
                  <PlayingCard back size="xs" />
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold">
                {name}
                {cat ? (
                  <span
                    className="text-ink-3 font-semibold"
                    data-testid={`table-made-hand-${seat}`}
                  >
                    {" "}
                    · {cat}
                  </span>
                ) : null}
              </div>
              {mucked ? (
                <div className="text-ink-3 text-[11px] font-semibold">не показал</div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                data-testid={`table-showdown-cards-${seat}`}
                className="text-gold text-[11.5px] font-extrabold"
                onClick={() =>
                  dispatch(
                    isHero
                      ? { type: "openDeck", kind: "hero" }
                      : { type: "openDeck", kind: "showdown", seat },
                  )
                }
              >
                Карты
              </button>
              {canMuck ? (
                <button
                  type="button"
                  data-testid={`table-muck-seat-${seat}`}
                  className="text-ink-3 text-[11.5px] font-extrabold"
                  onClick={() => dispatch({ type: "muckSeat", seat })}
                >
                  Не показал
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EnterHeroCards({ dispatch }: { dispatch: Dispatch<TableInputAction> }) {
  return (
    <button
      type="button"
      data-testid="table-enter-hero-cards"
      className="text-gold mt-2 text-[13px] font-extrabold"
      onClick={() => dispatch({ type: "openDeck", kind: "hero" })}
    >
      Введите свои карты
    </button>
  );
}
