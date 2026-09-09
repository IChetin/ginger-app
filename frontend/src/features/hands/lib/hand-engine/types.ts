import type {
  HandAction,
  HandBlinds,
  HandStreet,
  StreetName,
} from "@/api/types/hands";
import type { TableSize } from "@/features/hands/lib/positions";

export type TimelineKind = "post" | "action" | "deal" | "showdown";

export interface TimelineItem {
  kind: TimelineKind;
  street: StreetName;
  actionIndex: number | null;
}

export interface GetStateAtStepOptions {
  /** По умолчанию true: карты оппонентов только на шаге вскрытия. */
  hideUntilShowdown?: boolean;
}

export interface SeatRuntime {
  seat: number;
  position: string;
  name: string;
  stack: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  isHero: boolean;
  cards: string[];
  startingStack: number;
  invested: number;
}

export interface ReplayState {
  step: number;
  totalSteps: number;
  street: StreetName;
  board: string[];
  pot: number;
  currentBet: number;
  lastRaise: number;
  /** Большой блайнд раздачи — минимум открывающего бета. */
  bb: number;
  seats: SeatRuntime[];
  actorSeat: number | null;
  lastAction: HandAction | null;
  log: string;
  isDeal: boolean;
  isShowdown: boolean;
  hasSidePotWarning: boolean;
  heroInvested: number;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  /** Сколько ещё доставить до текущей ставки (для кнопки «Колл»). */
  callAmount: number;
  /** Цель колла в JSON / движке (`amount` = ставка «до»). */
  callTarget: number;
  minBet: number;
  maxBet: number;
}

/**
 * Доменное состояние раздачи без UI оболочки (визард / стол).
 * Формат хранения черновика остаётся плоским: эти поля плюс UI-поля оболочки.
 */
export interface BlindsManual {
  sb: boolean;
  bb: boolean;
  ante: boolean;
}

export interface HandComposition {
  tableSize: TableSize;
  occupied: number[];
  heroSeat: number;
  buttonSeat: number;
  blinds: HandBlinds;
  /** Какие поля блайндов пользователь правил руками в этой раздаче. */
  blindsManual: BlindsManual;
  stacks: Record<number, string>;
  names: Record<number, string>;
  eventId: string | null;
  seriesId: string | null;
  liveSessionId: string | null;
  heroCards: string[];
  streets: HandStreet[];
  showdownCards: Record<number, string[]>;
  showdownMucked: boolean;
  muckedSeats: number[];
  note: string;
  isPublic: boolean;
  winnerSeats: number[];
}
