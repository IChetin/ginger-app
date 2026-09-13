import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserMe } from "@/api/types/auth";
import type { Tournament } from "@/api/types/tournaments";
import { AppRoutes } from "@/App";
import { renderWithProviders } from "@/test/render";

const fetchTournaments = vi.fn();
const fetchCurrentUser = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchTournaments: (...args: unknown[]) => fetchTournaments(...args),
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

const user: UserMe = {
  id: "u1",
  email: "player@example.com",
  phone: null,
  nickname: "player",
  schedule_view: "cards",
  role: "user",
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

function tournament(overrides: Partial<Tournament>): Tournament {
  const inHour = new Date(Date.now() + 3600_000).toISOString();
  return {
    id: "t1",
    name: "DREAM RIVER",
    game_type: "nlh",
    bounty_kind: "pko",
    buyin: "16.00",
    guarantee: "1000.00",
    rebuy_cost: null,
    rebuy_terms: null,
    addon_cost: null,
    addon_terms: null,
    start_stack: 20000,
    table_size: 8,
    late_reg_levels: 10,
    level_minutes: "15/12/12",
    structure: "Turbo",
    ticket_value: null,
    satellite_target: null,
    early_bird_players: 10,
    notes: null,
    club: {
      id: "c1",
      name: "Ginger",
      slug: "ginger",
      app: "pppoker",
      chip_value: "1.0000",
      chip_currency_code: "USDT",
      currency_symbol: "$",
    },
    starts_at: inHour,
    late_reg_closes_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
    status: "scheduled",
    is_promoted: false,
    buyin_rub: "1408",
    guarantee_rub: "88000",
    has_addon: false,
    ...overrides,
  };
}

const running = tournament({
  id: "t2",
  name: "FAST PKO",
  buyin: "5.00",
  starts_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  late_reg_closes_at: new Date(Date.now() + 47 * 60_000).toISOString(),
});

describe("TournamentsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchTournaments.mockReset();
    fetchCurrentUser.mockReset();
    fetchTournaments.mockResolvedValue([running, tournament({})]);
  });

  it("карточки: деньги с символом, метки, отсчёт поздней регистрации", async () => {
    fetchCurrentUser.mockResolvedValue(user);
    renderWithProviders(<AppRoutes />, { route: "/tournaments" });

    const cards = await screen.findAllByTestId("tournament-card");
    expect(cards).toHaveLength(2);
    const river = within(cards[1]);
    expect(river.getByText("DREAM RIVER")).toBeInTheDocument();
    expect(river.getByText("$16")).toBeInTheDocument();
    expect(river.getByText("PKO")).toBeInTheDocument();
    expect(river.getByText("Early Bird ×10")).toBeInTheDocument();
    expect(within(cards[0]).getByText(/Рег. ещё 4\d:\d\d/)).toBeInTheDocument();
    expect(screen.getByText(/2 турнира/)).toBeInTheDocument();
  });

  it("таблица, если так выбрано в профиле", async () => {
    fetchCurrentUser.mockResolvedValue({ ...user, schedule_view: "table" });
    renderWithProviders(<AppRoutes />, { route: "/tournaments" });

    const rows = await screen.findAllByTestId("tournament-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(within(rows[0]).getByText("рег. ещё")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/^4\d:\d\d$/)).toBeInTheDocument();
    expect(screen.queryByTestId("tournament-card")).toBeNull();
  });

  it("фильтры уходят в запрос и запоминаются", async () => {
    fetchCurrentUser.mockResolvedValue(user);
    renderWithProviders(<AppRoutes />, { route: "/tournaments" });
    await screen.findAllByTestId("tournament-card");

    await userEvent.click(screen.getByRole("button", { name: "X-Poker" }));
    await userEvent.selectOptions(screen.getByLabelText("Бай-ин от"), "500");

    const params = fetchTournaments.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.app).toEqual(["xpoker"]);
    expect(params.buyin_rub_min).toBe(500);
    expect(
      JSON.parse(window.localStorage.getItem("ginger.tournaments.filters.v1") ?? "{}"),
    ).toMatchObject({
      apps: ["xpoker"],
      buyinMin: 500,
    });
  });
});
