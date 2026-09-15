import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
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
    lobby_name: null,
    bounty_share: null,
    early_bird_bonus: null,
    early_bird_levels: null,
    has_jackpot: false,
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
    expect(within(cards[0]).getByText(/late 4\d:\d\d/)).toBeInTheDocument();
    expect(screen.getByText(/2 турнира/)).toBeInTheDocument();
  });

  it("таблица, если так выбрано в профиле", async () => {
    fetchCurrentUser.mockResolvedValue({ ...user, schedule_view: "table" });
    renderWithProviders(<AppRoutes />, { route: "/tournaments" });

    const rows = await screen.findAllByTestId("tournament-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(within(rows[0]).getByText("late")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/^4\d:\d\d$/)).toBeInTheDocument();
    expect(screen.queryByTestId("tournament-card")).toBeNull();
  });

  it("расписание открывается без входа", async () => {
    fetchCurrentUser.mockRejectedValue(
      new ApiError(401, "unauthorized", "Authentication required"),
    );
    renderWithProviders(<AppRoutes />, { route: "/tournaments" });

    // Гостю по умолчанию — таблица, как и новым игрокам.
    expect(await screen.findAllByTestId("tournament-row")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "MTT" })).toBeInTheDocument();
  });

  it("тап по турниру открывает карточку с параметрами", async () => {
    fetchCurrentUser.mockResolvedValue({ ...user, schedule_view: "table" });
    renderWithProviders(<AppRoutes />, { route: "/tournaments" });

    const rows = await screen.findAllByTestId("tournament-row");
    await userEvent.click(within(rows[1]).getByText("DREAM RIVER"));

    const sheet = await screen.findByTestId("tournament-sheet");
    expect(within(sheet).getByText("DREAM RIVER")).toBeInTheDocument();
    expect(within(sheet).getByText("20 000")).toBeInTheDocument();
    expect(within(sheet).getByText("15/12/12 мин")).toBeInTheDocument();
    expect(within(sheet).getByText("10 уровней")).toBeInTheDocument();
    expect(within(sheet).getByText(/Турнир в клубе .+ · PPPoker/)).toBeInTheDocument();
  });

  it("сателлитов в выдаче нет, цена фильтрует на месте, выбор запоминается", async () => {
    fetchCurrentUser.mockResolvedValue(user);
    const satellite = tournament({
      id: "t3",
      name: "Sat Main",
      satellite_target: "Main Event",
      buyin: "1.00",
      buyin_rub: "88",
      guarantee: null,
      guarantee_rub: null,
    });
    const highRoller = tournament({
      id: "t4",
      name: "HIGH ROLLER",
      bounty_kind: "none",
      buyin: "50.00",
      buyin_rub: "4400",
    });
    fetchTournaments.mockResolvedValue([running, tournament({}), satellite, highRoller]);
    renderWithProviders(<AppRoutes />, { route: "/tournaments" });

    expect(await screen.findAllByTestId("tournament-card")).toHaveLength(3);
    expect(screen.queryByText("Sat → Main Event")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Сателлиты" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "от 3 000 ₽" }));
    const cards = screen.getAllByTestId("tournament-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText("HIGH ROLLER")).toBeInTheDocument();
    expect(within(cards[0]).getByText("R+A")).toBeInTheDocument();

    const params = fetchTournaments.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.keys(params).sort()).toEqual(["from", "to"]);
    expect(
      JSON.parse(window.localStorage.getItem("ginger.tournaments.filters.v2") ?? "{}"),
    ).toEqual({ range: "day", prices: ["high"] });
  });
});
