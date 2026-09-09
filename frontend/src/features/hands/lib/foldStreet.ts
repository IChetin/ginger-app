import type { HandAction, StreetName } from "@/api/types/hands";
import { STREET_ORDER } from "@/features/hands/lib/handSchema";

export type FoldStreetStreet = {
  street: StreetName;
  actions: HandAction[];
};

export type FoldedPlayer = {
  seat: number;
  name: string;
  street: StreetName;
};

const STREET_PREPOSITION: Record<StreetName, string> = {
  preflop: "на префлопе",
  flop: "на флопе",
  turn: "на тёрне",
  river: "на ривере",
};

export function formatFoldOnStreet(street: StreetName): string {
  return `фолд ${STREET_PREPOSITION[street]}`;
}

export function foldStreetBySeat(streets: FoldStreetStreet[]): Map<number, StreetName> {
  const map = new Map<number, StreetName>();
  for (const street of streets) {
    for (const action of street.actions) {
      if (action.action === "fold" && !map.has(action.seat)) {
        map.set(action.seat, street.street);
      }
    }
  }
  return map;
}

export function foldedBeforeStreet(foldStreet: StreetName, current: StreetName): boolean {
  return STREET_ORDER.indexOf(foldStreet) < STREET_ORDER.indexOf(current);
}

export function isVisibleOnStreet(
  seat: number,
  current: StreetName,
  foldMap: Map<number, StreetName>,
): boolean {
  if (current === "preflop") return true;
  const foldStreet = foldMap.get(seat);
  if (!foldStreet) return true;
  return !foldedBeforeStreet(foldStreet, current);
}

export function foldedEarlierPlayers(
  seats: { seat: number; name: string }[],
  streets: FoldStreetStreet[],
  current: StreetName,
): FoldedPlayer[] {
  const names = new Map(seats.map((seat) => [seat.seat, seat.name]));
  const players: FoldedPlayer[] = [];
  for (const [seat, street] of foldStreetBySeat(streets)) {
    if (!foldedBeforeStreet(street, current)) continue;
    const name = names.get(seat);
    if (!name) continue;
    players.push({ seat, name, street });
  }
  return players;
}

export function foldedPlayers(
  seats: { seat: number; name: string }[],
  streets: FoldStreetStreet[],
): FoldedPlayer[] {
  const names = new Map(seats.map((seat) => [seat.seat, seat.name]));
  const players: FoldedPlayer[] = [];
  for (const [seat, street] of foldStreetBySeat(streets)) {
    const name = names.get(seat);
    if (!name) continue;
    players.push({ seat, name, street });
  }
  return players;
}
