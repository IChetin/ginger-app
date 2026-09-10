import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { UserMe } from "@/api/types/auth";
import { TrackerPage } from "@/features/tracker/TrackerPage";
import { renderWithProviders } from "@/test/render";

const meOverride = vi.hoisted(() => ({
  current: null as {
    data: UserMe | undefined;
    isLoading: boolean;
    isPending: boolean;
    isError: boolean;
  } | null,
}));

const {
  fetchCurrentUser,
  fetchStats,
  fetchStatsChart,
  fetchStatsFilters,
  fetchStatsFilterCounts,
  fetchResults,
  fetchResultCurrencies,
  searchResultEvents,
  shareOrDownloadCard,
} = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  fetchStats: vi.fn(),
  fetchStatsChart: vi.fn(),
  fetchStatsFilters: vi.fn(),
  fetchStatsFilterCounts: vi.fn(),
  fetchResults: vi.fn(),
  fetchResultCurrencies: vi.fn(),
  searchResultEvents: vi.fn(),
  shareOrDownloadCard: vi.fn(),
}));

vi.mock("@/features/auth/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/auth/hooks")>();
  return {
    ...actual,
    useMe: (options?: { enabled?: boolean }) => meOverride.current ?? actual.useMe(options),
  };
});

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

vi.mock("@/features/tracker/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/tracker/api")>();
  return {
    ...actual,
    fetchStats: (...args: unknown[]) => fetchStats(...args),
    fetchStatsChart: (...args: unknown[]) => fetchStatsChart(...args),
    fetchStatsFilters: (...args: unknown[]) => fetchStatsFilters(...args),
    fetchStatsFilterCounts: (...args: unknown[]) => fetchStatsFilterCounts(...args),
    fetchResults: (...args: unknown[]) => fetchResults(...args),
    fetchResultCurrencies: (...args: unknown[]) => fetchResultCurrencies(...args),
    searchResultEvents: (...args: unknown[]) => searchResultEvents(...args),
    createResult: vi.fn(),
    updateResult: vi.fn(),
    deleteResult: vi.fn(),
  };
});

vi.mock("@/features/tracker/lib/shareCard", async () => {
  const actual = await vi.importActual<typeof import("@/features/tracker/lib/shareCard")>(
    "@/features/tracker/lib/shareCard",
  );
  return {
    ...actual,
    shareOrDownloadCard: (...args: unknown[]) => shareOrDownloadCard(...args),
  };
});

vi.mock("@/components/tracker/ProfitChart", () => ({
  ProfitChart: ({ points }: { points: { label: string }[] }) => (
    <div>
      <div>{points[0]?.label}</div>
    </div>
  ),
}));

const userFixture: UserMe = {
  id: "user-1",
  email: "player@example.com",
  phone: null,
  nickname: "ace",
  base_currency: "RUB",
  timezone: null,
  stack_display: "chips",
  hide_holes_until_showdown: true,
  results_visibility: "private",
  role: "user",
  default_reminder_offsets: [1440, 120],
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{JSON.stringify(location)}</output>;
}

