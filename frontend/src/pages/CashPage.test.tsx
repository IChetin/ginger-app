import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CashTable } from "@/api/types/cash";
import * as cashApi from "@/features/cash/api";
import { CashPage } from "@/pages/CashPage";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/cash/api", () => ({ fetchCashTables: vi.fn() }));

const club = {
  id: "c1",
  name: "Ginger",
  slug: "ginger",
  app: "pppoker" as const,
  chip_value: "1",
  chip_currency_code: "USDT",
  currency_symbol: "$",
  app_club_id: "1049607",
};

function table(overrides: Partial<CashTable>): CashTable {
  return {
    id: "t1",
    club,
    name: "Micro Rush",
    game_type: "nlh",
    small_blind: "0.1",
    big_blind: "0.2",
    ante: null,
    table_size: 6,
    seated: 5,
    waiting: 0,
    min_buyin: "10",
    max_buyin: "40",
    app_link: null,
    seen_at: new Date().toISOString(),
    big_blind_rub: "19",
    ...overrides,
  };
}

describe("CashPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("столы по играм, фильтр игры и карточка стола с диплинком", async () => {
    vi.mocked(cashApi.fetchCashTables).mockResolvedValue([
      table({}),
      table({ id: "t2", name: "Fox Den", seated: 6, waiting: 3, app_link: "pppoker://t/2" }),
      table({ id: "t3", name: "Omaha Lounge", game_type: "plo", big_blind_rub: "95" }),
    ]);

    renderWithProviders(<CashPage />, { route: "/cash" });

    expect(await screen.findByText("Fox Den")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CASH" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MTT" })).toHaveAttribute("href", "/tournaments");
    expect(screen.getByText("3 стола · только что")).toBeInTheDocument();
    expect(screen.getByText("NLH · 2")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "PLO" }));
    expect(screen.queryByText("Fox Den")).toBeNull();
    expect(screen.getAllByTestId("cash-row")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    fireEvent.click(screen.getByRole("row", { name: /Fox Den/ }));
    const sheet = await screen.findByTestId("cash-sheet");
    expect(within(sheet).getByText("Очередь 3")).toBeInTheDocument();
    expect(within(sheet).getByText("50 ББ – 200 ББ")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Открыть стол в PPPoker" })).toBeVisible();
  });

  it("без диплинка — ID клуба; пустой вечер — подсказка про время сбора", async () => {
    vi.mocked(cashApi.fetchCashTables).mockResolvedValueOnce([table({})]);
    const view = renderWithProviders(<CashPage />, { route: "/cash" });

    fireEvent.click(await screen.findByRole("row", { name: /Micro Rush/ }));
    expect(await screen.findByTestId("club-app-id")).toHaveTextContent("1049607");
    view.unmount();

    vi.mocked(cashApi.fetchCashTables).mockResolvedValueOnce([]);
    renderWithProviders(<CashPage />, { route: "/cash" });
    expect(await screen.findByText("Сейчас столов нет")).toBeInTheDocument();
  });
});
