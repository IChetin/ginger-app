import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { SeriesDetail } from "@/api/types/schedule";
import { AppRoutes } from "@/App";
import { clearGuestBookmarks } from "@/features/bookmarks/lib/guestBookmarksIdb";
import { seriesDetailFixture, seriesItemFixture } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const fetchSeriesDetail = vi.fn();
const fetchCurrentUser = vi.fn();
const fetchScheduleFilters = vi.fn();
const fetchSeriesList = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchSeriesDetail: (...args: unknown[]) => fetchSeriesDetail(...args),
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
    fetchScheduleFilters: (...args: unknown[]) => fetchScheduleFilters(...args),
    fetchSeriesList: (...args: unknown[]) => fetchSeriesList(...args),
  };
});

const seriesSlug = "rpt-kaliningrad-2026-08";

const multiDaySeries: SeriesDetail = {
  ...seriesItemFixture,
  id: "series-kaliningrad",
  slug: seriesSlug,
  name: "RPT Kaliningrad",
  starts_on: "2026-08-01",
  ends_on: "2026-08-03",
  status: "schedule_published",
  venue: {
    ...seriesItemFixture.venue,
    name: "Sobranie Casino",
    city: "Калининград",
    timezone: "Europe/Kaliningrad",
    address: null,
  },
  description: null,
  links: { telegram: "https://t.me/rpt" },
  events_by_day: [
    {
      date: "2026-08-01",
      events: [
        {
          id: "event-sat",
          slug: "3-satellite",
          number: 3,
          name: "Satellite",
          buyin: "5000.00",
          buyin_bounty: null,
          currency: { code: "RUB", symbol: "₽" },
          guarantee: null,
          game_type: "nlh",
          tags: ["satellite", "turbo"],
          status: "scheduled",
          start_stack: 20000,
          start_blinds: null,
          reentry_count: null,
          reentry_unlimited: false,
          late_reg_level: null,
          day_end_note: null,
          flights: [
            {
              id: "flight-sat",
              label: null,
              start_at: {
                utc: "2026-08-01T12:00:00+00:00",
                venue_local: "2026-08-01T14:00:00+02:00",
                venue_timezone: "Europe/Kaliningrad",
              },
            },
          ],
        },
      ],
    },
    {
      date: "2026-08-02",
      events: [
        {
          id: "event-me",
          slug: "5-main-event",
          number: 5,
          name: "Main Event",
          buyin: "44000.00",
          buyin_bounty: null,
          currency: { code: "RUB", symbol: "₽" },
          guarantee: "20000000.00",
          game_type: "nlh",
          tags: ["main"],
          status: "scheduled",
          start_stack: 40000,
          start_blinds: null,
          reentry_count: 1,
          reentry_unlimited: false,
          late_reg_level: 8,
          day_end_note: null,
          flights: [
            {
              id: "flight-1a",
              label: "Day 1A",
              start_at: {
                utc: "2026-08-02T17:00:00+00:00",
                venue_local: "2026-08-02T19:00:00+02:00",
                venue_timezone: "Europe/Kaliningrad",
              },
            },
            {
              id: "flight-1b",
              label: "Day 1B",
              start_at: {
                utc: "2026-08-03T17:00:00+00:00",
                venue_local: "2026-08-03T19:00:00+02:00",
                venue_timezone: "Europe/Kaliningrad",
              },
            },
          ],
        },
      ],
    },
    {
      date: "2026-08-03",
      events: [
        {
          id: "event-me",
          slug: "5-main-event",
          number: 5,
          name: "Main Event",
          buyin: "44000.00",
          buyin_bounty: null,
          currency: { code: "RUB", symbol: "₽" },
          guarantee: "20000000.00",
          game_type: "nlh",
          tags: ["main"],
          status: "scheduled",
          start_stack: 40000,
          start_blinds: null,
          reentry_count: 1,
          reentry_unlimited: false,
          late_reg_level: 8,
          day_end_note: null,
          flights: [
            {
              id: "flight-1a",
              label: "Day 1A",
              start_at: {
                utc: "2026-08-02T17:00:00+00:00",
                venue_local: "2026-08-02T19:00:00+02:00",
                venue_timezone: "Europe/Kaliningrad",
              },
            },
            {
              id: "flight-1b",
              label: "Day 1B",
              start_at: {
                utc: "2026-08-03T17:00:00+00:00",
                venue_local: "2026-08-03T19:00:00+02:00",
                venue_timezone: "Europe/Kaliningrad",
              },
            },
          ],
        },
      ],
    },
  ],
};

