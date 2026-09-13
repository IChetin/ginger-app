import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { UserMe } from "@/api/types/auth";
import type { AccountClub, ChipRequest, PlayerMe } from "@/api/types/chips";
import { AppRoutes } from "@/App";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.fn();
const fetchPlayerMe = vi.fn();
const fetchChipRequests = vi.fn();
const fetchChipRequest = vi.fn();
const createChipRequest = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, fetchCurrentUser: () => fetchCurrentUser() };
});
vi.mock("@/features/chips/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/chips/api")>("@/features/chips/api");
  return {
    ...actual,
    fetchPlayerMe: () => fetchPlayerMe(),
    fetchChipRequests: () => fetchChipRequests(),
    fetchChipRequest: (id: string) => fetchChipRequest(id),
    createChipRequest: (body: unknown) => createChipRequest(body),
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

const ginger: AccountClub = {
  id: "c-g",
  name: "Ginger",
  slug: "ginger",
  app: "pppoker",
  chip_value: "1.0000",
  chip_currency_code: "USDT",
  currency_symbol: "$",
};
const ginger21: AccountClub = {
  ...ginger,
  id: "c-g21",
  name: "Ginger21",
  slug: "ginger21",
  app: "poker21",
  chip_currency_code: "RUB",
  currency_symbol: "₽",
};

function player(overrides: Partial<PlayerMe> = {}): PlayerMe {
  return {
    id: "p1",
    kind: "credit",
    status: "active",
    offline_access: false,
    results_consent: false,
    birthday: null,
    cashdesk_open: false,
    cashdesk_hours: "12:00–03:00 МСК",
    accounts: [
      {
        id: "acc-g",
        club: ginger,
        nickname: "player",
        app_account_id: "100",
        status: "confirmed",
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "acc-g21",
        club: ginger21,
        nickname: "player",
        app_account_id: "200",
        status: "confirmed",
        created_at: "2026-09-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

const created: ChipRequest = {
  id: "r1",
  kind: "topup",
  status: "sent",
  items: [],
  totals: [],
  payment_requisites: null,
  payment_deadline_at: null,
  has_screenshot: false,
  withdrawal_requisites: null,
  reject_comment: null,
  created_at: "2026-09-13T10:00:00Z",
  updated_at: "2026-09-13T10:00:00Z",
  completed_at: null,
};

describe("ChipsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCurrentUser.mockResolvedValue(user);
    fetchChipRequests.mockResolvedValue([]);
    fetchChipRequest.mockResolvedValue(created);
    createChipRequest.mockResolvedValue(created);
  });

  it("заявка в два клуба: кнопки сумм, итог, отправка", async () => {
    fetchPlayerMe.mockResolvedValue(player());
    renderWithProviders(<AppRoutes />, { route: "/chips" });

    const [first] = await screen.findAllByTestId("amount-row");
    await userEvent.click(within(first!).getByRole("button", { name: "100" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Добавить ещё клуб" }));

    const rows = screen.getAllByTestId("amount-row");
    expect(within(rows[1]!).getByRole("combobox")).toHaveValue("acc-g21");
    await userEvent.click(within(rows[1]!).getByRole("button", { name: /^5\s000$/ }));

    const total = screen.getByTestId("request-total").textContent?.replace(/\s/g, " ");
    expect(total).toBe("$100 · ₽5 000");
    expect(screen.getByText(/Касса работает 12:00–03:00 МСК/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Запросить фишки" }));
    await waitFor(() =>
      expect(createChipRequest).toHaveBeenCalledWith({
        kind: "topup",
        items: [
          { account_id: "acc-g", amount: "100" },
          { account_id: "acc-g21", amount: "5000" },
        ],
      }),
    );
    expect(await screen.findByTestId("chip-request-page")).toBeInTheDocument();
  });

  it("без подтверждённого аккаунта — предлагает привязать", async () => {
    fetchPlayerMe.mockResolvedValue(
      player({
        accounts: [
          {
            id: "acc-new",
            club: ginger,
            nickname: "player",
            app_account_id: "1",
            status: "pending",
            created_at: "2026-09-01T00:00:00Z",
          },
        ],
      }),
    );
    renderWithProviders(<AppRoutes />, { route: "/chips" });
    expect(await screen.findByText("Привяжите аккаунт в клубе")).toBeInTheDocument();
    expect(screen.getByText(/Аккаунт на проверке у менеджера/)).toBeInTheDocument();
  });

  it("не игрок — объясняет, как попасть", async () => {
    fetchPlayerMe.mockRejectedValue(new ApiError(403, "not_a_player", "Раздел для игроков"));
    renderWithProviders(<AppRoutes />, { route: "/chips" });
    expect(await screen.findByText("Фишки доступны игрокам клуба")).toBeInTheDocument();
  });
});
