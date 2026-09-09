import { useEffect, useMemo, useRef, type Dispatch } from "react";

import { ActionBadge } from "@/features/hands/components/ActionBadge";
import { CardDeck } from "@/features/hands/components/CardDeck";
import { FoldedEarlierList } from "@/features/hands/components/FoldedEarlierList";
import {
  PlayingCard,
  formatChipProfit,
  formatChips,
} from "@/features/hands/components/PlayingCard";
import { formatActionPhrase, lastActionFromStreets } from "@/features/hands/lib/actionTone";
import { describeMadeHand } from "@/features/hands/lib/describeHand";
import { foldedPlayers } from "@/features/hands/lib/foldStreet";
import { boardReplaceHint } from "@/features/hands/lib/handSchema";
import {
  buildHandData,
  buildPartialData,
  isSeatMucked,
  needsManualWinner,
  resolveWinners,
  usedCards,
  wizardBoardCards,
  wizardLegal,
  type WizardAction,
  type WizardState,
} from "@/features/hands/lib/wizardState";
import { cn } from "@/lib/utils";

export function ResultStep({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}) {
  const data = useMemo(() => {
    try {
      return buildHandData(state);
    } catch {
      return buildPartialData(state);
    }
  }, [state]);
  const winners = resolveWinners(state);
  const winnerSet = new Set(winners);
  const resolved = winners.length > 0;
  const split = winners.length > 1;
  const profit = data.result.hero_profit;
  const board = wizardBoardCards(state);
  let showdownSeats = data.seats;
  try {
    const last = wizardLegal(state).state;
    showdownSeats = data.seats.filter((seat) =>
      last.seats.find((row) => row.seat === seat.seat && !row.folded),
    );
  } catch {
    showdownSeats = data.seats;
  }
  const lastBySeat = lastActionFromStreets(state.streets);
  const earlier = foldedPlayers(data.seats, state.streets);
  const orderedShowdown = [...showdownSeats].sort((a, b) => {
    const aw = winnerSet.has(a.seat) ? 0 : 1;
    const bw = winnerSet.has(b.seat) ? 0 : 1;
    if (aw !== bw) return aw - bw;
    if (a.is_hero) return -1;
    if (b.is_hero) return 1;
    return a.seat - b.seat;
  });
  const used = usedCards(state);
  const pickingSeat = state.pickingShowdownSeat;
  const pickingName = showdownSeats.find((seat) => seat.seat === pickingSeat)?.name;
  const manualWinner = needsManualWinner(state);
  const deckRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pickingSeat === null) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (deckRef.current?.contains(target)) return;
      if (target.closest("[data-testid='showdown-holes']")) return;
      dispatch({ type: "pickingShowdown", seat: null });
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [dispatch, pickingSeat]);

  return (
    <>
      <div className="px-[13px] pt-3.5">
        <div className="text-[19px] font-extrabold tracking-tight">Итог раздачи</div>
        <div className="text-ink-2 mt-0.5 text-[12.5px]">Кто дошёл до вскрытия и с чем</div>
      </div>
      <section className="border-line-gold mx-[13px] mt-3 rounded-[18px] border bg-[linear-gradient(140deg,rgba(217,179,106,.14),var(--surface,#141311))] p-[15px] text-center">
        <div className="text-gold text-[10.5px] font-extrabold tracking-[0.1em] uppercase">
          Ваш результат
        </div>
        <div
          data-testid="hero-profit"
          className={cn(
            "mt-1 font-extrabold tracking-tight",
            !resolved ? "text-gold text-[16px] leading-snug" : "num text-[30px]",
            resolved && (profit >= 0 ? "text-live" : "text-danger"),
          )}
        >
          {resolved ? (
            formatChipProfit(profit)
          ) : (
            <button
              type="button"
              data-testid="pick-winner-hint"
              className="underline-offset-2 hover:underline"
              onClick={() =>
                document
                  .querySelector("[data-testid='showdown-section']")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Укажите, кто забрал банк
            </button>
          )}
        </div>
        {resolved ? <div className="text-ink-2 mt-0.5 text-[12px] font-bold">фишек</div> : null}
        <div className="text-ink-2 num mt-1 text-[12px]">
          Банк {formatChips(data.result.pot)} · вложено {formatChips(data.result.hero_invested)}
        </div>
      </section>
      <section
        data-testid="showdown-section"
        className="border-line bg-surface mx-[13px] mt-3 scroll-mt-[var(--sticky-h,5rem)] rounded-[18px] border p-[13px]"
      >
        <div className="text-gold mb-2 text-[10.5px] font-extrabold tracking-[0.09em] uppercase">
          Вскрытые руки
        </div>
        {board.length > 0 ? (
          <div
            data-testid="result-board"
            className="mb-3 flex flex-wrap items-center justify-center gap-1"
          >
            {board.map((card, index) => (
              <button
                key={`${card}-${index}`}
                type="button"
                data-testid={`result-board-card-${index}`}
                aria-label={card}
                title={boardReplaceHint(index)}
                className="rounded-[8px]"
                onClick={() => dispatch({ type: "openBoardSlot", index })}
              >
                <PlayingCard card={card} size="md" />
              </button>
            ))}
          </div>
        ) : null}
        {orderedShowdown.map((seat) => {
          const cards = seat.is_hero ? state.heroCards : (state.showdownCards[seat.seat] ?? []);
          const mucked = !seat.is_hero && isSeatMucked(state, seat.seat);
          const cat = describeMadeHand(cards, board);
          const won = winnerSet.has(seat.seat);
          const last = lastBySeat.get(seat.seat);
          const canMuck = !seat.is_hero && cards.length !== 2 && !mucked;
          return (
            <div
              key={seat.seat}
              data-testid={`showdown-row-${seat.seat}`}
              className={cn(
                "mb-2 flex items-center gap-2 rounded-md border px-[11px] py-2.5",
                won ? "border-live bg-live-soft" : "border-line-strong bg-surface-2",
              )}
            >
              <ShowdownHoles
                cards={cards}
                name={seat.name}
                selected={pickingSeat === seat.seat}
                interactive={!seat.is_hero}
                onClick={
                  seat.is_hero
                    ? undefined
                    : () =>
                        dispatch({
                          type: "pickingShowdown",
                          seat: pickingSeat === seat.seat ? null : seat.seat,
                        })
                }
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold">
                  {seat.name}
                  {cat ? <span className="text-ink-3 font-semibold"> · {cat}</span> : null}
                </div>
                {mucked ? (
                  <div className="text-ink-3 mt-0.5 text-[11px] font-semibold">
                    карты неизвестны
                  </div>
                ) : null}
                {canMuck ? (
                  <button
                    type="button"
                    data-testid={`muck-seat-${seat.seat}`}
                    className="text-gold mt-0.5 text-[11.5px] font-extrabold"
                    onClick={() => dispatch({ type: "muckSeat", seat: seat.seat })}
                  >
                    Не показал
                  </button>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {last ? (
                  <ActionBadge action={last.action}>
                    {formatActionPhrase(last, formatChips)}
                  </ActionBadge>
                ) : null}
                {won && split ? (
                  <span className="text-live text-[11.5px] font-extrabold">делят банк</span>
                ) : won ? (
                  <span className="text-live text-[11.5px] font-extrabold">выиграл</span>
                ) : null}
              </div>
            </div>
          );
        })}
        <FoldedEarlierList players={earlier} />
        {manualWinner ? (
          <div data-testid="winner-picker" className="mt-1">
            <div className="text-gold mb-2 text-center text-[12px] font-bold">Кто забрал банк?</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {orderedShowdown.map((seat) => {
                const selected = winnerSet.has(seat.seat);
                return (
                  <button
                    key={seat.seat}
                    type="button"
                    data-testid={`take-pot-${seat.seat}`}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-[12.5px] font-extrabold",
                      selected
                        ? "border-live bg-live-soft text-live"
                        : "border-line-strong text-gold",
                    )}
                    onClick={() => dispatch({ type: "takePot", seat: seat.seat })}
                  >
                    {seat.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {pickingSeat !== null ? (
          <div
            ref={deckRef}
            data-testid="showdown-deck"
            className="border-line-gold mt-2 rounded-md border p-2.5"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[13px] font-extrabold">{cardsHeading(pickingName)}</span>
              <button
                type="button"
                className="text-gold text-[12.5px] font-extrabold"
                onClick={() => dispatch({ type: "pickingShowdown", seat: null })}
              >
                Готово
              </button>
            </div>
            <CardDeck
              selected={state.showdownCards[pickingSeat] ?? []}
              used={used}
              onToggle={(card) => dispatch({ type: "toggleShowdownCard", card })}
            />
          </div>
        ) : null}
      </section>
      <section className="border-line bg-surface mx-[13px] mt-3 rounded-[18px] border p-[13px]">
        <div className="text-gold mb-2 text-[10.5px] font-extrabold tracking-[0.09em] uppercase">
          Заметка к раздаче
        </div>
        <textarea
          className="border-line-strong bg-surface-2 h-[74px] w-full min-w-0 resize-none rounded-md border px-3 py-2.5 text-[14px]"
          placeholder="Правильно ли сыграл ривер?"
          value={state.note}
          onChange={(event) => dispatch({ type: "setNote", note: event.target.value })}
        />
      </section>
      <section className="border-line bg-surface mx-[13px] mt-3 rounded-[18px] border p-[13px]">
        <label className="border-line-strong bg-surface-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <span>
            <span className="block text-[13.5px] font-bold">Доступно по ссылке</span>
            <span className="text-ink-3 mt-px block text-[11.5px]">
              Кто угодно сможет открыть реплей
            </span>
          </span>
          <span className="relative h-[27px] w-[46px] shrink-0">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={state.isPublic}
              onChange={(event) => dispatch({ type: "setPublic", value: event.target.checked })}
            />
            <span className="bg-surface-3 peer-checked:bg-gold-grad absolute inset-0 cursor-pointer rounded-full" />
            <span className="bg-knob pointer-events-none absolute top-[3px] left-[3px] h-[21px] w-[21px] rounded-full transition-transform peer-checked:translate-x-[19px]" />
          </span>
        </label>
      </section>
    </>
  );
}

function cardsHeading(name: string | undefined): string {
  if (!name) return "Карты";
  const match = /^Игрок (\d+)$/.exec(name);
  if (match) return `Карты Игрока ${match[1]}`;
  return `Карты ${name}`;
}

function ShowdownHoles({
  cards,
  name,
  selected,
  interactive,
  onClick,
}: {
  cards: string[];
  name: string;
  selected: boolean;
  interactive: boolean;
  onClick?: () => void;
}) {
  const complete = cards.length === 2;
  const faces = (
    <>
      {cards[0] ? <PlayingCard card={cards[0]} size="sm" /> : <PlayingCard faceDown size="sm" />}
      {cards[1] ? <PlayingCard card={cards[1]} size="sm" /> : <PlayingCard faceDown size="sm" />}
    </>
  );
  if (!interactive) {
    return <div className="flex gap-0.5">{faces}</div>;
  }
  return (
    <button
      type="button"
      data-testid="showdown-holes"
      aria-label={complete ? `Изменить карты: ${name}` : `Ввести карты: ${name}`}
      aria-pressed={selected}
      className={cn(
        "group relative flex gap-0.5 rounded-[8px] border border-dashed p-0.5 transition",
        selected
          ? "border-gold ring-gold ring-1"
          : "hover:border-gold hover:ring-gold border-[rgba(217,179,106,0.4)] hover:ring-1",
      )}
      onClick={onClick}
    >
      {faces}
      <span
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center",
          complete && !selected && "opacity-0 group-hover:opacity-100 group-active:opacity-100",
        )}
      >
        <span className="text-gold flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(20,19,17,0.78)]">
          {complete ? <EyeIcon /> : <PlusIcon />}
        </span>
      </span>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden
      className="h-3 w-3 fill-none stroke-current [stroke-width:2.2] [stroke-linecap:round]"
      viewBox="0 0 24 24"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden
      className="h-3 w-3 fill-none stroke-current [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]"
      viewBox="0 0 24 24"
    >
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
