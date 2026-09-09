import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterBar, FilterChips, FilterTrigger } from "@/components/filters/FilterBar";
import type { AppliedChip } from "@/components/filters/types";

function chips(count: number): AppliedChip[] {
  return Array.from({ length: count }, (_, index) => ({
    groupId: "countries",
    value: `c${index}`,
    label: `Chip ${index + 1}`,
  }));
}

describe("FilterBar", () => {
  it("collapses to 6 chips and expands on «ещё N»", async () => {
    const user = userEvent.setup();
    const onRemoveChip = vi.fn();
    render(
      <FilterBar
        activeCount={8}
        chips={chips(8)}
        onOpen={vi.fn()}
        onRemoveChip={onRemoveChip}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("Chip 1")).toBeInTheDocument();
    expect(screen.getByText("Chip 6")).toBeInTheDocument();
    expect(screen.queryByText("Chip 7")).not.toBeInTheDocument();
    expect(screen.getByTestId("filter-chips-more")).toHaveTextContent("ещё 2");

    await user.click(screen.getByTestId("filter-chips-more"));
    expect(screen.getByText("Chip 7")).toBeInTheDocument();
    expect(screen.getByText("Chip 8")).toBeInTheDocument();
    expect(screen.queryByTestId("filter-chips-more")).not.toBeInTheDocument();
  });

  it("does not show «ещё N» for 6 or fewer chips", () => {
    render(
      <FilterBar
        activeCount={6}
        chips={chips(6)}
        onOpen={vi.fn()}
        onRemoveChip={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("filter-chips-more")).not.toBeInTheDocument();
    expect(screen.getByText("Chip 6")).toBeInTheDocument();
  });
});

describe("FilterChips", () => {
  it("renders nothing when no chips are applied", () => {
    const { container } = render(
      <FilterChips chips={[]} onRemoveChip={vi.fn()} onClear={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("filter-chips")).not.toBeInTheDocument();
  });

  it("shows chips and reset when filters are applied", () => {
    render(<FilterChips chips={chips(2)} onRemoveChip={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByTestId("filter-chips")).toBeInTheDocument();
    expect(screen.getByText("Chip 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сбросить" })).toBeInTheDocument();
  });
});

describe("FilterTrigger", () => {
  it("compact trigger has no visible «Фильтры» label", () => {
    render(<FilterTrigger compact activeCount={2} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Фильтры/ })).toBeInTheDocument();
    expect(screen.queryByText("Фильтры")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
