import { useReducer } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ResultPanel } from "@/features/hands/components/table-input/ResultPanel";
import {
  emptyTableInput,
  tableReducer,
  type TableInputState,
} from "@/features/hands/lib/tableInputState";
import { renderWithProviders } from "@/test/render";

function checks(seats: number[]) {
  return seats.map((seat) => ({ seat, action: "check" as const }));
}

function riverShowdown(overrides: Partial<TableInputState> = {}): TableInputState {
  return {
    ...emptyTableInput(),
    phase: "winner",
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
    ...overrides,
  };
}

function renderResult(initial: TableInputState, onSave = vi.fn()) {
  function Harness() {
    const [state, dispatch] = useReducer(tableReducer, initial);
    if (state.phase !== "winner" && state.phase !== "result" && state.phase !== "showdown") {
      return null;
    }
    return (
      <ResultPanel state={state} dispatch={dispatch} onSave={onSave} saving={false} error={null} />
    );
  }
  return renderWithProviders(<Harness />);
}

describe("ResultPanel", () => {
  it("hints to tap hole card backs and asks for hero cards", () => {
    renderResult(riverShowdown({ heroCards: [] }));
    expect(screen.getByText("Карты игрока — тап по его рубашкам на столе")).toBeInTheDocument();
    expect(screen.getByTestId("stack-display-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("table-enter-hero-cards")).toHaveTextContent("Введите свои карты");
    expect(screen.queryByTestId("table-save-hand")).not.toBeInTheDocument();
  });

  it("allows save without hero cards and warns about equity", async () => {
    const user = userEvent.setup();
    renderResult(riverShowdown({ heroCards: [] }));
    await user.click(screen.getByRole("button", { name: "Вы" }));
    expect(screen.getByTestId("table-save-hand")).toBeEnabled();
    expect(screen.getByTestId("table-save-hint")).toHaveTextContent(
      "эквити не считается, победителя нужно указать вручную",
    );
  });

  it("explains why save is blocked when winners are missing", () => {
    renderResult(
      riverShowdown({
        phase: "result",
        heroCards: ["As", "Ah"],
        winnerSeats: [],
      }),
    );
    const save = screen.getByTestId("table-save-hand");
    expect(save).toBeDisabled();
    expect(screen.getByTestId("table-save-hint")).toHaveTextContent("Укажите, кто забрал банк");
  });

  it("enables save after picking a winner", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderResult(riverShowdown(), onSave);
    await user.click(screen.getByRole("button", { name: "Вы" }));
    const save = screen.getByTestId("table-save-hand");
    expect(save).toBeEnabled();
    expect(screen.queryByTestId("table-save-hint")).not.toBeInTheDocument();
    await user.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("mucks an opponent from the showdown list", async () => {
    const user = userEvent.setup();
    renderResult(riverShowdown());
    await user.click(screen.getByTestId("table-muck-seat-2"));
    expect(screen.getByTestId("table-showdown-row-2")).toHaveTextContent("не показал");
    expect(screen.queryByTestId("table-muck-seat-2")).not.toBeInTheDocument();
  });

  it("describes the hero made hand after picking a winner", async () => {
    const user = userEvent.setup();
    renderResult(riverShowdown());
    await user.click(screen.getByRole("button", { name: "Вы" }));
    expect(screen.getByTestId("table-made-hand-1")).toHaveTextContent("сет");
  });
});
