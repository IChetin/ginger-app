import { useReducer } from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeckPanel } from "@/features/hands/components/table-input/DeckPanel";
import {
  emptyTableInput,
  tableReducer,
  type TableInputState,
} from "@/features/hands/lib/tableInputState";
import { renderWithProviders } from "@/test/render";

function renderDeck(initial: TableInputState) {
  function Harness() {
    const [state, dispatch] = useReducer(tableReducer, initial);
    if (state.phase !== "cards") return null;
    return <DeckPanel state={state} dispatch={dispatch} />;
  }
  return renderWithProviders(<Harness />);
}

describe("DeckPanel", () => {
  it("describes two selected hero cards", () => {
    renderDeck({
      ...emptyTableInput(),
      phase: "cards",
      heroCards: ["As", "Ks"],
      deck: { kind: "hero", selected: ["As", "Ks"] },
    });
    expect(screen.getByTestId("table-hole-description")).toHaveTextContent(/AKs/);
    expect(screen.getByTestId("stack-display-toggle")).toBeInTheDocument();
  });

  it("titles a board replacement", () => {
    renderDeck({
      ...emptyTableInput(),
      phase: "cards",
      streets: [
        { street: "preflop", board: [], actions: [] },
        { street: "flop", board: ["Ad", "2c", "3d"], actions: [] },
      ],
      deck: { kind: "board", selected: ["Ad", "2c", "3d"], replaceIndex: 0 },
    });
    expect(screen.getByRole("heading", { name: "Замена карты борда" })).toBeInTheDocument();
  });
});
