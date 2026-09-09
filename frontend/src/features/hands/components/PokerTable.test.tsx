import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { HandData } from "@/api/types/hands";
import { PokerTable } from "@/features/hands/components/PokerTable";
import { getStateAtStep } from "@/features/hands/lib/hand-engine";
import { assignPositions, type TableSize } from "@/features/hands/lib/positions";
import { SEAT_CENTER_TRANSFORM, tableSlots } from "@/features/hands/lib/tableLayout";

function handAt(tableSize: TableSize, occupied: number[], heroSeat = occupied[0] ?? 1): HandData {
  const seats = occupied.map((seat) => ({
    seat,
    position: assignPositions(tableSize, 1, occupied).get(seat) ?? "MP",
    name: seat === heroSeat ? "Вы" : `Игрок ${seat}`,
    stack: 100000,
    is_hero: seat === heroSeat,
    cards: seat === heroSeat ? (["As", "Kd"] as string[]) : [],
  }));
  return {
    schema_version: 1,
    table_size: tableSize,
    blinds: { sb: 500, bb: 1000, ante: 0 },
    hero_seat: heroSeat,
    button_seat: 1,
    seats,
    streets: [{ street: "preflop", board: [], actions: [] }],
    result: {
      winner_seats: [heroSeat],
      pot: 1500,
      hero_invested: 0,
      hero_profit: 0,
      side_pots: null,
    },
  };
}

