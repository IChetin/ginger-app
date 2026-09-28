import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as feedApi from "@/features/feed/feedApi";
import type { WinItem } from "@/features/feed/feedApi";
import { shortDate } from "@/features/feed/WinRow";
import { WinsTicker } from "@/features/feed/WinsTicker";
import { Day2Banner, DAY2_URL } from "@/features/promo/Day2Banner";
import { WinsPage, weekLabel, weekStart } from "@/pages/WinsPage";

vi.mock("@/features/feed/feedApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/feed/feedApi")>();
  return { ...original, fetchFeed: vi.fn(), fetchWinsHistory: vi.fn() };
});

function win(id: string, nickname: string, wonOn: string, prize = "1000"): WinItem {
  return {
    id,
    player_nickname: nickname,
    club: { id: "c1", name: "Ginger+", app: "xpoker" },
    tournament_name: "Дижестив",
    place: 1,
    prize_amount: prize,
    currency_code: "RUB",
    currency_symbol: "₽",
    won_on: wonOn,
  };
}

function renderWith(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("WinsTicker", () => {
  it("листает строки по одной вверх и останавливается кнопкой", async () => {
    vi.mocked(feedApi.fetchFeed).mockResolvedValue({
      posts: [],
      majors: [],
      evening: [],
      wins: ["a", "b", "c", "d"].map((id) => win(id, `Игрок ${id}`, "2026-09-27")),
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWith(<WinsTicker />);
    const track = await screen.findByTestId("wins-ticker-track");
    expect(track.style.transform).toBe("translateY(-0px)");
    // Копии первых трёх — для бесшовного круга, читалке они не нужны.
    expect(within(track).getAllByTestId("win-row")).toHaveLength(7);

    act(() => vi.advanceTimersByTime(3000));
    expect(track.style.transform).toBe("translateY(-48px)");

    fireEvent.click(screen.getByRole("button", { name: "Остановить выигрыши" }));
    act(() => vi.advanceTimersByTime(9000));
    expect(track.style.transform).toBe("translateY(-48px)");
    expect(screen.getByRole("button", { name: "Листать выигрыши" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("три выигрыша и меньше стоят на месте", async () => {
    vi.mocked(feedApi.fetchFeed).mockResolvedValue({
      posts: [],
      majors: [],
      evening: [],
      wins: [win("a", "молотoк", "2026-09-22", "38330")],
    });
    renderWith(<WinsTicker />);
    const ticker = await screen.findByTestId("wins-ticker");
    expect(within(ticker).getByText("молотoк")).toBeInTheDocument();
    expect(within(ticker).getByText("22.09")).toBeInTheDocument();
    expect(within(ticker).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("WinsPage", () => {
  it("группирует выигрыши по неделям с суммой", async () => {
    vi.mocked(feedApi.fetchWinsHistory).mockResolvedValue([
      win("a", "IFWeterok", "2026-09-22", "40920"),
      win("b", "молотoк", "2026-09-22", "38330"),
      win("c", "lysense", "2026-09-03", "30219"),
    ]);
    renderWith(<WinsPage />);
    const weeks = await screen.findAllByTestId("wins-week");
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveTextContent("21–27 сентября");
    expect(weeks[0]).toHaveTextContent("2 выигрыша");
    expect(weeks[0]).toHaveTextContent(/₽79\s250/);
    // 3 сентября — четверг: неделя с 31 августа, через границу месяца.
    expect(weeks[1]).toHaveTextContent("31 августа – 6 сентября");
  });

  it("недели и даты считаются по понедельникам", () => {
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekLabel("2026-09-28")).toBe("28 сентября – 4 октября");
    expect(shortDate("2026-09-02")).toBe("02.09");
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
