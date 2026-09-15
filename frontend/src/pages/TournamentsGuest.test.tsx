import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
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

const tournament = {
  id: "t1",
  name: "DREAM RIVER",
  lobby_name: null,
  game_type: "nlh",
  bounty_kind: "pko",
  buyin: "16.00",
  buyin_rub: "1408",
  guarantee: "1000.00",
  guarantee_rub: "88000",
  satellite_target: null,
  starts_at: new Date(Date.now() + 3600_000).toISOString(),
  late_reg_closes_at: null,
  status: "scheduled",
  is_promoted: false,
  has_addon: false,
  has_jackpot: false,
  club: {
    id: "c1",
    name: "Ginger",
    slug: "ginger",
    app: "pppoker",
    chip_value: "1.0000",
    chip_currency_code: "USDT",
    currency_symbol: "$",
  },
} as Tournament;

describe("MTT для гостя", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchTournaments.mockReset();
    fetchCurrentUser.mockReset();
    fetchCurrentUser.mockRejectedValue(
      new ApiError(401, "unauthorized", "Authentication required"),
    );
    fetchTournaments.mockResolvedValue([tournament]);
  });

  it("неделя и Editor's Pick просят войти, запрос остаётся на сутки", async () => {
    // Сохранённая неделя от прошлого входа гостю не применяется.
    window.localStorage.setItem(
      "ginger.tournaments.filters.v2",
      JSON.stringify({ range: "week", prices: [], picked: true }),
    );
    renderWithProviders(<AppRoutes />, { route: "/tournaments" });

    expect(await screen.findAllByTestId("tournament-row")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "24 часа" })).toHaveAttribute("aria-selected", "true");
    // Editor's Pick гостю виден тизером — с замком.
    expect(screen.getByTestId("editors-pick-lock")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Неделя" }));
    expect(await screen.findByText("Нужен вход")).toBeInTheDocument();
    expect(screen.getByText(/Расписание на 3 и 7 дней/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Не сейчас" }));

    await userEvent.click(screen.getByRole("button", { name: "Editor's Pick" }));
    expect(await screen.findByText(/Editor's Pick — для игроков клуба/)).toBeInTheDocument();

    for (const [params] of fetchTournaments.mock.calls as [{ from: string; to: string }][]) {
      const hours = (new Date(params.to).getTime() - new Date(params.from).getTime()) / 3600_000;
      expect(hours).toBeLessThanOrEqual(24);
    }
  });

  it("429 — понятное сообщение", async () => {
    fetchTournaments.mockRejectedValue(
      new ApiError(429, "rate_limited", "Too many requests", { retryAfter: 600 }),
    );
    renderWithProviders(<AppRoutes />, { route: "/tournaments" });
    expect(
      await screen.findByText("Слишком много запросов. Попробуйте через 10 мин."),
    ).toBeInTheDocument();
  });
});
