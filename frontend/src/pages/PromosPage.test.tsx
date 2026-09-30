import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as feedApi from "@/features/feed/feedApi";
import * as promosApi from "@/features/promos/promosApi";
import { PromosPage } from "@/pages/PromosPage";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/feed/feedApi", async (importOriginal) => ({
  ...(await importOriginal<typeof feedApi>()),
  fetchPromotions: vi.fn(),
}));

vi.mock("@/features/promos/promosApi", async (importOriginal) => ({
  ...(await importOriginal<typeof promosApi>()),
  fetchPromos: vi.fn(),
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
    vi.mocked(promosApi.fetchPromos).mockReset();
    vi.mocked(promosApi.fetchPromos).mockResolvedValue([]);
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
    expect(within(tabs).getByRole("heading", { name: "PROMO" })).toBeInTheDocument();
  });
});

describe("Акции плашками", () => {
  beforeEach(() => {
    vi.mocked(feedApi.fetchPromotions).mockReset();
    vi.mocked(promosApi.fetchPromos).mockReset();
  });

  it("плашки идут первыми, записи ленты — ниже, фильтр по клубу общий", async () => {
    vi.mocked(promosApi.fetchPromos).mockResolvedValue([
      {
        id: "plate1",
        club: { id: "club3", name: "Private.G", app: "pppoker" },
        kind: "leaderboard",
        title: "Месячный Leaderboard MTT",
        prize_fund: "199000.00",
        prize_extra: "Black VIP Card",
        currency_code: "RUB",
        currency_symbol: "₽",
        starts_at: "2020-01-01T00:00:00Z",
        ends_at: "2099-01-01T00:00:00Z",
        recurrence: "monthly",
        game: "mtt",
        buyin_min: null,
        buyin_max: null,
        prizes: [],
        boost_windows: [],
        image_url: null,
      },
    ]);
    vi.mocked(feedApi.fetchPromotions).mockResolvedValue([promo()]);
    renderWithProviders(<PromosPage />, { route: "/promos" });

    expect(await screen.findByText("Месячный Leaderboard MTT")).toBeInTheDocument();
    expect(await screen.findByText("Рейкбек 35%")).toBeInTheDocument();
    expect(screen.getByText("2 акции")).toBeInTheDocument();
    expect(screen.getByText("₽199 000")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Private.G" }));
    expect(screen.queryByText("Рейкбек 35%")).not.toBeInTheDocument();
    expect(screen.getByText("Месячный Leaderboard MTT")).toBeInTheDocument();
  });
});
