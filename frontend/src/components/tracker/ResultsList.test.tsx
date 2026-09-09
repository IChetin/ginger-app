import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ResultListItem } from "@/api/types/tracker";
import { ResultsList } from "@/components/tracker/ResultsList";
import { renderWithProviders } from "@/test/render";

const item: ResultListItem = {
  id: "r1",
  entry_type: "live_mtt",
  event_id: null,
  name: "Big Bounty",
  venue_text: "Минск",
  series_text: "BPT 40",
  played_on: "2026-07-26",
  buyin: "550",
  currency_code: "BYN",
  entries_count: 1,
  payout: "1000",
  place: 3,
  field_size: 100,
  note: null,
  events: [],
  created_at: "2026-07-26T00:00:00Z",
  updated_at: "2026-07-26T00:00:00Z",
  profit_base: "92300",
  base_currency: "RUB",
};

describe("ResultsList", () => {
  it("keeps record currency in meta and base currency in profit", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithProviders(
      <ResultsList
        items={[item]}
        hasNextPage={false}
        isFetchingNextPage={false}
        onLoadMore={vi.fn()}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByText(/550 Br × 1 вход/)).toBeInTheDocument();
    expect(screen.getByText("+92 300 ₽")).toBeInTheDocument();
    expect(screen.getByText("3 / 100")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Big Bounty/ }));
    expect(onEdit).toHaveBeenCalledWith(item);
  });

  it("falls back to «N место» when field size is unknown", () => {
    renderWithProviders(
      <ResultsList
        items={[{ ...item, field_size: null }]}
        hasNextPage={false}
        isFetchingNextPage={false}
        onLoadMore={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText("3 место")).toBeInTheDocument();
  });

  it("loads the next page when observer is unavailable", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    renderWithProviders(
      <ResultsList
        items={[item]}
        hasNextPage
        isFetchingNextPage={false}
        onLoadMore={onLoadMore}
        onEdit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Показать ещё" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
});