describe("SeriesPage", () => {
  beforeEach(async () => {
    await clearGuestBookmarks();
    fetchSeriesDetail.mockResolvedValue(multiDaySeries);
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
    fetchScheduleFilters.mockResolvedValue({
      countries: [],
      zones: [],
      organizers: [],
      statuses: [],
      game_types: [],
      tags: [],
    });
    fetchSeriesList.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it("defaults to starts_on for published series", async () => {
    renderWithProviders(<AppRoutes />, { route: `/series/${seriesSlug}` });
    expect(await screen.findByRole("heading", { name: "RPT Kaliningrad" })).toBeInTheDocument();
    expect(await screen.findByText(/Satellite/)).toBeInTheDocument();
    const activeDay = screen
      .getAllByRole("button")
      .find((btn) => btn.getAttribute("aria-current") === "date");
    expect(activeDay?.textContent).toMatch(/1/);
  });

  it("restores day from URL and shows sibling flight chips", async () => {
    renderWithProviders(<AppRoutes />, {
      route: `/series/${seriesSlug}?day=2026-08-02`,
    });
    expect(await screen.findByText(/#5\s*Main Event/)).toBeInTheDocument();
    expect(screen.getByText(/Day 1B — 3 авг/)).toBeInTheDocument();
    expect(screen.getByText("19:00")).toBeInTheDocument();
  });

  it("shows empty day state", async () => {
    const emptyDaySeries: SeriesDetail = {
      ...multiDaySeries,
      events_by_day: multiDaySeries.events_by_day.filter((day) => day.date !== "2026-08-01"),
    };
    fetchSeriesDetail.mockResolvedValue(emptyDaySeries);
    renderWithProviders(<AppRoutes />, {
      route: `/series/${seriesSlug}?day=2026-08-01`,
    });
    expect(await screen.findByTestId("empty-day")).toBeInTheDocument();
    expect(screen.getByText("В этот день турниров нет")).toBeInTheDocument();
  });

  it("shows 404 state", async () => {
    fetchSeriesDetail.mockRejectedValue(new ApiError(404, "not_found", "Series not found"));
    renderWithProviders(<AppRoutes />, { route: "/series/missing" });
    expect(await screen.findByTestId("series-not-found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "На главную" })).toHaveAttribute("href", "/");
  });

  it("shows error and retries", async () => {
    fetchSeriesDetail.mockRejectedValueOnce(new ApiError(500, "server", "boom"));
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: `/series/${seriesSlug}` });
    expect(await screen.findByText("Не удалось загрузить серию")).toBeInTheDocument();
    fetchSeriesDetail.mockResolvedValueOnce(seriesDetailFixture);
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByRole("heading", { name: "RPT Demo" })).toBeInTheDocument();
  });

  it("keeps series tab active on series page", async () => {
    renderWithProviders(<AppRoutes />, {
      route: `/series/${seriesSlug}?day=2026-08-02`,
    });
    await screen.findByRole("heading", { name: "RPT Kaliningrad" });
    const nav = screen.getByRole("navigation", { name: "Основная навигация" });
    expect(within(nav).getByText("Серии").closest("a")).toHaveAttribute("aria-current", "page");
  });

  it("changes day via strip", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, {
      route: `/series/${seriesSlug}?day=2026-08-02`,
    });
    await screen.findByText(/Main Event · Day 1A/);
    const dayButtons = screen.getAllByRole("button");
    const day3 = dayButtons.find(
      (btn) => btn.textContent?.includes("3") && btn.textContent?.includes("пн"),
    );
    expect(day3).toBeTruthy();
    await user.click(day3!);
    await waitFor(() => {
      expect(screen.getByText(/Main Event · Day 1B/)).toBeInTheDocument();
    });
  });
});
