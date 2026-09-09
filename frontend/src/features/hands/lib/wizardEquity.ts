import { EQUITY_VS_RANDOM } from "@/config/features";
import type { HandComposition, ReplayState } from "@/features/hands/lib/hand-engine";
import { livingSeats as livingSeatsOf } from "@/features/hands/lib/hand-engine";
import { currentStreet, livingSeats, type WizardState } from "@/features/hands/lib/wizardState";

export const WIZARD_EQUITY_RANDOM_CAPTION = "против случайных рук";
export const WIZARD_EQUITY_KNOWN_CAPTION = "против вскрытых рук";
export const WIZARD_EQUITY_HINT =
  "Расчёт против произвольных карт. Реальный диапазон оппонента обычно сильнее";

export interface WizardEquityInput {
  holes: string[][];
  board: string[];
  randomOpponents: number;
  vsKnown: boolean;
  heroCards: string[];
}

export interface EquityInputOptions {
  /** Override `EQUITY_VS_RANDOM`. Tests pass this; UI uses the env flag. */
  vsRandom?: boolean;
}

export function wizardEquityBoard(state: WizardState): string[] {
  if (state.editingBoard || state.pickingBoard) return [...state.boardDraft];
  return [...currentStreet(state).board];
}

function vsRandomEnabled(options?: EquityInputOptions): boolean {
  return options?.vsRandom ?? EQUITY_VS_RANDOM;
}

function equityFromHoles(
  heroSeat: number,
  heroCards: string[],
  living: number[],
  showdownCards: Record<number, string[] | undefined>,
  board: string[],
  options?: EquityInputOptions,
): WizardEquityInput | null {
  if (heroCards.length !== 2) return null;
  if (!living.includes(heroSeat)) return null;
  const opponents = living.filter((seat) => seat !== heroSeat);
  if (opponents.length === 0) return null;

  const known: string[][] = [];
  let unknown = 0;
  for (const seat of opponents) {
    const cards = showdownCards[seat];
    if (cards?.length === 2) known.push(cards);
    else unknown += 1;
  }

  const vsRandom = vsRandomEnabled(options);
  if (known.length === 0) {
    if (!vsRandom || unknown === 0) return null;
    return {
      holes: [heroCards],
      board,
      randomOpponents: unknown,
      vsKnown: false,
      heroCards,
    };
  }

  return {
    holes: [heroCards, ...known],
    board,
    randomOpponents: vsRandom ? unknown : 0,
    vsKnown: !vsRandom || unknown === 0,
    heroCards,
  };
}

export function compositionEquityInput(
  state: HandComposition,
  options?: EquityInputOptions,
): WizardEquityInput | null {
  const board = [...(state.streets.at(-1)?.board ?? [])];
  return equityFromHoles(
    state.heroSeat,
    state.heroCards,
    livingSeatsOf(state),
    state.showdownCards,
    board,
    options,
  );
}

export function wizardEquityInput(
  state: WizardState,
  options?: EquityInputOptions,
): WizardEquityInput | null {
  return equityFromHoles(
    state.heroSeat,
    state.heroCards,
    livingSeats(state),
    state.showdownCards,
    wizardEquityBoard(state),
    options,
  );
}

export function replayEquityInput(
  state: ReplayState,
  options?: EquityInputOptions,
): WizardEquityInput | null {
  const hero = state.seats.find((seat) => seat.isHero);
  if (!hero || hero.folded || hero.cards.length !== 2) return null;
  const living = state.seats.filter((seat) => !seat.folded).map((seat) => seat.seat);
  const shown: Record<number, string[]> = {};
  for (const seat of state.seats) {
    if (!seat.isHero && seat.cards.length === 2) shown[seat.seat] = [...seat.cards];
  }
  return equityFromHoles(hero.seat, [...hero.cards], living, shown, [...state.board], options);
}
