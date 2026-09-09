import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MiniTable } from "@/features/hands/components/MiniTable";
import { allSeats, POSITIONS_BY_SIZE, type TableSize } from "@/features/hands/lib/positions";
import { TABLE_BORDER_RADIUS, TABLE_HEIGHT_RATIO } from "@/features/hands/lib/tableLayout";

describe("MiniTable", () => {
  it("caps width, centers, and uses the replayer oval ratio", () => {
    render(
      <MiniTable
        tableSize={9}
        occupied={[1, 2, 3]}
        heroSeat={1}
        buttonSeat={1}
        onToggle={() => undefined}
        onHero={() => undefined}
      />,
    );
    expect(screen.getByTestId("mini-table")).toBeInTheDocument();
    const felt = screen.getByTestId("mini-felt");
    expect(felt.className).toMatch(/max-w-\[240px\]/);
    expect(felt.className).toMatch(/mx-auto/);
    expect(felt.className).toMatch(/w-\[90%\]/);
    expect(felt.className).toMatch(/min-h-\[216px\]/);
    expect(felt.style.aspectRatio).toBe(`1 / ${TABLE_HEIGHT_RATIO}`);
    expect(felt.style.borderRadius).toBe(TABLE_BORDER_RADIUS);
  });

  it("keeps seat anchors inside the mini oval", () => {
    render(
      <MiniTable
        tableSize={9}
        occupied={[1, 2, 3]}
        heroSeat={1}
        buttonSeat={1}
        onToggle={() => undefined}
        onHero={() => undefined}
      />,
    );
    const seats = screen.getAllByRole("button");
    expect(seats).toHaveLength(9);
    for (const seat of seats) {
      expect(seat.getAttribute("data-inside-oval")).toBe("1");
    }
  });

  it.each([
    [3, POSITIONS_BY_SIZE[3]],
    [4, POSITIONS_BY_SIZE[4]],
    [5, POSITIONS_BY_SIZE[5]],
  ] as const)("labels %s-max seats from the button", (size, labels) => {
    render(
      <MiniTable
        tableSize={size as TableSize}
        occupied={allSeats(size)}
        heroSeat={1}
        buttonSeat={1}
        onToggle={() => undefined}
        onHero={() => undefined}
      />,
    );
    const seats = screen.getAllByRole("button");
    expect(seats).toHaveLength(size);
    expect(seats.map((seat) => seat.textContent)).toEqual([...labels]);
    for (const seat of seats) {
      expect(seat.getAttribute("data-inside-oval")).toBe("1");
      expect(seat.className).toMatch(/rounded-full/);
    }
  });

  it("puts BTN in the heads-up avatar, not BTN/SB", () => {
    render(
      <MiniTable
        tableSize={2}
        occupied={[1, 2]}
        heroSeat={1}
        buttonSeat={1}
        onToggle={() => undefined}
        onHero={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "BTN" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "BTN/SB" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BB" })).toBeInTheDocument();
  });
});
