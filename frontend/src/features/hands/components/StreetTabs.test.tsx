import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StreetTabs } from "@/features/hands/components/StreetTabs";
import { emptyWizard, type WizardState } from "@/features/hands/lib/wizardState";

function playing(overrides: Partial<WizardState> = {}): WizardState {
  return {
    ...emptyWizard(),
    step: 3,
    furthestStep: 3,
    occupied: [1, 2, 3],
    heroCards: ["As", "Kd"],
    ...overrides,
  };
}

const CLOSED_PREFLOP = {
  street: "preflop" as const,
  board: [] as string[],
  actions: [
    { seat: 1, action: "call" as const, amount: 2000 },
    { seat: 2, action: "call" as const, amount: 2000 },
    { seat: 3, action: "check" as const },
  ],
};

const FLOP_STREET = {
  street: "flop" as const,
  board: ["Ks", "9h", "4d"],
  actions: [{ seat: 2, action: "check" as const }],
};

describe("StreetTabs", () => {
  it("renders four street tabs and marks the current one", () => {
    render(<StreetTabs state={playing()} dispatch={vi.fn()} />);
    expect(screen.getByTestId("street-tabs")).toBeInTheDocument();
    expect(screen.getByTestId("street-tab-preflop")).toHaveAttribute("data-state", "current");
    expect(screen.getByTestId("street-tab-flop")).toHaveAttribute("data-state", "locked");
    expect(screen.getByTestId("street-tab-turn")).toHaveAttribute("data-state", "locked");
    expect(screen.getByTestId("street-tab-river")).toHaveAttribute("data-state", "locked");
    expect(screen.getByTestId("street-tab-preflop")).toHaveTextContent("Префлоп");
    expect(screen.getByTestId("street-tab-flop")).toHaveTextContent("Флоп");
    expect(screen.getByTestId("street-tab-turn")).toHaveTextContent("Тёрн");
    expect(screen.getByTestId("street-tab-river")).toHaveTextContent("Ривер");
  });

  it("dispatches goToStreet when a reachable tab is tapped", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <StreetTabs
        state={playing({
          streets: [CLOSED_PREFLOP, FLOP_STREET],
          activeStreetIndex: 1,
        })}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByTestId("street-tab-flop")).toHaveAttribute("data-state", "current");
    expect(screen.getByTestId("street-tab-preflop")).toHaveAttribute("data-state", "done");
    await user.click(screen.getByTestId("street-tab-preflop"));
    expect(dispatch).toHaveBeenCalledWith({ type: "goToStreet", street: "preflop" });
  });

  it("dispatches goToStreet for the next street", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<StreetTabs state={playing({ streets: [CLOSED_PREFLOP] })} dispatch={dispatch} />);
    expect(screen.getByTestId("street-tab-flop")).toHaveAttribute("data-state", "next");
    await user.click(screen.getByTestId("street-tab-flop"));
    expect(dispatch).toHaveBeenCalledWith({ type: "goToStreet", street: "flop" });
  });

  it("shows a hint instead of dispatching when a locked tab is tapped", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<StreetTabs state={playing()} dispatch={dispatch} />);
    await user.click(screen.getByTestId("street-tab-flop"));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByTestId("street-tab-hint")).toHaveTextContent(
      "Сначала завершите ставки на этой улице",
    );
  });

  it("explains that the hand already ended", async () => {
    const user = userEvent.setup();
    render(
      <StreetTabs
        state={playing({
          streets: [
            {
              street: "preflop",
              board: [],
              actions: [
                { seat: 1, action: "fold" },
                { seat: 2, action: "fold" },
              ],
            },
          ],
        })}
        dispatch={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId("street-tab-turn"));
    expect(screen.getByTestId("street-tab-hint")).toHaveTextContent("Раздача закончилась раньше");
  });
});
