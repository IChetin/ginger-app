import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserMe } from "@/api/types/auth";
import type { ChipRequest } from "@/api/types/chips";
import { AppRoutes } from "@/App";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.fn();
const fetchChipRequest = vi.fn();
const uploadScreenshot = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, fetchCurrentUser: () => fetchCurrentUser() };
});
vi.mock("@/features/chips/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/chips/api")>("@/features/chips/api");
  return {
    ...actual,
    fetchChipRequest: (id: string) => fetchChipRequest(id),
    uploadScreenshot: (id: string, file: Blob, name: string) => uploadScreenshot(id, file, name),
  };
});

const user: UserMe = {
  id: "u1",
  email: "deposit@example.com",
  phone: null,
  nickname: "deposit",
  base_currency: "RUB",
  timezone: null,
  schedule_view: "cards",
  role: "user",
  default_reminder_offsets: [1440, 120],
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

function request(overrides: Partial<ChipRequest>): ChipRequest {
  return {
    id: "r1",
    kind: "topup",
    status: "awaiting_payment",
    items: [
      {
        id: "i1",
        account_id: "acc",
        account_nickname: "deposit",
        account_app_id: "100",
        club: {
          id: "c",
          name: "Ginger",
          slug: "ginger",
          app: "pppoker",
          chip_value: "1.0000",
          chip_currency_code: "USDT",
          currency_symbol: "$",
        },
        amount: "50.00",
        chip_value: "1.0000",
        chip_currency_code: "USDT",
        money_amount: "50.0000",
      },
    ],
    totals: [{ currency_code: "USDT", currency_symbol: "$", amount: "50.0000" }],
    payment_requisites: "Карта 1111, Иван И.",
    payment_deadline_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    has_screenshot: false,
    withdrawal_requisites: null,
    reject_comment: null,
    created_at: "2026-09-13T10:00:00Z",
    updated_at: "2026-09-13T10:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

describe("ChipRequestPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCurrentUser.mockResolvedValue(user);
  });

  it("реквизиты, таймер и отправка скриншота", async () => {
    fetchChipRequest.mockResolvedValue(request({}));
    uploadScreenshot.mockResolvedValue(
      request({ status: "paid", payment_deadline_at: null, has_screenshot: true }),
    );
    renderWithProviders(<AppRoutes />, { route: "/chips/r1" });

    expect(await screen.findByText("Карта 1111, Иван И.")).toBeInTheDocument();
    expect(screen.getByTestId("payment-timer")).toHaveTextContent(/Осталось (09|10):\d\d/);
    expect(screen.getByText("Ждёт оплаты")).toBeInTheDocument();

    const file = new File(["png"], "pay.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Скриншот оплаты"), file);
    await waitFor(() => expect(uploadScreenshot).toHaveBeenCalledWith("r1", file, "pay.png"));
    expect(await screen.findByText("Скриншот получен — проверяем оплату")).toBeInTheDocument();
  });

  it("отказ показывает комментарий и даёт повторить", async () => {
    fetchChipRequest.mockResolvedValue(
      request({ status: "rejected", payment_deadline_at: null, reject_comment: "Закройте долг" }),
    );
    renderWithProviders(<AppRoutes />, { route: "/chips/r1" });
    expect(await screen.findByText("Закройте долг")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
});
