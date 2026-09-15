import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/features/telegram/api";
import { TelegramBlock } from "@/features/telegram/TelegramBlock";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/telegram/api", () => ({
  fetchTelegramStatus: vi.fn(),
  startTelegramLink: vi.fn(),
  unlinkTelegram: vi.fn(),
}));

describe("TelegramBlock", () => {
  beforeEach(() => {
    vi.mocked(api.fetchTelegramStatus).mockReset();
  });

  it("не показывается, пока бот не настроен", async () => {
    vi.mocked(api.fetchTelegramStatus).mockResolvedValue({
      available: false,
      linked: false,
      username: null,
      bot_username: null,
    });
    renderWithProviders(<TelegramBlock />);
    await waitFor(() => expect(api.fetchTelegramStatus).toHaveBeenCalled());
    expect(screen.queryByTestId("telegram-block")).toBeNull();
  });

  it("выдаёт ссылку на бота, а после привязки предлагает отключить", async () => {
    vi.mocked(api.fetchTelegramStatus).mockResolvedValue({
      available: true,
      linked: false,
      username: null,
      bot_username: "ginger_bot",
    });
    vi.mocked(api.startTelegramLink).mockResolvedValue({
      url: "https://t.me/ginger_bot?start=abc",
      expires_at: "2026-09-15T12:15:00Z",
    });
    vi.mocked(api.unlinkTelegram).mockResolvedValue(undefined as never);

    const view = renderWithProviders(<TelegramBlock />);
    fireEvent.click(await screen.findByRole("button", { name: "Подключить Telegram" }));
    expect(await screen.findByRole("link", { name: "Открыть бота" })).toHaveAttribute(
      "href",
      "https://t.me/ginger_bot?start=abc",
    );

    vi.mocked(api.fetchTelegramStatus).mockResolvedValue({
      available: true,
      linked: true,
      username: "fox",
      bot_username: "ginger_bot",
    });
    await view.queryClient.invalidateQueries({ queryKey: ["me", "telegram"] });
    expect(await screen.findByText(/@fox/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Отключить" }));
    const buttons = await screen.findAllByRole("button", { name: "Отключить" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(api.unlinkTelegram).toHaveBeenCalled());
  });
});
