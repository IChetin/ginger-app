import { useReducer } from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ResultStep } from "@/features/hands/components/ResultStep";
import { formatChipProfit } from "@/features/hands/components/PlayingCard";
import {
  buildHandData,
  emptyWizard,
  wizardReducer,
  type WizardState,
} from "@/features/hands/lib/wizardState";
import { renderWithProviders } from "@/test/render";

function checks(seats: number[]) {
  return seats.map((seat) => ({ seat, action: "check" as const }));
}

function riverShowdown(overrides: Partial<WizardState> = {}): WizardState {
  return {
    ...emptyWizard(),
    step: 4,
    furthestStep: 4,
    occupied: [1, 2, 3],
    heroCards: ["As", "Ah"],
    streets: [
      {
        street: "preflop",
        board: [],
        actions: [
          { seat: 1, action: "call", amount: 2000 },
          { seat: 2, action: "call", amount: 2000 },
          { seat: 3, action: "check" },
        ],
      },
      { street: "flop", board: ["Ad", "2c", "3d"], actions: checks([2, 3, 1]) },
      { street: "turn", board: ["Ad", "2c", "3d", "9s"], actions: checks([2, 3, 1]) },
      { street: "river", board: ["Ad", "2c", "3d", "9s", "4h"], actions: checks([2, 3, 1]) },
    ],
    activeStreetIndex: 3,
    ...overrides,
  };
}

function renderResult(initial: WizardState) {
  function Harness() {
    const [state, dispatch] = useReducer(wizardReducer, initial);
    return <ResultStep state={state} dispatch={dispatch} />;
  }
  return renderWithProviders(<Harness />);
}

