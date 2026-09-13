import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { SeriesScheduleResponse } from "@/api/types/schedule";
import { AppRoutes } from "@/App";
import { clearGuestBookmarks } from "@/features/bookmarks/lib/guestBookmarksIdb";
import { filtersFixture, seriesDetailFixture, seriesItemFixture } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const fetchSeriesDetail = vi.fn();
const fetchSeriesSchedule = vi.fn();
const fetchCurrentUser = vi.fn();
const fetchScheduleFilters = vi.fn();
const fetchSeriesList = vi.fn();
const fetchSeriesFilterCounts = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchSeriesDetail: (...args: unknown[]) => fetchSeriesDetail(...args),
    fetchSeriesSchedule: (...args: unknown[]) => fetchSeriesSchedule(...args),
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
    fetchScheduleFilters: (...args: unknown[]) => fetchScheduleFilters(...args),
    fetchSeriesList: (...args: unknown[]) => fetchSeriesList(...args),
    fetchSeriesFilterCounts: (...args: unknown[]) => fetchSeriesFilterCounts(...args),
  };
});

const scheduleFixture: SeriesScheduleResponse = {
  id: seriesItemFixture.id,
  slug: seriesItemFixture.slug,
  name: seriesItemFixture.name,
  starts_on: seriesItemFixture.starts_on,
  ends_on: seriesItemFixture.ends_on,
  status: seriesItemFixture.status,
  poster_url: seriesItemFixture.poster_url,
  organizer: seriesItemFixture.organizer,
  venue: seriesItemFixture.venue,
  country: seriesItemFixture.country,
  currency: { code: "RUB", symbol: "₽" },
  total_guarantee: "30000000.00",
  timezone_label: "МСК",
  date_range_label: "1–7 августа",
  events_count: 1,
  days: [
    {
      date: "2026-08-01",
      label: "Суббота, 1 августа",
      band_label: "1 авг",
      events_count: 1,
      rows: [
        {
          event_id: "event-1",
          event_slug: "1-main-event",
          flight_id: "flight-1",
          number: 1,
          name: "Main Event",
          flight_label: "A",
          start_at: {
            utc: "2026-08-01T11:00:00+00:00",
            venue_local: "2026-08-01T14:00:00+03:00",
            venue_timezone: "Europe/Moscow",
          },
          buyin: "55000.00",
          buyin_bounty: null,
          buyin_display: "55 000 ₽",
          guarantee: "30000000.00",
          guarantee_display: "30 000 000",
          game_type: "nlh",
          tags: ["main"],
          pdf_tags: [],
          start_stack: 40000,
          late_reg_level: 8,
          level_duration: "20′",
          day_end_note: null,
          highlight: "main",
          status: "scheduled",
        },
      ],
    },
  ],
};

describe("SeriesSchedulePage back navigation", () => {
  beforeEach(async () => {
    await clearGuestBookmarks();
    fetchSeriesDetail.mockResolvedValue(seriesDetailFixture);
    fetchSeriesSchedule.mockResolvedValue(scheduleFixture);
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
    fetchScheduleFilters.mockResolvedValue(filtersFixture);
    fetchSeriesList.mockResolvedValue({
      items: [seriesItemFixture],
      total: 1,
      limit: 100,
      offset: 0,
    });
    fetchSeriesFilterCounts.mockResolvedValue({
      total: 1,
      countries: [{ value: "RU", count: 1 }],
      organizers: [{ value: "org-1", count: 1 }],
      buyin: [],
    });
  });

  it("returns home after series → schedule → back → back", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, {
      routerProps: {
        initialEntries: ["/", `/series/${seriesItemFixture.slug}`],
        initialIndex: 1,
      },
    });

    expect(await screen.findByTestId("series-page")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Все расписание" }));
    expect(await screen.findByTestId("series-schedule-page")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByTestId("series-page")).toBeInTheDocument();
    expect(screen.queryByTestId("series-schedule-page")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Назад" }));
    await waitFor(() => {
      expect(screen.queryByTestId("series-page")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("series-schedule-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("series-page")).not.toBeInTheDocument();
  });
});
