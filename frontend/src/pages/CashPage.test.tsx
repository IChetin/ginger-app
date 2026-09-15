import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CashGame } from "@/api/types/cash";
import * as cashApi from "@/features/cash/api";
import { CashPage } from "@/pages/CashPage";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/cash/api", () => ({ fetchCashGames: vi.fn() }));

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

function game(overrides: Partial<CashGame>): CashGame {
  return {
    id: "g1",
    club,
    game_type: "nlh",
    small_blind: "0.1",
    big_blind: "0.2",
    tables: 3,
    app_link: null,
    seen_at: new Date().toISOString(),
    big_blind_rub: "19",
    is_editor_pick: false,
    editor_pick_note: null,
    ...overrides,
  };
}

describe("CashPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("лимиты по играм, фильтры и карточка с диплинком", async () => {
    vi.mocked(cashApi.fetchCashGames).mockResolvedValue([
      game({}),
      game({
        id: "g2",
        small_blind: "0.25",
        big_blind: "0.5",
        tables: 2,
        app_link: "pppoker://t/2",
        is_editor_pick: true,
        editor_pick_note: "Самая живая игра клуба",
      }),
      game({ id: "g3", game_type: "plo", small_blind: "0.5", big_blind: "1", tables: 1 }),
    ]);

    renderWithProviders(<CashPage />, { route: "/cash" });

    expect(await screen.findAllByTestId("cash-row")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "CASH" })).toBeInTheDocument();
    expect(screen.getByText("6 столов · только что")).toBeInTheDocument();
    expect(screen.getByText("NLH · 5 столов")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "PLO" }));
    expect(screen.getAllByTestId("cash-row")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));

    fireEvent.click(screen.getByRole("button", { name: /Editor's Pick/, pressed: false }));
    const picked = screen.getAllByTestId("cash-row");
    expect(picked).toHaveLength(1);

    fireEvent.click(picked[0]!);
    const sheet = await screen.findByTestId("cash-sheet");
    expect(within(sheet).getByText("Самая живая игра клуба")).toBeInTheDocument();
    expect(within(sheet).getByText("2 стола")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Открыть стол в PPPoker" })).toBeVisible();
  });

  it("пустой вечер и пустая подборка — разные подсказки", async () => {
    vi.mocked(cashApi.fetchCashGames).mockResolvedValueOnce([]);
    const view = renderWithProviders(<CashPage />, { route: "/cash" });
    expect(await screen.findByText("Сейчас столов нет")).toBeInTheDocument();
    view.unmount();

    window.localStorage.setItem(
      "ginger.cash.filters.v2",
      JSON.stringify({ games: [], stakes: [], picked: true }),
    );
    vi.mocked(cashApi.fetchCashGames).mockResolvedValueOnce([game({})]);
    renderWithProviders(<CashPage />, { route: "/cash" });
    expect(await screen.findByText("Подборка на сегодня ещё не готова")).toBeInTheDocument();
  });
});
