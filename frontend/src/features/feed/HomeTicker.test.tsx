import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Tournament } from "@/api/types/tournaments";
import * as feedApi from "@/features/feed/feedApi";
import { HomeTicker, tickerItems } from "@/features/feed/HomeTicker";
import { Day2Banner, DAY2_URL } from "@/features/promo/Day2Banner";

vi.mock("@/features/feed/feedApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/feed/feedApi")>();
  return { ...original, fetchFeed: vi.fn() };
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

const BASE = Date.parse("2026-09-28T15:00:00Z");

function tournament(id: string, startsInMin: number, lateRegInMin: number | null = null) {
  return {
    id,
    name: `T ${id}`,
    lobby_name: null,
    guarantee: "1000",
    club,
    starts_at: new Date(BASE + startsInMin * 60_000).toISOString(),
    late_reg_closes_at:
      lateRegInMin === null ? null : new Date(BASE + lateRegInMin * 60_000).toISOString(),
  } as unknown as Tournament;
}

const win = {
  id: "w1",
  player_nickname: "молоток",
  club: { id: "c2", name: "Ginger21", app: "poker21" as const },
  tournament_name: "Main Event",
  place: 1,
  prize_amount: "86500",
  currency_code: "RUB",
  currency_symbol: "₽",
  won_on: "2026-09-20",
};

describe("tickerItems", () => {
  it("мешает живые турниры с выигрышами, закрытые и повторы выкидывает", () => {
    const items = tickerItems(
      [
        tournament("a", 30),
        tournament("b", -60, -5),
        tournament("c", -10, 40),
        tournament("a", 30),
      ],
      [win],
      new Date(BASE),
    );
    expect(items.map((item) => item.key)).toEqual(["t-c", "w-w1", "t-a"]);
    expect(items[0]).toMatchObject({ tone: "late", lead: expect.stringMatching(/^late до /) });
    expect(items[1]).toMatchObject({ tone: "win", name: "молоток" });
    expect(items[2]).toMatchObject({ tone: "soon", lead: "in 30m" });
  });
});

describe("HomeTicker", () => {
  it("строку можно остановить и запустить", async () => {
    vi.mocked(feedApi.fetchFeed).mockResolvedValue({
      posts: [],
      majors: [tournament("x", 24 * 60)],
      evening: [],
      wins: [win],
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HomeTicker />
      </QueryClientProvider>,
    );

    const stop = await screen.findByRole("button", { name: "Остановить ленту" });
    const track = screen.getByTestId("home-ticker-track");
    expect(track.style.animationPlayState).toBe("running");

    fireEvent.click(stop);
    expect(track.style.animationPlayState).toBe("paused");
    expect(screen.getByRole("button", { name: "Запустить ленту" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("пустая лента — на месте строки запасной орнамент", async () => {
    vi.mocked(feedApi.fetchFeed).mockResolvedValue({
      posts: [],
      majors: [],
      evening: [],
      wins: [],
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HomeTicker fallback={<div data-testid="rule" />} />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("rule")).toBeInTheDocument();
    expect(screen.queryByTestId("home-ticker")).not.toBeInTheDocument();
  });
});

describe("Day2Banner", () => {
  it("ведёт на сайт Day2 в новой вкладке", () => {
    render(<Day2Banner />);
    const link = screen.getByTestId("day2-banner");
    expect(link).toHaveAttribute("href", DAY2_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
