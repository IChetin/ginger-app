import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onboardingDone } from "@/features/onboarding/platform";
import { OnboardingPage } from "@/pages/OnboardingPage";

vi.mock("@/features/push/hooks", () => ({
  isPushSupported: () => false,
  usePushSubscription: () => ({ data: null }),
  useSubscribePush: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

function renderOnboarding() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/welcome"]}>
        <Routes>
          <Route path="/welcome" element={<OnboardingPage />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OnboardingPage", () => {
  beforeEach(() => window.localStorage.clear());

  it("walks welcome → install → notifications and remembers completion", () => {
    renderOnboarding();
    expect(screen.getByText("Ginger — фишки, расписание, связь")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Дальше" }));

    expect(screen.getByText("Поставьте Ginger на экран")).toBeInTheDocument();
    // jsdom — не телефон: подсказка открыть на телефоне.
    expect(screen.getByTestId("install-steps-desktop")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Дальше" }));

    expect(screen.getByText("Уведомления")).toBeInTheDocument();
    expect(screen.getByText(/Здесь уведомления не работают/)).toBeInTheDocument();
    expect(onboardingDone()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Позже" }));

    expect(screen.getByText("home")).toBeInTheDocument();
    expect(onboardingDone()).toBe(true);
  });
});
