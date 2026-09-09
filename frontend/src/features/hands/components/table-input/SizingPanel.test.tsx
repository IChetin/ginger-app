import { useReducer } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { SizingPanel } from "@/features/hands/components/table-input/SizingPanel";
import { STACK_DISPLAY_STORAGE_KEY } from "@/features/hands/lib/stackDisplay";
import {
  emptyTableInput,
  tableReducer,
  type TableInputState,
} from "@/features/hands/lib/tableInputState";
import { TableStackDisplayProvider } from "@/features/hands/lib/useTableStackDisplay";
import { renderWithProviders } from "@/test/render";

function sizingState(): TableInputState {
  let state = emptyTableInput();
  state = tableReducer(state, { type: "startHand" });
  state = tableReducer(state, { type: "openSizing", kind: "raise" });
  return state;
}

function renderSizing(initial: TableInputState = sizingState()) {
  function Harness() {
    const [state, dispatch] = useReducer(tableReducer, initial);
    return (
      <TableStackDisplayProvider>
        <SizingPanel state={state} dispatch={dispatch} />
      </TableStackDisplayProvider>
    );
  }
  return renderWithProviders(<Harness />);
}

describe("SizingPanel", () => {
  beforeEach(() => {
    localStorage.removeItem(STACK_DISPLAY_STORAGE_KEY);
  });

  it("blocks a raise of 2 when BB is 200 and shows the minimum", async () => {
    const user = userEvent.setup();
    const started = sizingState();
    const invalid = tableReducer(started, { type: "setSizing", to: 2, preset: null });
    renderSizing(invalid);
    expect(screen.getByTestId("table-confirm-sizing")).toBeDisabled();
    expect(screen.getByTestId("number-stepper-error")).toHaveTextContent("Минимум 400");
    expect(screen.getByTestId("amount-chips-suffix")).toHaveTextContent("фишки");
    expect(screen.getByLabelText("Фишки")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByLabelText("BB"));
    expect(screen.getByLabelText("BB")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("amount-bb-suffix")).toHaveTextContent("BB");
  });

  it("starts empty with the minimum in the placeholder until a preset is tapped", async () => {
    const user = userEvent.setup();
    renderSizing();
    const input = screen.getByLabelText("Сумма ставки") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("мин. 400");
    expect(screen.getByRole("button", { name: /2×/ })).toHaveTextContent("400");
    expect(screen.getByTestId("table-confirm-sizing")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /2×/ }));
    expect(input.value).toBe("400");
    expect(screen.getByTestId("table-confirm-sizing")).toBeEnabled();
  });

  it("keeps preset chips at 40px and confirm at 46px", () => {
    renderSizing();
    const panel = screen.getByTestId("table-sizing-panel");
    expect(panel.className).toMatch(/py-2/);
    expect(screen.getByRole("button", { name: /2×/ }).className).toMatch(/h-10/);
    expect(screen.getByRole("button", { name: "Отмена" }).className).toMatch(/h-\[46px\]/);
    expect(screen.getByTestId("table-confirm-sizing").className).toMatch(/h-\[46px\]/);
  });
});
