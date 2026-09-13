import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { CalendarResponse, CalendarSeriesItem } from "@/api/types/schedule";
import { AppRoutes } from "@/App";
import { seriesItemFixture } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const fetchCalendar = vi.fn();
const fetchCurrentUser = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCalendar: (...args: unknown[]) => fetchCalendar(...args),
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

function calendarSeries(overrides: Partial<CalendarSeriesItem>): CalendarSeriesItem {
  return {
    ...seriesItemFixture,
    is_bookmarked: false,
    coverage: null,
    overlap_starts_on: null,
    overlap_ends_on: null,
    events_in_period: null,
    min_buyins_in_period: null,
    ...overrides,
  };
}

const calendarFixture: CalendarResponse = {
  month: "2026-08",
  from: null,
  to: null,
  series: [
    calendarSeries({
      id: "series-a",
      name: "RPT Kaliningrad",
      starts_on: "2026-08-01",
      ends_on: "2026-08-11",
      status: "running",
      is_bookmarked: false,
      venue: { ...seriesItemFixture.venue, name: "Sobranie Casino", city: "Калининград" },
    }),
    calendarSeries({
      id: "series-b",
      name: "EAPT Grand Final",
      starts_on: "2026-07-30",
      ends_on: "2026-08-10",
      status: "running",
      venue: {
        ...seriesItemFixture.venue,
        name: "Casino Royal",
        city: "Минск",
        country_code: "BY",
      },
      country: { code: "BY", name_ru: "Беларусь" },
    }),
  ],
  days: [],
};

describe("CalendarPage", () => {
  beforeEach(() => {
    fetchCalendar.mockResolvedValue(calendarFixture);
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
  });

  it("renders month title and series list", async () => {
    renderWithProviders(<AppRoutes />, { route: "/calendar?month=2026-08" });

    expect(await screen.findByTestId("calendar-page")).toBeInTheDocument();
    expect(await screen.findByText("Август 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();
    expect(await screen.findByText("RPT Kaliningrad")).toBeInTheDocument();
    expect(screen.getByText("EAPT Grand Final")).toBeInTheDocument();
  });

  it("requests calendar by month param", async () => {
    renderWithProviders(<AppRoutes />, { route: "/calendar?month=2026-08" });
    await screen.findByText("RPT Kaliningrad");

    expect(fetchCalendar).toHaveBeenCalledWith({ month: "2026-08" });
  });

  it("starts range on first tap and asks for end date", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/calendar?month=2026-08" });
    await screen.findByText("RPT Kaliningrad");

    await user.click(screen.getByTestId("calendar-day-2026-08-10"));

    expect(await screen.findByTestId("calendar-picking-hint")).toBeInTheDocument();
    expect(screen.getByTestId("calendar-period-bar")).toBeInTheDocument();
    expect(screen.getByTestId("calendar-period-tip")).toHaveTextContent("Отметьте вторую дату");
  });

  it("completes range and requests from/to", async () => {
    const user = userEvent.setup();
    const periodFixture: CalendarResponse = {
      ...calendarFixture,
      from: "2026-08-10",
      to: "2026-08-24",
      series: [
        calendarSeries({
          id: "series-full",
          name: "Belarus Poker Tour 41",
          starts_on: "2026-08-13",
          ends_on: "2026-08-24",
          status: "schedule_published",
          coverage: "full",
          overlap_starts_on: "2026-08-13",
          overlap_ends_on: "2026-08-24",
          events_in_period: 28,
          min_buyins_in_period: [{ amount: "110.00", currency: { code: "USD", symbol: "$" } }],
        }),
        calendarSeries({
          id: "series-partial",
          name: "RPT Kaliningrad",
          starts_on: "2026-08-01",
          ends_on: "2026-08-11",
          status: "running",
          coverage: "partial",
          overlap_starts_on: "2026-08-10",
          overlap_ends_on: "2026-08-11",
          events_in_period: 5,
          min_buyins_in_period: [{ amount: "150.00", currency: { code: "USD", symbol: "$" } }],
        }),
      ],
    };
    fetchCalendar.mockImplementation(
      async (params: { month: string; from?: string; to?: string }) => {
        if (params.from && params.to) {
          return periodFixture;
        }
        return calendarFixture;
      },
    );

    renderWithProviders(<AppRoutes />, { route: "/calendar?month=2026-08" });
    await screen.findByText("RPT Kaliningrad");

    await user.click(screen.getByTestId("calendar-day-2026-08-10"));
    await screen.findByTestId("calendar-picking-hint");
    await user.click(screen.getByTestId("calendar-day-2026-08-24"));

    await waitFor(() => {
      expect(fetchCalendar).toHaveBeenCalledWith({
        month: "2026-08",
        from: "2026-08-10",
        to: "2026-08-24",
      });
    });

    expect(await screen.findByText("Belarus Poker Tour 41")).toBeInTheDocument();
    expect(screen.getByText("частично")).toBeInTheDocument();
    expect(screen.getByText(/Целиком в периоде/)).toBeInTheDocument();
  });

  it("restores period from URL", async () => {
    fetchCalendar.mockResolvedValue({
      ...calendarFixture,
      from: "2026-08-10",
      to: "2026-08-24",
      series: [
        calendarSeries({
          id: "series-full",
          name: "Period Series",
          coverage: "full",
          overlap_starts_on: "2026-08-13",
          overlap_ends_on: "2026-08-20",
          events_in_period: 3,
          min_buyins_in_period: [],
        }),
      ],
    });

    renderWithProviders(<AppRoutes />, {
      route: "/calendar?month=2026-08&from=2026-08-10&to=2026-08-24",
    });

    expect(await screen.findByText("Period Series")).toBeInTheDocument();
    expect(fetchCalendar).toHaveBeenCalledWith({
      month: "2026-08",
      from: "2026-08-10",
      to: "2026-08-24",
    });
  });

  it("clears period back to month mode", async () => {
    const user = userEvent.setup();
    fetchCalendar.mockImplementation(async (params: { from?: string; to?: string }) => {
      if (params.from && params.to) {
        return {
          ...calendarFixture,
          from: params.from,
          to: params.to,
          series: [],
        };
      }
      return calendarFixture;
    });

    renderWithProviders(<AppRoutes />, {
      route: "/calendar?month=2026-08&from=2026-08-10&to=2026-08-24",
    });

    expect(await screen.findByText("В выбранный период серий нет")).toBeInTheDocument();
    await user.click(screen.getAllByTestId("calendar-clear-period")[0]!);

    expect(await screen.findByText("RPT Kaliningrad")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchCalendar).toHaveBeenCalledWith({ month: "2026-08" });
    });
  });

  it("shows retry on error", async () => {
    fetchCalendar.mockRejectedValueOnce(new ApiError(500, "server_error", "Server error"));
    renderWithProviders(<AppRoutes />, { route: "/calendar?month=2026-08" });

    expect(await screen.findByTestId("calendar-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });

  it("shows guest calendar without gold dots", async () => {
    renderWithProviders(<AppRoutes />, { route: "/calendar?month=2026-08" });
    await screen.findByText("RPT Kaliningrad");

    const day = screen.getByTestId("calendar-day-2026-08-01");
    expect(day.querySelector(".bg-gold")).toBeNull();
  });
});
