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
const updatePlayerAccount = vi.fn();
const addAppAccount = vi.fn();
const fetchPublicClubs = vi.fn();

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
    updatePlayerAccount: (id: string, body: unknown) => updatePlayerAccount(id, body),
    addAppAccount: (body: unknown) => addAppAccount(body),
    fetchPublicClubs: () => fetchPublicClubs(),
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
    fetchPublicClubs.mockResolvedValue([]);
  });

  it("заявка в два клуба: кнопки сумм, итог, отправка", async () => {
    fetchPlayerMe.mockResolvedValue(player());
    renderWithProviders(<AppRoutes />, { route: "/chips" });

    const [first] = await screen.findAllByTestId("amount-row");
    await userEvent.click(within(first!).getByRole("button", { name: "100" }));
    expect(screen.getByRole("button", { name: "Ginger · player" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Ginger21 · player" }));

    const rows = screen.getAllByTestId("amount-row");
    expect(within(rows[1]!).getByText("Ginger21")).toBeInTheDocument();
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

  it("история: повторить заявку в один тап", async () => {
    fetchPlayerMe.mockResolvedValue(player());
    fetchChipRequests.mockResolvedValue([
      {
        ...created,
        id: "r-old",
        status: "completed",
        items: [
          {
            id: "i1",
            account_id: "acc-g",
            account_nickname: "player",
            account_app_id: "100",
            club: ginger,
            amount: "100.00",
            chip_value: "1.0000",
            chip_currency_code: "USDT",
            money_amount: "100.0000",
          },
        ],
      },
    ]);
    renderWithProviders(<AppRoutes />, { route: "/chips" });

    const repeat = await screen.findByRole("link", { name: "Повторить: Ginger 100" });
    expect(repeat).toHaveAttribute("href", "/chips?repeat=r-old");
  });

  it("мои аккаунты: аккаунт правится прямо в списке", async () => {
    const account = {
      id: "acc-1",
      club: ginger,
      nickname: "Молоток",
      app_account_id: "111640",
      status: "confirmed" as const,
      created_at: "2026-09-01T00:00:00Z",
    };
    fetchPlayerMe.mockResolvedValue(player({ accounts: [account] }));
    updatePlayerAccount.mockResolvedValue({ ...account, nickname: "Кувалда" });
    const view = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/chips/accounts" });

    expect(await screen.findByRole("heading", { name: "Мои аккаунты" })).toBeInTheDocument();
    // Статуса «на проверке» больше нет — аккаунт сразу в работе.
    expect(screen.queryByText("На проверке")).not.toBeInTheDocument();

    await view.click(await screen.findByRole("button", { name: "Изменить PPPoker Молоток" }));
    const row = screen.getByTestId("app-account");
    const nick = within(row).getByLabelText("Ник в приложении");
    await view.clear(nick);
    await view.type(nick, "Кувалда");
    await view.click(within(row).getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(updatePlayerAccount).toHaveBeenCalledWith("acc-1", {
        nickname: "Кувалда",
        app_account_id: "111640",
      }),
    );
  });

  it("новый аккаунт: ID вводится раз, клубы игрок отмечает сам", async () => {
    const club = (id: string, name: string, app: "pppoker" | "xpoker") => ({
      id,
      name,
      slug: id,
      app,
      app_club_id: null,
      chip_value: null,
      chip_currency_code: null,
      download_url: null,
      join_steps: null,
      games: null,
    });
    fetchPublicClubs.mockResolvedValue([
      club("c-g", "Ginger", "pppoker"),
      club("c-psy", "G.Psy", "pppoker"),
      club("c-pg", "Private.G", "pppoker"),
      club("c-plus", "Ginger+", "xpoker"),
    ]);
    fetchPlayerMe.mockResolvedValue(player({ accounts: [] }));
    addAppAccount.mockResolvedValue([]);
    const view = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/chips/accounts" });

    await view.click(await screen.findByRole("radio", { name: "PPPoker" }));
    await view.type(screen.getByLabelText("ID в приложении"), "111640");
    await view.type(screen.getByLabelText("Ник в приложении"), "Молоток");
    // По умолчанию клубы не отмечены — без выбора привязать нельзя.
    expect(screen.getByRole("button", { name: "Привязать" })).toBeDisabled();
    await view.click(screen.getByRole("button", { name: "Ginger" }));
    await view.click(screen.getByRole("button", { name: "G.Psy" }));
    await view.click(screen.getByRole("button", { name: "Привязать" }));

    await waitFor(() =>
      expect(addAppAccount).toHaveBeenCalledWith({
        club_ids: ["c-g", "c-psy"],
        nickname: "Молоток",
        app_account_id: "111640",
      }),
    );
  });

  it("без аккаунтов — предлагает привязать", async () => {
    fetchPlayerMe.mockResolvedValue(player({ accounts: [] }));
    renderWithProviders(<AppRoutes />, { route: "/chips" });
    expect(await screen.findByText("Привяжите аккаунт в клубе")).toBeInTheDocument();
    expect(screen.getByText(/Без него фишки не запросить/)).toBeInTheDocument();
  });

  it("не игрок — объясняет, как попасть", async () => {
    fetchPlayerMe.mockRejectedValue(new ApiError(403, "not_a_player", "Раздел для игроков"));
    renderWithProviders(<AppRoutes />, { route: "/chips" });
    expect(await screen.findByText("Фишки доступны игрокам клуба")).toBeInTheDocument();
  });
});