describe("PokerTable layout", () => {
  it("keeps 9-max geometry with three occupied seats and ghost chairs", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    expect(screen.getByTestId("table-seat-1")).toBeTruthy();
    expect(screen.getByTestId("table-seat-2")).toBeTruthy();
    expect(screen.getByTestId("table-seat-3")).toBeTruthy();
    expect(screen.getAllByTestId(/table-seat-empty-/)).toHaveLength(6);
    const slots = tableSlots(9, 1);
    const hero = screen.getByTestId("table-seat-1");
    const heroSlot = slots.find((slot) => slot.seat === 1);
    expect(hero.style.left).toBe(`${heroSlot?.left}%`);
    expect(hero.style.top).toBe(`${heroSlot?.top}%`);
    expect(hero.style.transform).toBe(SEAT_CENTER_TRANSFORM);
    const bb = screen.getByTestId("table-seat-3");
    const bbSlot = slots.find((slot) => slot.seat === 3);
    expect(bb.style.left).toBe(`${bbSlot?.left}%`);
    expect(bb.style.top).toBe(`${bbSlot?.top}%`);
    const empty = screen.getByTestId("table-seat-empty-5");
    const emptySlot = slots.find((slot) => slot.seat === 5);
    expect(empty.style.left).toBe(`${emptySlot?.left}%`);
    expect(empty.style.top).toBe(`${emptySlot?.top}%`);
    expect(empty.style.transform).toBe(hero.style.transform);
    expect(hero.style.width).toBe(empty.style.width);
    expect(hero.style.height).toBe(empty.style.height);
    expect(hero.style.width).toBeTruthy();
    expect(hero.style.height).toBeTruthy();
  });

  it("wraps a 16-character name without growing the seat pin box", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const longName = "ABCDEFGHIJKLMNOP";
    const opponent = data.seats.find((seat) => seat.seat === 2);
    if (opponent) opponent.name = longName;
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    const name = screen.getByTestId("seat-name-2");
    expect(name).toHaveTextContent(longName);
    expect(name).toHaveAttribute("title", longName);
    expect(name.className).toMatch(/truncate/);
    expect(name.className).not.toMatch(/break-words/);
    expect(Number.parseInt(name.style.maxWidth, 10)).toBeGreaterThanOrEqual(80);
    expect(screen.getByTestId("table-seat-2").style.width).toBe(
      screen.getByTestId("table-seat-empty-5").style.width,
    );
    expect(screen.getByTestId("table-seat-2").style.height).toBe(
      screen.getByTestId("table-seat-empty-5").style.height,
    );
    const pinW = Number.parseInt(screen.getByTestId("table-seat-2").style.width, 10);
    const identity = within(screen.getByTestId("table-seat-2")).getByTestId("seat-identity");
    expect(Number.parseInt(identity.style.width, 10)).toBeGreaterThan(pinW);
  });

  it("places non-adjacent 9-max seats on spread anchors, not packed together", () => {
    const data = handAt(9, [1, 5, 9], 1);
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    const slots = tableSlots(9, 1);
    const mid = screen.getByTestId("table-seat-5");
    const midSlot = slots.find((slot) => slot.seat === 5);
    expect(mid.style.left).toBe(`${midSlot?.left}%`);
    expect(mid.style.top).toBe(`${midSlot?.top}%`);
    const packed = tableSlots(3, 1);
    expect(mid.style.left).not.toBe(`${packed[1]?.left}%`);
  });

  it("hides hole cards and the pot when seating", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const state = getStateAtStep(data, 0);
    render(
      <PokerTable
        data={data}
        state={state}
        hideHoles
        feltHint="Тап по пустому месту — посадить, по игроку — настроить"
        requiredSeats={[1, 3]}
      />,
    );
    expect(screen.queryByTestId("seat-holes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("seat-holes-slot")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("table-seat-1")).getByTestId("seat-avatar"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("table-felt-hint")).toHaveTextContent(
      "Тап по пустому месту — посадить, по игроку — настроить",
    );
    expect(screen.queryByText("Банк")).not.toBeInTheDocument();
  });

  it("toggles stacks from a tap without opening the seat", async () => {
    const user = userEvent.setup();
    const data = handAt(9, [1, 2, 3], 1);
    const state = getStateAtStep(data, 0);
    const onToggleDisplay = vi.fn();
    const onSeatTap = vi.fn();
    render(
      <PokerTable
        data={data}
        state={state}
        hideHoles
        onToggleDisplay={onToggleDisplay}
        onSeatTap={onSeatTap}
      />,
    );
    await user.click(within(screen.getByTestId("table-seat-2")).getByTestId("seat-stack"));
    expect(onToggleDisplay).toHaveBeenCalledTimes(1);
    expect(onSeatTap).not.toHaveBeenCalled();
  });

  it("shows the preview bet amount, not a zero chip", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const state = getStateAtStep(data, 0);
    render(
      <PokerTable data={data} state={state} previewBet={{ seat: 1, amount: 400, stack: 99_600 }} />,
    );
    const chip = screen.getByTestId("table-bet-1");
    expect(chip).toHaveTextContent("400");
    expect(chip.textContent).not.toMatch(/^0$/);
    expect(screen.queryByTestId("table-bet-7")).not.toBeInTheDocument();
  });

  it("marks a short BB as all-in after the post", () => {
    const data = handAt(9, [1, 2, 3], 1);
    data.blinds = { sb: 100, bb: 200, ante: 0 };
    const bb = data.seats.find((seat) => seat.seat === 3);
    if (bb) bb.stack = 200;
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    const chip = screen.getByTestId("table-bet-3");
    expect(chip).toHaveAttribute("data-allin", "1");
    expect(chip).toHaveTextContent("ОЛЛ-ИН");
    expect(screen.queryByTestId("seat-allin-3")).not.toBeInTheDocument();
    expect(screen.getByTestId("seat-name-3")).toHaveTextContent("Игрок 3");
  });

  it("invites empty hero holes with plus slots and a pulse", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const hero = data.seats[0];
    if (hero) hero.cards = [];
    const state = getStateAtStep(data, 0);
    render(
      <PokerTable data={data} state={state} inviteHeroHoles onSeatCardsTap={() => undefined} />,
    );
    const holes = within(screen.getByTestId("table-seat-1")).getByTestId("seat-holes");
    expect(holes).toHaveAttribute("data-invite", "1");
    expect(holes.className).toMatch(/animate-seatpulse/);
    expect(holes).toHaveTextContent("+");
  });

  it("renders hole cards inside the seat block, not as a table overlay", () => {
    const data = handAt(9, [1, 2, 3, 4, 5, 6, 7, 8, 9], 1);
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    const felt = screen.getByTestId("poker-felt");
    const holes = screen.getAllByTestId("seat-holes");
    expect(holes.length).toBeGreaterThan(0);
    for (const row of holes) {
      expect(felt.contains(row)).toBe(true);
      expect(row.closest("[data-testid^=table-seat-]")?.getAttribute("data-testid")).toMatch(
        /^table-seat-\d+$/,
      );
    }
    const heroHoles = within(screen.getByTestId("table-seat-1")).getByTestId("seat-holes");
    expect(heroHoles).toBeTruthy();
  });

  it("taps hole cards without selecting the seat", async () => {
    const user = userEvent.setup();
    const data = handAt(9, [1, 2, 3], 1);
    const state = getStateAtStep(data, 0);
    const onSeatTap = vi.fn();
    const onSeatCardsTap = vi.fn();
    render(
      <PokerTable
        data={data}
        state={state}
        onSeatTap={onSeatTap}
        onSeatCardsTap={onSeatCardsTap}
      />,
    );
    await user.click(within(screen.getByTestId("table-seat-2")).getByTestId("seat-holes"));
    expect(onSeatCardsTap).toHaveBeenCalledWith(2);
    expect(onSeatTap).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ввести карты: Игрок 2" })).toBeInTheDocument();
  });

  it("taps a board card without selecting a seat", async () => {
    const user = userEvent.setup();
    const data = handAt(9, [1, 2, 3], 1);
    const state = { ...getStateAtStep(data, 0), board: ["Ad", "2c", "3d"] };
    const onSeatTap = vi.fn();
    const onBoardTap = vi.fn();
    render(<PokerTable data={data} state={state} onSeatTap={onSeatTap} onBoardTap={onBoardTap} />);
    await user.click(screen.getByRole("button", { name: "Изменить карту борда: Ad" }));
    expect(onBoardTap).toHaveBeenCalledWith(0);
    expect(onSeatTap).not.toHaveBeenCalled();
  });

  it("keeps empty seats smaller and muted", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    const empty = within(screen.getByTestId("table-seat-empty-5")).getByTestId("empty-seat-avatar");
    expect(empty.className).toMatch(/opacity-\[0\.35\]/);
    expect(Number.parseInt(empty.style.width, 10)).toBeLessThanOrEqual(24);
  });

  it("reads the name before the stack", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    const name = screen.getByTestId("seat-name-2");
    const stack = within(screen.getByTestId("table-seat-2")).getByTestId("seat-stack");
    expect(name.className).toMatch(/font-bold/);
    expect(Number.parseInt(name.style.fontSize, 10)).toBeGreaterThanOrEqual(10);
    expect(stack.className).toMatch(/font-semibold/);
    expect(Number.parseInt(name.style.fontSize, 10)).toBeGreaterThanOrEqual(
      Number.parseInt(stack.style.fontSize, 10),
    );
  });

  it("puts cards toward the pot on the inward chrome", () => {
    const data = handAt(9, [1, 2, 3, 4, 5, 6, 7, 8, 9], 1);
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    const hero = screen.getByTestId("table-seat-1");
    const top = screen.getByTestId("table-seat-6");
    expect(hero.querySelector("[data-cards-edge='inner']")).toBeTruthy();
    expect(top.querySelector("[data-cards-edge='outer']")).toBeTruthy();
    expect(within(hero).getByTestId("seat-holes-slot")).toBeInTheDocument();
    expect(within(hero).getByTestId("seat-avatar")).toBeInTheDocument();
    expect(within(hero).getByTestId("seat-identity")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("table-seat-2")).getByTestId("seat-holes-slot"),
    ).toBeInTheDocument();
  });

  it("keeps a reserved hole slot when the seat folds", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const folded = getStateAtStep(data, 0);
    folded.seats = folded.seats.map((seat) =>
      seat.seat === 2 ? { ...seat, folded: true, cards: [] } : seat,
    );
    render(<PokerTable data={data} state={folded} />);
    const opp = screen.getByTestId("table-seat-2");
    expect(within(opp).getByTestId("seat-holes-slot")).toBeInTheDocument();
    expect(within(opp).queryByTestId("seat-holes")).not.toBeInTheDocument();
  });

  it("stacks cards, avatar, name and stack in the same order on every seat", () => {
    const data = handAt(9, [1, 2, 3, 4, 5, 6, 7, 8, 9], 1);
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} seatChrome="column" />);
    const labels = screen.getAllByTestId("seat-position").map((node) => node.textContent);
    expect(labels).toEqual(["BTN", "SB", "BB", "UTG", "+1", "+2", "MP", "HJ", "CO"]);
    for (const seat of [1, 2, 6, 9] as const) {
      const root = screen.getByTestId(`table-seat-${seat}`);
      expect(root.querySelector("[data-cards-edge='column']")).toBeTruthy();
      expect(root.querySelector("[data-cards-edge='inner']")).toBeNull();
      expect(root.querySelector("[data-cards-edge='outer']")).toBeNull();
      const holes = within(root).getByTestId("seat-holes-slot");
      const avatar = within(root).getByTestId("seat-avatar");
      const identity = within(root).getByTestId("seat-identity");
      const stack = within(root).getByTestId("seat-stack");
      expect(within(avatar).getByTestId("seat-position")).toBeInTheDocument();
      expect(holes.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(
        avatar.compareDocumentPosition(identity) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        identity.compareDocumentPosition(stack) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(within(screen.getByTestId("table-seat-1")).getByTestId("seat-avatar")).toHaveTextContent(
      "BTN",
    );
    expect(within(screen.getByTestId("table-seat-1")).queryByText("Я")).not.toBeInTheDocument();
  });

  it("keeps the hole slot when a column seat folds", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const folded = getStateAtStep(data, 0);
    folded.seats = folded.seats.map((seat) =>
      seat.seat === 2 ? { ...seat, folded: true, cards: [] } : seat,
    );
    render(<PokerTable data={data} state={folded} seatChrome="column" />);
    const opp = screen.getByTestId("table-seat-2");
    expect(within(opp).getByTestId("seat-holes-slot")).toBeInTheDocument();
    expect(within(opp).queryByTestId("seat-holes")).not.toBeInTheDocument();
  });

  it("keeps the position badge in document flow", () => {
    const data = handAt(9, [1, 2, 3], 1);
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    for (const badge of screen.getAllByTestId("seat-position")) {
      expect(badge.className).not.toMatch(/\babsolute\b/);
    }
  });

  it("sizes the name for 12 glyphs, independent of the avatar box", () => {
    const data = handAt(9, [1, 2, 3, 4, 5, 6], 1);
    const names = { 2: "Имя4", 3: "ВосемьСим", 5: "Двенадцать12", 6: "Абвгдежзийклмноп" } as const;
    for (const [seat, name] of Object.entries(names)) {
      const row = data.seats.find((item) => item.seat === Number(seat));
      if (row) row.name = name;
    }
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} />);
    expect(screen.getByTestId("seat-name-2")).toHaveTextContent("Имя4");
    expect(screen.getByTestId("seat-name-3")).toHaveTextContent("ВосемьСим");
    expect(screen.getByTestId("seat-name-5")).toHaveTextContent("Двенадцать12");
    expect(screen.getByTestId("seat-name-6")).toHaveTextContent("Абвгдежзийклмноп");
    expect(screen.getByTestId("seat-name-6")).toHaveAttribute("title", "Абвгдежзийклмноп");
    const identity = within(screen.getByTestId("table-seat-5")).getByTestId("seat-identity");
    const avatar = within(screen.getByTestId("table-seat-5")).getByTestId("seat-avatar");
    expect(Number.parseInt(identity.style.width, 10)).toBeGreaterThanOrEqual(80);
    expect(Number.parseInt(identity.style.width, 10)).toBeGreaterThan(
      Number.parseInt(avatar.style.width, 10),
    );
  });

  it("shows nine-max names in full without a pencil and backs unlike board slots", () => {
    const data = handAt(9, [1, 2, 3, 4, 5, 6, 7, 8, 9], 1);
    const long = data.seats.find((seat) => seat.seat === 5);
    if (long) long.name = "Абвгдежзийклмноп";
    const state = getStateAtStep(data, 0);
    render(<PokerTable data={data} state={state} seatChrome="cards-inward" seatNamePos="beside" />);
    expect(screen.getByTestId("seat-name-2")).toHaveTextContent("Игрок 2");
    expect(screen.getByTestId("seat-name-9")).toHaveTextContent("Игрок 9");
    expect(screen.getByTestId("seat-name-5")).toHaveTextContent("Абвгдежзийклмноп");
    expect(screen.getByTestId("seat-name-5")).toHaveAttribute("title", "Абвгдежзийклмноп");
    const packed = within(screen.getByTestId("table-seat-5")).getByTestId("seat-identity");
    expect(Number.parseInt(packed.style.width, 10)).toBeGreaterThanOrEqual(72);
    expect(Number.parseInt(packed.style.width, 10)).toBeLessThanOrEqual(80);
    expect(Number.parseInt(screen.getByTestId("seat-name-2").style.fontSize, 10)).toBe(11);
    expect(screen.queryByText("✎")).not.toBeInTheDocument();
    const oppHoles = within(screen.getByTestId("table-seat-2")).getByTestId("seat-holes");
    expect(within(oppHoles).getAllByTestId("card-back")).toHaveLength(2);
    expect(within(oppHoles).queryByTestId("card-slot")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("card-slot").length).toBe(5);
  });

  it("renders nine column bets toward the pot without covering seats", () => {
    const data = handAt(9, [1, 2, 3, 4, 5, 6, 7, 8, 9], 1);
    const state = getStateAtStep(data, 0);
    const amounts = [200, 400, 16_000, 800, 1_200, 2_400, 40_000, 8_000, 400];
    state.seats = state.seats.map((seat, index) => ({
      ...seat,
      committed: amounts[index] ?? 200,
    }));
    state.lastAction = { seat: 7, action: "raise", amount: 40_000 };
    render(
      <div style={{ width: 390, height: 640 }}>
        <PokerTable data={data} state={state} seatChrome="column" className="h-full min-h-0" />
      </div>,
    );
    const felt = screen.getByTestId("poker-felt");
    const feltW = Number.parseFloat(felt.style.width);
    const feltH = Number.parseFloat(felt.style.height);
    const chips = data.seats.map((seat) => screen.getByTestId(`table-bet-${seat.seat}`));
    expect(chips).toHaveLength(9);
    const chipRects = chips.map((chip) => {
      const left = Number.parseFloat(chip.style.left);
      const top = Number.parseFloat(chip.style.top);
      return {
        x: (left / 100) * feltW,
        y: (top / 100) * feltH,
        left,
        top,
      };
    });
    for (const seat of data.seats) {
      const pin = screen.getByTestId(`table-seat-${seat.seat}`);
      const pinLeft = Number.parseFloat(pin.dataset.slotLeft ?? "0");
      const pinTop = Number.parseFloat(pin.dataset.slotTop ?? "0");
      const chip = screen.getByTestId(`table-bet-${seat.seat}`);
      const chipLeft = Number.parseFloat(chip.style.left);
      const chipTop = Number.parseFloat(chip.style.top);
      const pinW = Number.parseFloat(pin.style.width);
      const pinH = Number.parseFloat(pin.style.height);
      const dx = Math.abs(((chipLeft - pinLeft) / 100) * feltW);
      const dy = Math.abs(((chipTop - pinTop) / 100) * feltH);
      expect(dx > pinW / 2 || dy > pinH / 2).toBe(true);
    }
    expect(screen.getByTestId("seat-action-7")).toHaveTextContent("РЕЙЗ");
    for (let i = 0; i < chipRects.length; i += 1) {
      const a = chipRects[i];
      if (!a) continue;
      for (let j = i + 1; j < chipRects.length; j += 1) {
        const b = chipRects[j];
        if (!b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(18);
      }
    }
  });

  it("shows one all-in chip toward the pot and no extra seat badge", () => {
    const data = handAt(6, [1, 2, 3], 1);
    data.seats = data.seats.map((seat) => (seat.seat === 1 ? { ...seat, stack: 400 } : seat));
    data.streets = [
      {
        street: "preflop",
        board: [],
        actions: [{ seat: 1, action: "allin", amount: 400 }],
      },
    ];
    const timelineLength = data.streets[0]?.actions.length ?? 0;
    const state = getStateAtStep(data, timelineLength);
    render(<PokerTable data={data} state={state} seatChrome="column" />);
    const chips = screen.getAllByText("ОЛЛ-ИН");
    expect(chips).toHaveLength(1);
    expect(screen.getByTestId("table-bet-1")).toHaveAttribute("data-allin", "1");
    expect(screen.queryByTestId("seat-action-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("seat-allin-1")).not.toBeInTheDocument();
  });
});
