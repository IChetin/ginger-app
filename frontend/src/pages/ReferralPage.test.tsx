import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import * as api from "@/features/chips/api";
import { InvitePage } from "@/pages/InvitePage";
import { ReferralPage } from "@/pages/ReferralPage";

vi.mock("@/features/chips/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/chips/api")>();
  return { ...original, checkInvite: vi.fn(), fetchReferral: vi.fn() };
});

function renderAt(path: string, element: React.ReactNode, pattern: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={pattern} element={element} />
            <Route path="/register" element={<p>register</p>} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>,
  );
}

describe("personal referral link", () => {
  it("shows who invites and leads to registration", async () => {
    vi.mocked(api.checkInvite).mockResolvedValue({
      valid: true,
      reason: null,
      referrer_nickname: "fox",
    });
    renderAt("/r/ABCD2345", <InvitePage />, "/r/:token");
    expect(await screen.findByText("fox зовёт вас в Ginger")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Зарегистрироваться" })).toHaveAttribute(
      "href",
      "/register?invite=ABCD2345",
    );
  });

  it("explains a paused link", async () => {
    vi.mocked(api.checkInvite).mockResolvedValue({ valid: false, reason: "paused" });
    renderAt("/r/ABCD2345", <InvitePage />, "/r/:token");
    expect(await screen.findByText(/сегодня уже много регистраций/)).toBeInTheDocument();
  });

  it("invite screen renders QR and counters", async () => {
    vi.mocked(api.fetchReferral).mockResolvedValue({
      code: "ABCD2345",
      path: "/r/ABCD2345",
      invited_total: 3,
      registrations_24h: 5,
      daily_limit: 5,
      paused: true,
    });
    renderAt("/referral", <ReferralPage />, "/referral");
    const qr = await screen.findByTestId("referral-qr");
    expect(qr.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(/Ссылка приостановлена/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
