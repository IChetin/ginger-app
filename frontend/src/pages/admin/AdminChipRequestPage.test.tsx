import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import type { ChipRequestAdmin } from "@/features/admin/chips/api";
import * as api from "@/features/admin/chips/api";
import { AdminChipRequestPage } from "@/pages/admin/AdminChipRequestPage";
import { nextActionLabel } from "@/features/admin/chips/format";

vi.mock("@/features/admin/chips/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/admin/chips/api")>();
  return {
    ...original,
    fetchAdminChipRequest: vi.fn(),
    fetchRequisiteTemplates: vi.fn(),
    acceptChipRequest: vi.fn(),
    completeChipRequest: vi.fn(),
    rejectChipRequest: vi.fn(),
    sendRequisites: vi.fn(),
  };
});

const club = {
  id: "c1",
  name: "Ginger",
  slug: "ginger",
  app: "pppoker" as const,
  chip_value: "1",
  chip_currency_code: "USDT",
  currency_symbol: "$",
};

function makeRequest(overrides: Partial<ChipRequestAdmin> = {}): ChipRequestAdmin {
  return {
    id: "r1",
    kind: "topup",
    status: "sent",
    items: [
      {
        id: "i1",
        account_id: "a1",
        account_nickname: "fox",
        account_app_id: "123",
        club,
        amount: "25",
        chip_value: "1",
        chip_currency_code: "USDT",
        money_amount: "25",
      },
    ],
    totals: [{ currency_code: "USDT", currency_symbol: "$", amount: "25" }],
    payment_requisites: null,
    payment_deadline_at: null,
    has_screenshot: false,
    withdrawal_requisites: null,
    reject_comment: null,
    created_at: "2026-09-13T12:00:00Z",
    updated_at: "2026-09-13T12:00:00Z",
    completed_at: null,
    player: {
      id: "p1",
      nickname: "Vasya",
      email: "v@example.com",
      kind: "credit",
      status: "active",
    },
    handled_by_nickname: null,
    events: [],
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/chips/r1"]}>
        <ConfirmProvider>
          <Routes>
            <Route path="/admin/chips/:requestId" element={<AdminChipRequestPage />} />
          </Routes>
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminChipRequestPage", () => {
  beforeEach(() => {
    vi.mocked(api.fetchRequisiteTemplates).mockResolvedValue([
      { id: "t1", title: "Т-Банк", body: "2200 0000", is_active: true, sort_order: 0 },
    ]);
  });

  it("credit request: issues chips in one tap", async () => {
    vi.mocked(api.fetchAdminChipRequest).mockResolvedValue(makeRequest());
    vi.mocked(api.completeChipRequest).mockResolvedValue(makeRequest({ status: "completed" }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Фишки выданы" }));
    await waitFor(() => expect(api.completeChipRequest).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("Выдана")).toBeInTheDocument();
  });

  it("deposit request: sends requisites from a template, no direct issue", async () => {
    const request = makeRequest({
      player: {
        id: "p2",
        nickname: "Dep",
        email: "d@example.com",
        kind: "deposit",
        status: "active",
      },
    });
    vi.mocked(api.fetchAdminChipRequest).mockResolvedValue(request);
    vi.mocked(api.sendRequisites).mockResolvedValue({ ...request, status: "awaiting_payment" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Т-Банк/ }));
    // Реквизиты уходят только после подтверждения.
    expect(api.sendRequisites).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Отправить" }));
    await waitFor(() =>
      expect(api.sendRequisites).toHaveBeenCalledWith("r1", { template_id: "t1" }),
    );
    expect(screen.queryByRole("button", { name: "Фишки выданы" })).not.toBeInTheDocument();
  });

  it("reject requires a comment", async () => {
    vi.mocked(api.fetchAdminChipRequest).mockResolvedValue(makeRequest());
    vi.mocked(api.rejectChipRequest).mockResolvedValue(
      makeRequest({ status: "rejected", reject_comment: "нет ID" }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Отклонить" }));
    const submit = screen.getByRole("button", { name: "Отклонить заявку" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Причина отказа"), { target: { value: "нет ID" } });
    fireEvent.click(submit);
    await waitFor(() => expect(api.rejectChipRequest).toHaveBeenCalledWith("r1", "нет ID"));
  });

  it("queue shows the next manager action", () => {
    expect(nextActionLabel(makeRequest())).toBe("Принять");
    expect(
      nextActionLabel(
        makeRequest({
          player: { id: "p", nickname: "d", email: "d", kind: "deposit", status: "active" },
        }),
      ),
    ).toBe("Отправить реквизиты");
    expect(nextActionLabel(makeRequest({ status: "paid" }))).toBe("Проверить оплату");
    expect(nextActionLabel(makeRequest({ status: "completed" }))).toBeNull();
  });
});
