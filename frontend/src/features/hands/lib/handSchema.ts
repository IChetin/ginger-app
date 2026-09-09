import { z } from "zod";

import type { HandData, StreetName } from "@/api/types/hands";
import { blindSeats } from "@/features/hands/lib/positions";

const CARD = z.string().regex(/^[2-9TJQKA][shdc]$/, "Некорректная карта");

const tableSizeSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
]);

const actionSchema = z.object({
  seat: z.number().int().min(1).max(9),
  action: z.enum(["fold", "check", "call", "bet", "raise", "allin"]),
  amount: z.number().int().positive().nullable().optional(),
});

export const handDataSchema: z.ZodType<HandData> = z
  .object({
    schema_version: z.literal(1),
    table_size: tableSizeSchema,
    blinds: z.object({
      sb: z.number().int().positive(),
      bb: z.number().int().positive(),
      ante: z.number().int().min(0),
      ante_mode: z.enum(["bb", "occupied"]).optional(),
    }),
    hero_seat: z.number().int().min(1).max(9),
    button_seat: z.number().int().min(1).max(9),
    seats: z
      .array(
        z.object({
          seat: z.number().int().min(1).max(9),
          position: z.enum(["BTN", "SB", "BB", "UTG", "+1", "+2", "MP", "HJ", "CO"]),
          name: z.string().min(1).max(16),
          stack: z.number().int().positive(),
          is_hero: z.boolean().optional(),
          cards: z.array(CARD).optional(),
        }),
      )
      .min(2),
    streets: z.array(
      z.object({
        street: z.enum(["preflop", "flop", "turn", "river"]),
        board: z.array(CARD),
        actions: z.array(actionSchema),
      }),
    ),
    result: z.object({
      winner_seats: z.array(z.number().int()).min(1),
      pot: z.number().int().min(0),
      hero_invested: z.number().int().min(0),
      hero_profit: z.number().int(),
      side_pots: z.null(),
    }),
  })
  .superRefine((data, ctx) => {
    if (!data.seats.some((seat) => seat.position === "BB")) {
      ctx.addIssue({
        code: "custom",
        message: "Без большого блайнда раздачи не бывает",
        path: ["seats"],
      });
    }
    if (!data.seats.some((seat) => seat.seat === data.hero_seat)) {
      ctx.addIssue({
        code: "custom",
        message: "Герой должен быть среди участников",
        path: ["hero_seat"],
      });
    }
  });

export const step1Schema = z
  .object({
    occupied: z.array(z.number().int()).min(2, "Нужны хотя бы два игрока"),
    heroSeat: z.number().int(),
    tableSize: tableSizeSchema,
    buttonSeat: z.number().int(),
    blinds: z.object({
      sb: z.number().int().positive("Укажите SB"),
      bb: z.number().int().positive("Укажите BB"),
      ante: z.number().int().min(0),
      ante_mode: z.enum(["bb", "occupied"]).optional(),
    }),
  })
  .superRefine((data, ctx) => {
    if (!data.occupied.includes(data.heroSeat)) {
      ctx.addIssue({
        code: "custom",
        message: "Это ваше место",
        path: ["heroSeat"],
      });
    }
    const { bb } = blindSeats(data.tableSize, data.buttonSeat, data.occupied);
    if (!data.occupied.includes(bb)) {
      ctx.addIssue({
        code: "custom",
        message: "Без большого блайнда раздачи не бывает",
        path: ["occupied"],
      });
    }
  });

export const step2Schema = z.object({
  heroCards: z.array(CARD).length(2, "Выберите две карты"),
});

export const STREET_ORDER: StreetName[] = ["preflop", "flop", "turn", "river"];

export const STREET_TITLE: Record<StreetName, string> = {
  preflop: "Префлоп",
  flop: "Флоп",
  turn: "Тёрн",
  river: "Ривер",
};

export function nextStreet(current: StreetName): StreetName | null {
  const index = STREET_ORDER.indexOf(current);
  return STREET_ORDER[index + 1] ?? null;
}

export function boardSizeFor(street: StreetName): number {
  if (street === "flop") return 3;
  if (street === "turn") return 4;
  if (street === "river") return 5;
  return 0;
}

export type BoardStreetSlot = {
  street: Exclude<StreetName, "preflop">;
  start: number;
  count: number;
};

export const BOARD_STREET_SLOTS: BoardStreetSlot[] = [
  { street: "flop", start: 0, count: 3 },
  { street: "turn", start: 3, count: 1 },
  { street: "river", start: 4, count: 1 },
];

export function boardSlot(street: StreetName): BoardStreetSlot | null {
  return BOARD_STREET_SLOTS.find((item) => item.street === street) ?? null;
}

export function boardStreetForIndex(index: number): BoardStreetSlot | null {
  return (
    BOARD_STREET_SLOTS.find((item) => index >= item.start && index < item.start + item.count) ??
    null
  );
}

export function previousBoardSlots(street: StreetName): BoardStreetSlot[] {
  const order = STREET_ORDER.indexOf(street);
  return BOARD_STREET_SLOTS.filter((item) => STREET_ORDER.indexOf(item.street) < order);
}

export function boardPickerPrompt(street: StreetName): string {
  return street === "flop" ? "выберите три карты" : "выберите карту";
}

export function boardReplaceHint(index: number): string {
  if (index === 0) return "Меняете 1-ю карту флопа";
  if (index === 1) return "Меняете 2-ю карту флопа";
  if (index === 2) return "Меняете 3-ю карту флопа";
  if (index === 3) return "Меняете карту тёрна";
  return "Меняете карту ривера";
}
