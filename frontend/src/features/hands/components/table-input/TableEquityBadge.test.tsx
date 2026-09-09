import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TableEquityBadge } from "@/features/hands/components/table-input/TableEquityBadge";
import { WIZARD_EQUITY_KNOWN_CAPTION } from "@/features/hands/lib/wizardEquity";
import { emptyTableInput } from "@/features/hands/lib/tableInputState";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/hands/lib/useEquity", () => ({
  useEquity: (holes: string[][] | null) => ({
    result: holes && holes.length >= 1 ? { values: [0.852, 0.148], exact: false } : null,
    failed: false,
  }),
}));

describe("TableEquityBadge", () => {
  it("hides when the hero has no cards", () => {
    renderWithProviders(<TableEquityBadge composition={emptyTableInput()} />);
    expect(screen.queryByTestId("table-equity-badge")).not.toBeInTheDocument();
  });

  it("hides when only the hero hand is known", () => {
    renderWithProviders(
      <TableEquityBadge composition={{ ...emptyTableInput(), heroCards: ["As", "Ah"] }} />,
    );
    expect(screen.queryByTestId("table-equity-badge")).not.toBeInTheDocument();
  });

  it("shows a percent against known hands", () => {
    renderWithProviders(
      <TableEquityBadge
        composition={{
          ...emptyTableInput(),
          heroCards: ["As", "Ah"],
          showdownCards: { 2: ["Ks", "Kh"] },
        }}
      />,
    );
    const badge = screen.getByTestId("table-equity-badge");
    expect(badge).toHaveAttribute("data-vs", "known");
    expect(screen.getByTestId("table-equity-pct")).toHaveTextContent("85.2%");
    expect(badge).toHaveAttribute("aria-label", `85.2% ${WIZARD_EQUITY_KNOWN_CAPTION}`);
    expect(screen.getByTestId("table-equity-caption")).toHaveTextContent(
      WIZARD_EQUITY_KNOWN_CAPTION,
    );
  });
});
