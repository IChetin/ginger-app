import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SeatNameField, SEAT_NAME_CHIP_ROW_CLASS } from "@/features/hands/components/SeatNameField";

describe("SeatNameField", () => {
  it("does not let the hero be renamed", () => {
    render(<SeatNameField seat={1} heroSeat={1} name="Вы" onCommit={vi.fn()} />);
    expect(screen.getByTestId("seat-name-1")).toHaveTextContent("Вы");
    expect(screen.queryByTestId("seat-name-input")).not.toBeInTheDocument();
  });

  it("commits a custom name and reverts empty to Игрок N", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { rerender } = render(
      <SeatNameField seat={3} heroSeat={1} name="Игрок 3" onCommit={onCommit} />,
    );
    await user.clear(screen.getByTestId("seat-name-input"));
    await user.type(screen.getByTestId("seat-name-input"), "Дед в кепке");
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledWith("Дед в кепке");

    rerender(<SeatNameField seat={3} heroSeat={1} name="Дед в кепке" onCommit={onCommit} />);
    await user.clear(screen.getByTestId("seat-name-input"));
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledWith("Игрок 3");
  });

  it("shows past names as chips and never as a dropdown", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <SeatNameField
        autoFocus
        seat={2}
        heroSeat={1}
        name="Игрок 2"
        onCommit={onCommit}
        suggestions={["Рег из Минска", "Ник"]}
        showPrivacyHint
      />,
    );
    expect(screen.getByTestId("seat-name-input")).toHaveFocus();
    expect(screen.getByTestId("name-privacy-hint")).toHaveTextContent(
      "Имена видны всем, у кого есть ссылка",
    );
    expect(screen.getByTestId("seat-name-chips")).toBeInTheDocument();
    expect(screen.queryByTestId("seat-name-suggestions")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Рег из Минска" }));
    expect(onCommit).toHaveBeenCalledWith("Рег из Минска");
  });

  it("filters chips by substring and keeps a two-row slot", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 20 }, (_, index) => `Имя ${index + 1}`);
    render(
      <SeatNameField seat={2} heroSeat={1} name="Игрок 2" onCommit={vi.fn()} suggestions={many} />,
    );
    const row = screen.getByTestId("seat-name-chips");
    expect(row.className).toBe(SEAT_NAME_CHIP_ROW_CLASS);
    expect(row.querySelectorAll("button")).toHaveLength(6);
    await user.clear(screen.getByTestId("seat-name-input"));
    await user.type(screen.getByTestId("seat-name-input"), "имя 1");
    const filtered = [...row.querySelectorAll("button")].map((node) => node.textContent);
    expect(filtered).toEqual(["Имя 1", "Имя 10", "Имя 11", "Имя 12", "Имя 13", "Имя 14"]);
  });

  it("does not render chips when history is empty", () => {
    render(<SeatNameField seat={2} heroSeat={1} name="Игрок 2" onCommit={vi.fn()} />);
    expect(screen.queryByTestId("seat-name-chips")).not.toBeInTheDocument();
  });

  it("asks to forget a name after a long press", async () => {
    vi.useFakeTimers();
    const onForget = vi.fn();
    render(
      <SeatNameField
        seat={2}
        heroSeat={1}
        name="Игрок 2"
        onCommit={vi.fn()}
        onForget={onForget}
        suggestions={["Ник"]}
      />,
    );
    const chip = screen.getByRole("button", { name: "Ник" });
    chip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(onForget).toHaveBeenCalledWith("Ник");
    vi.useRealTimers();
  });

  it("cancels the draft on Escape", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<SeatNameField seat={2} heroSeat={1} name="Игрок 2" onCommit={onCommit} />);
    await user.clear(screen.getByTestId("seat-name-input"));
    await user.type(screen.getByTestId("seat-name-input"), "Ник");
    await user.keyboard("{Escape}");
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("seat-name-input")).toHaveValue("Игрок 2");
  });
});