describe("TrackerPage", () => {
  beforeEach(() => {
    meOverride.current = null;
    fetchStats.mockClear();
    fetchStatsChart.mockClear();
    fetchStatsFilters.mockClear();
    fetchStatsFilterCounts.mockClear();
    fetchResults.mockClear();
    fetchResultCurrencies.mockClear();
    searchResultEvents.mockClear();
    shareOrDownloadCard.mockClear();
    fetchCurrentUser.mockResolvedValue(userFixture);
    fetchStats.mockResolvedValue({
      base_currency: "RUB",
      tournaments: 1,
      entries: 1,
      invested: "100.00",
      won: "200.00",
      profit: "100.00",
      roi: "100.00",
      abi: "100.00",
      itm: "100.00",
    });
    fetchStatsChart.mockResolvedValue({
      base_currency: "RUB",
      points: [
        {
          index: 1,
          result_id: "r1",
          played_on: "2024-06-01",
          label: "Main",
          profit: "100.00",
          cumulative_profit: "100.00",
        },
      ],
    });
    fetchStatsFilters.mockResolvedValue({
      series: [],
      venues: [],
      countries: [],
      unlinked_count: 0,
    });
    fetchStatsFilterCounts.mockResolvedValue({
      total: 1,
      series: [],
      venues: [],
      buyin: [],
      result: [],
    });
    fetchResultCurrencies.mockResolvedValue([
      { code: "RUB", symbol: "₽" },
      { code: "BYN", symbol: "Br" },
    ]);
    searchResultEvents.mockResolvedValue([]);
    fetchResults.mockResolvedValue({
      items: [
        {
          id: "r1",
          entry_type: "live_mtt",
          event_id: null,
          name: "Main",
          venue_text: "KP",
          series_text: null,
          played_on: "2024-06-01",
          buyin: "100.00",
          currency_code: "RUB",
          entries_count: 1,
          payout: "200.00",
          place: 1,
          field_size: 10,
          note: null,
          events: [],
          created_at: "2024-06-01T00:00:00Z",
          updated_at: "2024-06-01T00:00:00Z",
          profit_base: "100.00",
          base_currency: "RUB",
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
    shareOrDownloadCard.mockResolvedValue("downloaded");
  });

  it("renders stats, chart controls and results", async () => {
    renderWithProviders(<TrackerPage />, { route: "/tracker" });
    expect(await screen.findByText("Трекер")).toBeInTheDocument();
    expect(await screen.findByText("Профит")).toBeInTheDocument();
    expect((await screen.findAllByText("Main")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("+100 ₽").length).toBeGreaterThan(0);
  });

  it("shows fx missing banner", async () => {
    fetchStats.mockRejectedValue(new ApiError(409, "fx_rate_missing", "missing"));
    fetchStatsChart.mockRejectedValue(new ApiError(409, "fx_rate_missing", "missing"));
    renderWithProviders(<TrackerPage />, { route: "/tracker" });
    expect(await screen.findByText(/Не хватает курса/i)).toBeInTheDocument();
  });

  it("shares card via fallback download", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TrackerPage />, { route: "/tracker" });
    await screen.findByText("Профит");
    await user.click(screen.getByRole("button", { name: "Поделиться статистикой" }));
    await waitFor(() => {
      expect(shareOrDownloadCard).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText("PNG скачан")).toBeInTheDocument();
  });

  it("passes URL period and buy-in presets to all queries", async () => {
    renderWithProviders(<TrackerPage />, {
      route: "/tracker?period=all&buyin=10-50k&venues=venue-1&result=itm",
    });
    await screen.findByText("Профит");
    await waitFor(() => {
      expect(fetchStats).toHaveBeenCalledWith(
        expect.objectContaining({ buyin: "10-50k", venues: "venue-1", result: "itm" }),
      );
      expect(fetchStatsChart).toHaveBeenCalledWith(
        expect.objectContaining({ buyin: "10-50k", venues: "venue-1", result: "itm" }),
      );
      expect(fetchResults).toHaveBeenCalledWith(
        expect.objectContaining({
          buyin: "10-50k",
          venues: "venue-1",
          result: "itm",
          limit: 20,
          offset: 0,
        }),
      );
    });
  });

  it("renders demo tracker for a guest without calling the API", async () => {
    meOverride.current = { data: undefined, isLoading: false, isPending: false, isError: true };
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <TrackerPage />
        <LocationProbe />
      </>,
      { route: "/tracker" },
    );
    const page = await screen.findByTestId("tracker-page");
    expect(page).toHaveAttribute("data-demo", "true");
    expect(await screen.findByTestId("stats-grid")).toBeInTheDocument();
    expect(screen.getByText("Профит")).toBeInTheDocument();
    expect(screen.getAllByText(/RPT Kaliningrad/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("demo-banner")).toHaveTextContent("Пример данных");
    expect(screen.getByTestId("auth-gate")).toHaveTextContent("ROI, ABI, ITM");
    expect(fetchStats).not.toHaveBeenCalled();
    expect(fetchStatsChart).not.toHaveBeenCalled();
    expect(fetchResults).not.toHaveBeenCalled();
    expect(fetchStatsFilters).not.toHaveBeenCalled();
    expect(fetchStatsFilterCounts).not.toHaveBeenCalled();

    const login = screen.getByTestId("auth-gate").querySelector("a[href='/login']");
    expect(login).toBeTruthy();
    await user.click(login!);
    expect(screen.getByTestId("location")).toHaveTextContent('"state":{"returnTo":"/tracker"}');
  });

  it("blocks write actions with a login sheet", async () => {
    meOverride.current = { data: undefined, isLoading: false, isPending: false, isError: true };
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <TrackerPage />
        <LocationProbe />
      </>,
      { route: "/tracker" },
    );
    await screen.findByTestId("stats-grid");
    await user.click(screen.getByRole("button", { name: "Добавить результат" }));
    expect(
      await screen.findByRole("heading", { name: "Войдите, чтобы вести свою статистику" }),
    ).toBeInTheDocument();
    const sheet = screen.getByTestId("demo-login-sheet");
    await user.click(sheet.querySelector("a[href='/login']")!);
    expect(screen.getByTestId("location")).toHaveTextContent('"returnTo":"/tracker"');
    expect(shareOrDownloadCard).not.toHaveBeenCalled();
  });

  it("switches demo base currency without calling the API", async () => {
    meOverride.current = { data: undefined, isLoading: false, isPending: false, isError: true };
    const user = userEvent.setup();
    renderWithProviders(<TrackerPage />, { route: "/tracker?period=all" });
    await screen.findByTestId("stats-grid");
    expect(screen.getAllByText(/₽/).length).toBeGreaterThan(0);
    await user.click(screen.getByTestId("tracker-currency"));
    await user.click(screen.getByRole("button", { name: /USD/ }));
    await waitFor(() => {
      expect(screen.getAllByText(/\$/).length).toBeGreaterThan(0);
    });
    expect(fetchStats).not.toHaveBeenCalled();
  });

  it("blocks share in demo mode", async () => {
    meOverride.current = { data: undefined, isLoading: false, isPending: false, isError: true };
    const user = userEvent.setup();
    renderWithProviders(<TrackerPage />, { route: "/tracker" });
    await screen.findByTestId("stats-grid");
    await user.click(screen.getByRole("button", { name: "Поделиться статистикой" }));
    expect(await screen.findByTestId("demo-login-sheet")).toBeInTheDocument();
    expect(shareOrDownloadCard).not.toHaveBeenCalled();
  });
});
