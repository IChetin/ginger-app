import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as feedApi from "@/features/feed/feedApi";
import { PromosPage } from "@/pages/PromosPage";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/feed/feedApi", async (importOriginal) => ({
  ...(await importOriginal<typeof feedApi>()),
  fetchPromotions: vi.fn(),
}));

function promo(overrides: Partial<feedApi.FeedPost> = {}): feedApi.FeedPost {
  return {
    id: "promo1",
    title: "Рейкбек 35%",
    body: "Считаем со всего фи.",
    image_url: null,
    link_url: null,
    link_label: null,
    club: { id: "club1", name: "Ginger", app: "pppoker" },
    is_pinned: false,
    is_promo: true,
    published_at: "2026-09-29T09:00:00Z",
    expires_at: null,
    ...overrides,
  };
}

describe("Акции", () => {
  beforeEach(() => {
    vi.mocked(feedApi.fetchPromotions).mockReset();
  });

  it("показывает акции клубов и срок действия", async () => {
    vi.mocked(feedApi.fetchPromotions).mockResolvedValue([
      promo({ expires_at: "2026-10-05T20:59:00Z" }),
    ]);
    renderWithProviders(<PromosPage />, { route: "/promos" });

    expect(await screen.findByText("Рейкбек 35%")).toBeInTheDocument();
    expect(screen.getByText("до 5 октября")).toBeInTheDocument();
    expect(screen.getByText("1 акция")).toBeInTheDocument();
  });

  it("фильтрует по клубу, когда клубов несколько", async () => {
    vi.mocked(feedApi.fetchPromotions).mockResolvedValue([
      promo(),
      promo({
        id: "promo2",
        title: "Фриролл 100 000 ₽",
        club: { id: "club2", name: "Ginger+", app: "xpoker" },
      }),
    ]);
    renderWithProviders(<PromosPage />, { route: "/promos" });

    expect(await screen.findByText("Фриролл 100 000 ₽")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ginger+" }));
    expect(screen.queryByText("Рейкбек 35%")).not.toBeInTheDocument();
    expect(screen.getByText("Фриролл 100 000 ₽")).toBeInTheDocument();
  });

  it("пустой раздел объясняет, что здесь будет", async () => {
    vi.mocked(feedApi.fetchPromotions).mockResolvedValue([]);
    renderWithProviders(<PromosPage />, { route: "/promos" });

    expect(await screen.findByText("Сейчас акций нет")).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Расписание" });
    expect(within(tabs).getByRole("heading", { name: "АКЦИИ" })).toBeInTheDocument();
  });
});
