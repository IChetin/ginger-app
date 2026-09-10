import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";

import { AuthGate } from "@/features/auth/AuthGate";
import { renderWithProviders } from "@/test/render";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{JSON.stringify(location)}</output>;
}

describe("AuthGate", () => {
  it("renders value copy, login with returnTo, register link and children slot", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <AuthGate
          icon={<svg viewBox="0 0 24 24" aria-hidden="true" />}
          title="Ваша статистика турниров"
          description="ROI и график профита"
          returnTo="/tracker"
        >
          <p data-testid="auth-gate-slot">демо</p>
        </AuthGate>
        <LocationProbe />
      </>,
      { route: "/tracker" },
    );

    expect(screen.getByTestId("auth-gate")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ваша статистика турниров" })).toBeInTheDocument();
    expect(screen.queryByText("Требуется вход")).not.toBeInTheDocument();

    const login = screen.getByRole("link", { name: "Войти" });
    expect(login).toHaveAttribute("href", "/login");
    await user.click(login);
    expect(screen.getByTestId("location")).toHaveTextContent('"returnTo":"/tracker"');
  });

  it("links register with the same returnTo", () => {
    renderWithProviders(
      <AuthGate
        icon={<svg viewBox="0 0 24 24" aria-hidden="true" />}
        title="Напоминания о турнирах"
        description="Напомним к старту"
        returnTo="/bookmarks"
      />,
      { route: "/bookmarks" },
    );

    const register = screen.getByRole("link", { name: "Зарегистрироваться" });
    expect(register).toHaveAttribute("href", "/register");
    expect(screen.getByTestId("auth-gate")).toBeInTheDocument();
  });

  it("renders the optional slot under the actions", () => {
    renderWithProviders(
      <AuthGate
        icon={<svg viewBox="0 0 24 24" aria-hidden="true" />}
        title="Ваши раздачи и разборы"
        description="Реплей и заметки"
      >
        <div data-testid="future-demo">слот</div>
      </AuthGate>,
      { route: "/tracker" },
    );

    expect(screen.getByTestId("future-demo")).toHaveTextContent("слот");
  });
});
