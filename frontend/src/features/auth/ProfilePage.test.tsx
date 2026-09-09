import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { UserMe } from "@/api/types/auth";
import { authKeys } from "@/features/auth/queryKeys";
import { ProfilePage } from "@/features/auth/ProfilePage";
import { trackerKeys } from "@/features/tracker/queryKeys";
import { resetThemeStateForTests } from "@/lib/theme";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.fn();
const updateCurrentUser = vi.fn();
const logoutAuth = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
    updateCurrentUser: (...args: unknown[]) => updateCurrentUser(...args),
    logoutAuth: (...args: unknown[]) => logoutAuth(...args),
  };
});

vi.mock("@/features/tracker/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/tracker/api")>("@/features/tracker/api");
  return {
    ...actual,
    fetchResultCurrencies: vi.fn().mockResolvedValue([
      { code: "RUB", symbol: "₽" },
      { code: "USD", symbol: "$" },
    ]),
  };
});

const userFixture: UserMe = {
  id: "user-1",
  email: "player@example.com",
  phone: null,
  nickname: "player",
  base_currency: "RUB",
  timezone: null,
  stack_display: "chips",
  hide_holes_until_showdown: true,
  hand_input_mode: "table",
  card_deck: "four_color",
  results_visibility: "private",
  role: "user",
  default_reminder_offsets: [1440, 120],
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

const CHROME_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const SAFARI_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function stubBrowser(userAgent: string, platform = "Linux armv8l") {
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: new Promise(() => {}) },
    configurable: true,
  });
  vi.stubGlobal("PushManager", class {});
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(navigator, "serviceWorker");
    fetchCurrentUser.mockResolvedValue(userFixture);
    updateCurrentUser.mockResolvedValue({
      ...userFixture,
      nickname: "pro",
    });
    logoutAuth.mockResolvedValue({ ok: true });
  });

  it("renders profile and updates nickname through sheet", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("player")).toBeInTheDocument();
    expect(screen.getByText(/Вы вошли как/i)).toBeInTheDocument();
    expect(screen.getByText("player@example.com")).toBeInTheDocument();
    expect(screen.getByText("Day2 · версия 0.1.0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Редактировать профиль" }));
    await user.clear(screen.getByLabelText("Никнейм"));
    await user.type(screen.getByLabelText("Никнейм"), "pro");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(updateCurrentUser).toHaveBeenCalledWith({ nickname: "pro" });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<UserMe>(authKeys.me());
      expect(cached?.nickname).toBe("pro");
    });
  });

  // BUG-6: «Не удалось сохранить никнейм» hid the real answer of the server.
  it("shows the real reason when the nickname is taken", async () => {
    const user = userEvent.setup();
    updateCurrentUser.mockRejectedValue(new ApiError(409, "conflict", "Ник занят"));
    renderWithProviders(<ProfilePage />);

    await screen.findByText("player");
    await user.click(screen.getByRole("button", { name: "Редактировать профиль" }));
    await user.clear(screen.getByLabelText("Никнейм"));
    await user.type(screen.getByLabelText("Никнейм"), "taken");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByTestId("nickname-error")).toHaveTextContent("Ник занят");
  });

  it("rejects digits-only nickname on the client before PATCH", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await screen.findByText("player");
    await user.click(screen.getByRole("button", { name: "Редактировать профиль" }));
    await user.clear(screen.getByLabelText("Никнейм"));
    await user.type(screen.getByLabelText("Никнейм"), "1234");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Ник не может состоять только из цифр")).toBeInTheDocument();
    expect(updateCurrentUser).not.toHaveBeenCalled();
  });

  it("accepts spaces, dots and emoji in a nickname", async () => {
    const user = userEvent.setup();
    updateCurrentUser.mockResolvedValue({ ...userFixture, nickname: "pro.player 😎" });
    renderWithProviders(<ProfilePage />);

    await screen.findByText("player");
    await user.click(screen.getByRole("button", { name: "Редактировать профиль" }));
    await user.clear(screen.getByLabelText("Никнейм"));
    await user.type(screen.getByLabelText("Никнейм"), "pro.player 😎");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(updateCurrentUser).toHaveBeenCalledWith({ nickname: "pro.player 😎" });
    });
  });

  it("ignores a repeated submit while the first PATCH is in flight", async () => {
    const user = userEvent.setup();
    let release: (value: UserMe) => void = () => {};
    updateCurrentUser.mockImplementation(
      () =>
        new Promise<UserMe>((resolve) => {
          release = resolve;
        }),
    );
    renderWithProviders(<ProfilePage />);

    await screen.findByText("player");
    await user.click(screen.getByRole("button", { name: "Редактировать профиль" }));
    await user.clear(screen.getByLabelText("Никнейм"));
    await user.type(screen.getByLabelText("Никнейм"), "pro");

    // Submitting the form directly is what Enter in the field does: the disabled
    // Save button cannot stop it, only the in-flight guard can.
    const form = screen.getByLabelText("Никнейм").closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(updateCurrentUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled());

    expect(updateCurrentUser).toHaveBeenCalledTimes(1);
    release({ ...userFixture, nickname: "pro" });
  });

  it("invalidates tracker after base currency change", async () => {
    const user = userEvent.setup();
    updateCurrentUser.mockResolvedValue({ ...userFixture, base_currency: "USD" });
    const { queryClient } = renderWithProviders(<ProfilePage />);
    queryClient.setQueryData(trackerKeys.stats(), { profit: "100" });

    await screen.findByText("player");
    await user.click(screen.getByRole("button", { name: /Базовая валюта/ }));
    await user.click(await screen.findByRole("button", { name: /\$ USD/ }));

    await waitFor(() => {
      expect(updateCurrentUser).toHaveBeenCalledWith({ base_currency: "USD" });
      expect(queryClient.getQueryState(trackerKeys.stats())?.isInvalidated).toBe(true);
    });
  });

  it("clears private cache on confirmed logout", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<ProfilePage />);
    queryClient.setQueryData(["private-user-data"], { secret: true });

    await screen.findByText("player");
    await user.click(screen.getByRole("button", { name: "Выйти" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Выйти" }));

    await waitFor(() => expect(logoutAuth).toHaveBeenCalledOnce());
    expect(queryClient.getQueryData(["private-user-data"])).toBeUndefined();
  });

  it("applies theme choice from settings sheet", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await screen.findByText("player");
    expect(screen.getByRole("button", { name: /Тема/ })).toHaveTextContent("Как в системе");

    await user.click(screen.getByRole("button", { name: /Тема/ }));
    await user.click(await screen.findByRole("radio", { name: /Светлая/ }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Тема/ })).toHaveTextContent("Светлая");
    });

    resetThemeStateForTests();
    document.documentElement.removeAttribute("data-theme");
  });

  it("saves a classic deck from the settings sheet", async () => {
    const user = userEvent.setup();
    updateCurrentUser.mockResolvedValue({ ...userFixture, card_deck: "classic" });
    renderWithProviders(<ProfilePage />);

    await screen.findByText("player");
    expect(screen.getByTestId("settings-card-deck")).toHaveTextContent("Четырёхцветная");

    await user.click(screen.getByTestId("settings-card-deck"));
    expect(await screen.findByTestId("card-deck-four_color")).toBeInTheDocument();
    expect(screen.getAllByTestId("playing-card")).toHaveLength(8);
    await user.click(screen.getByTestId("card-deck-classic"));

    await waitFor(() => {
      expect(updateCurrentUser).toHaveBeenCalledWith({ card_deck: "classic" });
    });
    await waitFor(() => {
      expect(screen.getByTestId("settings-card-deck")).toHaveTextContent("Классическая");
    });
  });

  // BUG-5: the denial toast always talked about Safari settings.
  it("explains a denied permission in the words of the current browser", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission: vi.fn(),
    });
    stubBrowser(CHROME_ANDROID_UA);
    renderWithProviders(<ProfilePage />);

    await screen.findByText("player");
    const pushSwitch = screen.getByRole("checkbox", { name: "Push-уведомления" });
    await user.click(pushSwitch);

    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent(/Chrome заблокировал уведомления/);
    expect(toast).not.toHaveTextContent(/Safari/);
    expect(pushSwitch).not.toBeChecked();
    vi.unstubAllGlobals();
  });

  it("tells an iOS user to install the app instead of blaming permissions", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
    stubBrowser(SAFARI_IOS_UA, "iPhone");
    renderWithProviders(<ProfilePage />);

    await screen.findByText("player");
    await user.click(screen.getByRole("checkbox", { name: "Push-уведомления" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/добавьте Day2 на экран/i);
    vi.unstubAllGlobals();
  });

  it("names an insecure origin as the reason", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
    stubBrowser(CHROME_ANDROID_UA);
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    renderWithProviders(<ProfilePage />);

    await screen.findByText("player");
    await user.click(screen.getByRole("checkbox", { name: "Push-уведомления" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/только по HTTPS/);
    vi.unstubAllGlobals();
  });
});
