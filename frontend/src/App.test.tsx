import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import { AppRoutes } from "@/App";
import { eventDetailFixture, filtersFixture, seriesDetailFixture } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const fetchScheduleFilters = vi.fn();
const fetchSeriesList = vi.fn();
const fetchSeriesDetail = vi.fn();
const fetchEventDetail = vi.fn();
const fetchCalendar = vi.fn();
const fetchCurrentUser = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchScheduleFilters: (...args: unknown[]) => fetchScheduleFilters(...args),
    fetchSeriesList: (...args: unknown[]) => fetchSeriesList(...args),
    fetchSeriesDetail: (...args: unknown[]) => fetchSeriesDetail(...args),
    fetchEventDetail: (...args: unknown[]) => fetchEventDetail(...args),
    fetchCalendar: (...args: unknown[]) => fetchCalendar(...args),
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

describe("App routes", () => {
  beforeEach(() => {
    fetchScheduleFilters.mockResolvedValue(filtersFixture);
    fetchSeriesList.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    fetchSeriesDetail.mockResolvedValue(seriesDetailFixture);
    fetchEventDetail.mockResolvedValue(eventDetailFixture);
    fetchCalendar.mockResolvedValue({ month: "2026-08", days: [], series: [] });
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
  });

  it("sends a guest from home to login", async () => {
    renderWithProviders(<AppRoutes />, { route: "/" });
    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
  });

  it("renders calendar at /calendar", async () => {
    renderWithProviders(<AppRoutes />, { route: "/calendar?month=2026-08" });
    expect(await screen.findByTestId("calendar-page")).toBeInTheDocument();
  });

  it("renders series detail route", async () => {
    renderWithProviders(<AppRoutes />, { route: "/series/rpt-demo" });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "RPT Demo" })).toBeInTheDocument();
    });
  });

  it("renders event detail route", async () => {
    renderWithProviders(<AppRoutes />, { route: "/events/rpt-demo-1-main-event" });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Main Event/ })).toBeInTheDocument();
    });
  });

  it("redirects a profile guest to login", async () => {
    renderWithProviders(<AppRoutes />, { route: "/profile" });
    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
  });
});