describe("ResultStep showdown", () => {
  it("opens the deck from hole backs and keeps it hidden until a player is chosen", async () => {
    const user = userEvent.setup();
    renderResult(riverShowdown());
    expect(screen.queryByTestId("card-deck")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "карты" })).not.toBeInTheDocument();
    expect(screen.queryByText("выиграл")).not.toBeInTheDocument();
    expect(screen.getByTestId("pick-winner-hint")).toHaveTextContent("Укажите, кто забрал банк");
    expect(screen.queryByText("фишек")).not.toBeInTheDocument();
    expect(screen.getByTestId("result-board")).toBeInTheDocument();
    expect(screen.getAllByTestId(/result-board-card-/)).toHaveLength(5);
    expect(screen.queryByTestId("muck-showdown")).not.toBeInTheDocument();
    expect(screen.getByTestId("muck-seat-2")).toHaveTextContent("Не показал");
    expect(screen.getByTestId("muck-seat-3")).toHaveTextContent("Не показал");

    await user.click(screen.getByRole("button", { name: "Ввести карты: Игрок 2" }));
    expect(screen.getByTestId("showdown-deck")).toHaveTextContent("Карты Игрока 2");
    await user.click(screen.getByRole("button", { name: "Ks" }));
    await user.click(screen.getByRole("button", { name: "Kh" }));
    await user.click(screen.getByRole("button", { name: "Готово" }));
    expect(screen.queryByTestId("card-deck")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ввести карты: Игрок 3" }));
    await user.click(screen.getByRole("button", { name: "7c" }));
    await user.click(screen.getByRole("button", { name: "8d" }));
    await user.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.getByText("выиграл")).toBeInTheDocument();
    const winnerRow = screen.getByTestId("showdown-row-1");
    expect(winnerRow).toHaveTextContent("выиграл");
    expect(winnerRow).toHaveTextContent("сет");
    expect(screen.getByTestId("showdown-row-2")).toHaveTextContent("пара");
    expect(screen.getByTestId("showdown-row-3")).toHaveTextContent("старшая карта");
    expect(screen.queryByTestId("winner-picker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("muck-seat-2")).not.toBeInTheDocument();
    const rows = screen.getAllByTestId(/showdown-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "showdown-row-1");
    expect(screen.getByTestId("hero-profit").textContent).not.toMatch(/₽/);
    expect(screen.getByText("фишек")).toBeInTheDocument();
  });

  it("shows a chop when hands tie", () => {
    renderResult(
      riverShowdown({
        heroCards: ["3c", "4d"],
        showdownCards: { 2: ["5h", "6c"], 3: ["7c", "8d"] },
        streets: [
          {
            street: "preflop",
            board: [],
            actions: [
              { seat: 1, action: "call", amount: 2000 },
              { seat: 2, action: "call", amount: 2000 },
              { seat: 3, action: "check" },
            ],
          },
          { street: "flop", board: ["Ts", "Js", "Qs"], actions: checks([2, 3, 1]) },
          { street: "turn", board: ["Ts", "Js", "Qs", "Ks"], actions: checks([2, 3, 1]) },
          { street: "river", board: ["Ts", "Js", "Qs", "Ks", "9s"], actions: checks([2, 3, 1]) },
        ],
      }),
    );
    expect(screen.getAllByText("делят банк")).toHaveLength(3);
    expect(screen.queryByText("выиграл")).not.toBeInTheDocument();
  });

  it("lets you pick who took the pot when nobody showed", async () => {
    const user = userEvent.setup();
    renderResult(riverShowdown());
    await user.click(screen.getByTestId("muck-seat-2"));
    await user.click(screen.getByTestId("muck-seat-3"));
    expect(screen.getByTestId("showdown-row-2")).toHaveTextContent("карты неизвестны");
    expect(screen.getByTestId("showdown-row-3")).toHaveTextContent("карты неизвестны");
    expect(screen.getByText("Кто забрал банк?")).toBeInTheDocument();
    await user.click(screen.getByTestId("take-pot-1"));
    expect(screen.getByTestId("showdown-row-1")).toHaveTextContent("выиграл");
    const rows = screen.getAllByTestId(/showdown-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "showdown-row-1");
    const expected = buildHandData({
      ...riverShowdown(),
      showdownMucked: true,
      muckedSeats: [2, 3],
      winnerSeats: [1],
    }).result.hero_profit;
    expect(screen.getByTestId("hero-profit").textContent?.replace(/\s/g, "")).toBe(
      formatChipProfit(expected).replace(/\s/g, ""),
    );
    expect(screen.getByTestId("hero-profit").textContent).not.toMatch(/₽/);
    expect(expected).toBeGreaterThan(0);
  });

  it("asks for a manual winner when only one of two opponents showed", async () => {
    const user = userEvent.setup();
    renderResult(riverShowdown({ showdownCards: { 2: ["Ks", "Kh"] } }));
    expect(screen.getByTestId("showdown-row-2")).toHaveTextContent("пара");
    expect(screen.queryByTestId("winner-picker")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("muck-seat-3"));
    expect(screen.getByTestId("showdown-row-3")).toHaveTextContent("карты неизвестны");
    expect(screen.getByTestId("winner-picker")).toBeInTheDocument();
    expect(screen.queryByText("выиграл")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("take-pot-1"));
    expect(screen.getByTestId("showdown-row-1")).toHaveTextContent("выиграл");
    expect(screen.getByTestId("hero-profit").textContent).toMatch(/^\+/);
  });

  it("closes the deck on an outside tap", async () => {
    const user = userEvent.setup();
    renderResult(riverShowdown());
    await user.click(screen.getByRole("button", { name: "Ввести карты: Игрок 2" }));
    expect(screen.getByTestId("showdown-deck")).toBeInTheDocument();
    await user.click(screen.getByText("Заметка к раздаче"));
    expect(screen.queryByTestId("showdown-deck")).not.toBeInTheDocument();
  });

  it("reopens the deck from already entered cards", async () => {
    const user = userEvent.setup();
    renderResult(
      riverShowdown({
        showdownCards: { 2: ["Ks", "Kh"] },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Изменить карты: Игрок 2" }));
    expect(screen.getByTestId("showdown-deck")).toHaveTextContent("Карты Игрока 2");
    expect(
      within(screen.getByTestId("showdown-deck")).getByRole("button", { name: "Ks" }),
    ).toBeInTheDocument();
  });
});
