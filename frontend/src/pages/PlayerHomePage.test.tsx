import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as client from "@/api/client";
import type { ChipRequest, PlayerMe } from "@/api/types/chips";
import type { Tournament } from "@/api/types/tournaments";
import * as chipsApi from "@/features/chips/api";
import * as feedApi from "@/features/feed/feedApi";
import { PlayerHomePage } from "@/pages/PlayerHomePage";

vi.mock("@/features/feed/feedApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/feed/feedApi")>();
  return { ...original, fetchFeed: vi.fn() };
});

vi.mock("@/features/chips/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/chips/api")>();
  return { ...original, fetchPlayerMe: vi.fn(), fetchChipRequests: vi.fn() };
});

vi.mock("@/api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/client")>();
  return {
    ...original,
    fetchTournaments: vi.fn(),
    fetchCurrentUser: vi.fn().mockResolvedValue({ nickname: "fox", role: "user" }),
  };
});

const ginger = {
  id: "c1",
  name: "Ginger",
  slug: "ginger",
  app: "pppoker" as const,
  chip_value: "1",
  chip_currency_code: "USDT",
  currency_symbol: "$",
};
const g21 = { ...ginger, id: "c2", name: "Ginger21", slug: "ginger21", app: "poker21" as const };

function player(overrides: Partial<PlayerMe> = {}): PlayerMe {
  return {
    id: "p1",
    kind: "credit",
    status: "active",
    offline_access: false,
    results_consent: false,
    birthday: null,
    accounts: [
      {
        id: "a1",
        club: ginger,
        nickname: "fox",
        app_account_id: "1",
        status: "confirmed",
        created_at: "2026-09-01T00:00:00Z",
      },
    ],
    cashdesk_open: true,
    cashdesk_hours: "12:00–03:00",
    ...overrides,
  };
}

function request(id: string, status: ChipRequest["status"]): ChipRequest {
  return {
    id,
    kind: "topup",
    status,
    items: [
      {
        id: `i${id}`,
        account_id: "a1",
        account_nickname: "fox",
        account_app_id: "1",
        club: ginger,
        amount: "100",
        chip_value: "1",
        chip_currency_code: "USDT",
        money_amount: "100",
      },
    ],
    totals: [{ currency_code: "USDT", currency_symbol: "$", amount: "100" }],
    payment_requisites: null,
    payment_deadline_at: null,
    has_screenshot: false,
    withdrawal_requisites: null,
    reject_comment: null,
    created_at: "2026-09-13T10:00:00Z",
    updated_at: "2026-09-13T10:00:00Z",
    completed_at: null,
  };
}

function tournament(id: string, club: Tournament["club"], minutesFromNow: number): Tournament {
  const starts = new Date(Date.now() + minutesFromNow * 60_000).toISOString();
  return {
    id,
    name: `T ${id}`,
    game_type: "nlh",
    bounty_kind: "none",
    buyin: "10",
    guarantee: null,
    rebuy_cost: null,
    rebuy_terms: null,
    addon_cost: null,
    addon_terms: null,
    start_stack: null,
    table_size: null,
    late_reg_levels: null,
    level_minutes: null,
    structure: null,
    ticket_value: null,
    satellite_target: null,
    early_bird_players: null,
    notes: null,
    club,
    starts_at: starts,
    late_reg_closes_at: null,
    status: "scheduled",
    is_promoted: false,
    buyin_rub: null,
    guarantee_rub: null,
    has_addon: false,
  };
}

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlayerHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PlayerHomePage", () => {
  beforeEach(() => {
    vi.mocked(client.fetchCurrentUser).mockResolvedValue({
      nickname: "fox",
      role: "user",
    } as Awaited<ReturnType<typeof client.fetchCurrentUser>>);
    vi.mocked(feedApi.fetchFeed).mockResolvedValue({
      main_events: [
        { ...tournament("main", g21, 120), name: "Grand Knockout", guarantee: "1500000" },
      ],
      evening: [tournament("eve", ginger, 300)],
      wins: [
        {
          id: "w1",
          player_nickname: "Player123",
          club: { id: "c2", name: "Ginger21", app: "poker21" },
          tournament_name: "Daily PKO",
          place: 1,
          prize_amount: "32000",
          currency_code: "RUB",
          currency_symbol: "₽",
          won_on: "2026-09-14",
        },
      ],
    });
  });

  it("shows open request, repeat of last topup and the club feed", async () => {
    vi.mocked(chipsApi.fetchPlayerMe).mockResolvedValue(player());
    vi.mocked(chipsApi.fetchChipRequests).mockResolvedValue([
      request("open", "sent"),
      request("done", "completed"),
    ]);
    renderHome();

    const open = await screen.findByTestId("home-open-requests");
    expect(within(open).getAllByTestId("chip-request-row")).toHaveLength(1);
    expect(await screen.findByTestId("home-repeat")).toHaveTextContent("Ещё Ginger 100");
    expect(await screen.findByTestId("feed-main-event")).toHaveTextContent("Grand Knockout");
    expect(within(screen.getByTestId("feed-evening")).getByText("T eve")).toBeInTheDocument();
    expect(within(screen.getByTestId("feed-win")).getByText("Player123")).toBeInTheDocument();
    expect(screen.queryByTestId("home-guest")).not.toBeInTheDocument();
  });

  it("newcomer without requests gets a big request button", async () => {
    vi.mocked(chipsApi.fetchPlayerMe).mockResolvedValue(player({ accounts: [] }));
    vi.mocked(chipsApi.fetchChipRequests).mockResolvedValue([]);
    renderHome();
    expect(await screen.findByRole("link", { name: "Запросить фишки" })).toBeInTheDocument();
    expect(screen.queryByTestId("home-repeat")).not.toBeInTheDocument();
    expect(await screen.findByTestId("feed")).toBeInTheDocument();
  });

  it("guest sees the app: welcome, login link and the feed", async () => {
    const unauthorized = new client.ApiError(401, "unauthorized", "Authentication required");
    vi.mocked(client.fetchCurrentUser).mockRejectedValue(unauthorized);
    vi.mocked(chipsApi.fetchPlayerMe).mockRejectedValue(unauthorized);
    renderHome();

    expect(await screen.findByTestId("home-guest")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Войти" })[0]).toHaveAttribute("href", "/login");
    expect(await screen.findByTestId("feed-main-event")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Запросить фишки" })).not.toBeInTheDocument();
  });

  it("blocked player sees only the stub", async () => {
    vi.mocked(chipsApi.fetchPlayerMe).mockResolvedValue(player({ status: "blocked" }));
    vi.mocked(chipsApi.fetchChipRequests).mockResolvedValue([]);
    renderHome();
    expect(await screen.findByText("Вы заблокированы")).toBeInTheDocument();
    expect(screen.queryByText("Запросить фишки")).not.toBeInTheDocument();
  });
});
