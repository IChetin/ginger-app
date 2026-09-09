import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WizardHeroEquity } from "@/features/hands/components/WizardHeroEquity";
import { WIZARD_EQUITY_KNOWN_CAPTION } from "@/features/hands/lib/wizardEquity";
import { emptyWizard, type WizardState } from "@/features/hands/lib/wizardState";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/hands/lib/useEquity", () => ({
  useEquity: (holes: string[][] | null) => ({
    result: holes && holes.length >= 1 ? { values: [0.852, 0.148], exact: false } : null,
    failed: false,
  }),
}));

function actionState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    ...emptyWizard(),
    step: 3,
    furthestStep: 3,
    occupied: [1, 2, 3],
    heroCards: ["As", "Ah"],
    ...overrides,
  };
}

describe("WizardHeroEquity", () => {
  it("hides the row when the hero has no cards", () => {
    renderWithProviders(<WizardHeroEquity state={actionState({ heroCards: [] })} />);
    expect(screen.queryByTestId("wizard-hero-equity")).not.toBeInTheDocument();
  });

  it("hides the row when only the hero hand is known", () => {
    renderWithProviders(<WizardHeroEquity state={actionState()} />);
    expect(screen.queryByTestId("wizard-hero-equity")).not.toBeInTheDocument();
  });

  it("labels known showdown hands without the random-range disclaimer", async () => {
    const user = userEvent.setup();
    const state = actionState({
      step: 4,
      furthestStep: 4,
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
        {
          street: "flop",
          board: ["Ad", "2c", "3d"],
          actions: [
            { seat: 2, action: "check" },
            { seat: 3, action: "check" },
            { seat: 1, action: "check" },
          ],
        },
        {
          street: "turn",
          board: ["Ad", "2c", "3d", "9s"],
          actions: [
            { seat: 2, action: "check" },
            { seat: 3, action: "check" },
            { seat: 1, action: "check" },
          ],
        },
        {
          street: "river",
          board: ["Ad", "2c", "3d", "9s", "4h"],
          actions: [
            { seat: 2, action: "check" },
            { seat: 3, action: "check" },
            { seat: 1, action: "check" },
          ],
        },
      ],
      activeStreetIndex: 3,
      showdownCards: { 2: ["Ks", "Kh"], 3: ["7c", "8d"] },
    });
    renderWithProviders(<WizardHeroEquity state={state} />);
    expect(screen.getByTestId("wizard-hero-equity")).toHaveAttribute("data-vs", "known");
    expect(screen.getByTestId("wizard-equity-caption")).toHaveTextContent(
      WIZARD_EQUITY_KNOWN_CAPTION,
    );
    await user.click(screen.getByTestId("wizard-hero-equity"));
    expect(screen.queryByTestId("wizard-equity-hint")).not.toBeInTheDocument();
  });
});
