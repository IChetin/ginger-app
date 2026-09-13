import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { UserMe } from "@/api/types/auth";
import { AppRoutes } from "@/App";
import { renderWithProviders } from "@/test/render";

const requestAuthCode = vi.fn();
const verifyAuthCode = vi.fn();
const loginWithPassword = vi.fn();
const fetchCurrentUser = vi.fn();
const setPassword = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    requestAuthCode: (...args: unknown[]) => requestAuthCode(...args),
    verifyAuthCode: (...args: unknown[]) => verifyAuthCode(...args),
    loginWithPassword: (...args: unknown[]) => loginWithPassword(...args),
    setPassword: (...args: unknown[]) => setPassword(...args),
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

const userFixture: UserMe = {
  id: "user-1",
  email: "player@example.com",
  phone: null,
  nickname: "player",
  schedule_view: "cards",
  role: "user",
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

const userWithPassword: UserMe = { ...userFixture, has_password: true };

async function fillCredentials(
  user: ReturnType<typeof userEvent.setup>,
  email = "player@example.com",
  password = "CorrectHorse1",
) {
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Пароль"), password);
}

describe("LoginPage", () => {
  beforeEach(async () => {
    requestAuthCode.mockReset();
    verifyAuthCode.mockReset();
    loginWithPassword.mockReset();
    fetchCurrentUser.mockReset();
    setPassword.mockReset();
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
    requestAuthCode.mockResolvedValue({
      ok: true,
      expires_in_seconds: 300,
      retry_after: 60,
    });
    verifyAuthCode.mockResolvedValue(userFixture);
    loginWithPassword.mockResolvedValue(userWithPassword);
  });

  it("shows email and password on the login screen", async () => {
    renderWithProviders(<AppRoutes />, { route: "/login" });
    expect(await screen.findByTestId("login-credentials")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Зарегистрироваться" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.queryByText(/создадим после подтверждения/i)).not.toBeInTheDocument();
  });

  it("logs in with password", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/login" });
    await fillCredentials(user);
    fetchCurrentUser.mockResolvedValue(userWithPassword);
    await user.click(screen.getByRole("button", { name: "Войти" }));
    await waitFor(() => {
      expect(loginWithPassword).toHaveBeenCalledWith({
        email: "player@example.com",
        password: "CorrectHorse1",
      });
    });
    expect(await screen.findByTestId("player-home")).toBeInTheDocument();
  });

  it("shows generic error on bad password", async () => {
    const user = userEvent.setup();
    loginWithPassword.mockRejectedValue(
      new ApiError(401, "invalid_credentials", "Неверный email или пароль"),
    );
    renderWithProviders(<AppRoutes />, { route: "/login" });
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByTestId("login-error")).toHaveTextContent("Неверный email или пароль");
  });

  it("starts OTP flow and verifies code", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, {
      routerProps: {
        initialEntries: [{ pathname: "/login", state: { returnTo: "/tournaments" } }],
      },
    });
    await user.type(await screen.findByLabelText("Email"), "player@example.com");
    await user.click(screen.getByRole("button", { name: "Войти по коду из письма" }));

    await waitFor(() => {
      expect(requestAuthCode).toHaveBeenCalledWith("player@example.com", undefined);
    });
    expect(await screen.findByTestId("code-step")).toBeInTheDocument();

    const firstCell = screen.getByLabelText("Цифра 1");
    await user.click(firstCell);
    await user.paste("474747");

    await waitFor(() => {
      expect(verifyAuthCode).toHaveBeenCalledWith("player@example.com", "474747");
    });
    expect(await screen.findByTestId("offer-password-step")).toBeInTheDocument();
  });

  it("shows register CTA when account is missing on OTP request", async () => {
    const user = userEvent.setup();
    requestAuthCode.mockRejectedValue(
      new ApiError(404, "account_not_found", "Аккаунт с таким email не найден. Зарегистрируйтесь"),
    );
    renderWithProviders(<AppRoutes />, { route: "/login" });
    await user.type(await screen.findByLabelText("Email"), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: "Войти по коду из письма" }));
    expect(await screen.findByTestId("login-error")).toHaveTextContent(/не найден/i);
    expect(
      screen.getAllByRole("link", { name: "Зарегистрироваться" }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("keeps OTP cells shrinkable without a width cap", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/login" });
    await user.type(await screen.findByLabelText("Email"), "player@example.com");
    await user.click(screen.getByRole("button", { name: "Войти по коду из письма" }));
    await screen.findByTestId("code-step");

    const cells = screen
      .getAllByRole("textbox")
      .filter((el) => el.getAttribute("inputmode") === "numeric");
    expect(cells).toHaveLength(6);
    for (const cell of cells) {
      expect(cell.className).toMatch(/(^|\s)min-w-0(\s|$)/);
      expect(cell.className).toMatch(/(^|\s)flex-1(\s|$)/);
      expect(cell.className).not.toMatch(/max-w-/);
    }
  });

  it("shows invalid code attempts", async () => {
    const user = userEvent.setup();
    verifyAuthCode.mockRejectedValue(
      new ApiError(401, "otp_invalid", "Invalid OTP code", { attemptsLeft: 3 }),
    );
    renderWithProviders(<AppRoutes />, { route: "/login" });
    await user.type(await screen.findByLabelText("Email"), "player@example.com");
    await user.click(screen.getByRole("button", { name: "Войти по коду из письма" }));
    await user.click(await screen.findByLabelText("Цифра 1"));
    await user.paste("000000");
    expect(await screen.findByTestId("code-error")).toHaveTextContent(
      "Неверный код, осталось 3 попыток",
    );
  });

  it("redirects authenticated user away from login", async () => {
    fetchCurrentUser.mockResolvedValue(userWithPassword);
    renderWithProviders(<AppRoutes />, { route: "/login" });
    expect(await screen.findByTestId("player-home")).toBeInTheDocument();
  });

  it("returns to protected page after OTP login when password already set", async () => {
    const user = userEvent.setup();
    verifyAuthCode.mockResolvedValue(userWithPassword);
    renderWithProviders(<AppRoutes />, { route: "/profile" });
    expect(await screen.findByTestId("login-credentials")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "player@example.com");
    await user.click(screen.getByRole("button", { name: "Войти по коду из письма" }));
    await screen.findByTestId("code-step");
    fetchCurrentUser.mockResolvedValue(userWithPassword);
    await user.click(screen.getByLabelText("Цифра 1"));
    await user.paste("123456");

    await waitFor(() => {
      expect(verifyAuthCode).toHaveBeenCalled();
    });
    expect(await screen.findByTestId("profile-page")).toBeInTheDocument();
  });

  it("renders privacy stub", async () => {
    renderWithProviders(<AppRoutes />, { route: "/privacy" });
    expect(
      await screen.findByRole("heading", { name: "Политика конфиденциальности" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/TODO/i)).toBeInTheDocument();
  });
});
