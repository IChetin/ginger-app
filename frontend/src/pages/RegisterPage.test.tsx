import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { UserMe } from "@/api/types/auth";
import { AppRoutes } from "@/App";
import { renderWithProviders } from "@/test/render";

const registerStart = vi.fn();
const registerVerify = vi.fn();
const registerComplete = vi.fn();
const fetchCurrentUser = vi.fn();
const migrateBookmarks = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    registerStart: (...args: unknown[]) => registerStart(...args),
    registerVerify: (...args: unknown[]) => registerVerify(...args),
    registerComplete: (...args: unknown[]) => registerComplete(...args),
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
    migrateBookmarks: (...args: unknown[]) => migrateBookmarks(...args),
  };
});

const userFixture: UserMe = {
  id: "user-1",
  email: "new@example.com",
  phone: null,
  nickname: "newbie",
  base_currency: "RUB",
  timezone: null,
  schedule_view: "cards",
  role: "user",
  default_reminder_offsets: [1440, 120],
  email_verified: true,
  has_password: true,
  created_at: "2026-01-01T00:00:00Z",
};

describe("RegisterPage", () => {
  beforeEach(() => {
    registerStart.mockReset();
    registerVerify.mockReset();
    registerComplete.mockReset();
    fetchCurrentUser.mockReset();
    migrateBookmarks.mockReset();
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
    registerStart.mockResolvedValue({ ok: true, expires_in_seconds: 300, retry_after: 60 });
    registerVerify.mockResolvedValue({
      registration_token: "reg-token-aaaaaaaaaaaaaaaa",
      expires_in_seconds: 1800,
    });
    registerComplete.mockResolvedValue(userFixture);
    migrateBookmarks.mockResolvedValue({ created: 0, skipped: 0, items: [] });
  });

  it("blocks existing email without sending further", async () => {
    const user = userEvent.setup();
    registerStart.mockRejectedValue(
      new ApiError(409, "account_exists", "Аккаунт с таким email уже есть. Войдите"),
    );
    renderWithProviders(<AppRoutes />, { route: "/register?invite=inv-token" });
    await user.type(await screen.findByLabelText("Email"), "exists@example.com");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(await screen.findByTestId("register-error")).toHaveTextContent(/уже есть/i);
    expect(screen.getAllByRole("link", { name: "Войти" }).length).toBeGreaterThanOrEqual(1);
  });

  it("completes email → code → password flow", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/register?invite=inv-token" });

    await user.type(await screen.findByLabelText("Email"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => {
      expect(registerStart).toHaveBeenCalledWith({
        email: "new@example.com",
        privacy_consent: true,
        captcha_token: undefined,
        invite_token: "inv-token",
      });
    });

    await screen.findByTestId("code-step");
    await user.click(screen.getByLabelText("Цифра 1"));
    await user.paste("123456");
    await waitFor(() => {
      expect(registerVerify).toHaveBeenCalledWith({
        email: "new@example.com",
        code: "123456",
      });
    });

    expect(await screen.findByTestId("register-profile-step")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Никнейм"), "newbie");
    await user.type(screen.getByLabelText("Пароль"), "CorrectHorse1");
    await user.type(screen.getByLabelText("Повтор пароля"), "CorrectHorse1");
    fetchCurrentUser.mockResolvedValue(userFixture);
    await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));

    await waitFor(() => {
      expect(registerComplete).toHaveBeenCalledWith({
        registration_token: "reg-token-aaaaaaaaaaaaaaaa",
        password: "CorrectHorse1",
        nickname: "newbie",
        invite_token: "inv-token",
      });
    });
  });
  it("без приглашения регистрации нет", async () => {
    window.sessionStorage.clear();
    renderWithProviders(<AppRoutes />, { route: "/register" });
    expect(await screen.findByTestId("register-invite-required")).toBeInTheDocument();
    expect(registerStart).not.toHaveBeenCalled();
  });
});
