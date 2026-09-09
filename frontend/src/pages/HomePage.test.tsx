import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { SeriesListItem } from "@/api/types/schedule";
import { AppRoutes } from "@/App";
import { clearGuestBookmarks } from "@/features/bookmarks/lib/guestBookmarksIdb";
import { filtersFixture, seriesItemFixture } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const fetchScheduleFilters = vi.fn();
const fetchSeriesList = vi.fn();
const fetchSeriesFilterCounts = vi.fn();
const fetchCurrentUser = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchScheduleFilters: (...args: unknown[]) => fetchScheduleFilters(...args),
    fetchSeriesList: (...args: unknown[]) => fetchSeriesList(...args),
    fetchSeriesFilterCounts: (...args: unknown[]) => fetchSeriesFilterCounts(...args),
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

function isoShift(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function page(
  items: SeriesListItem[],
  total = items.length,
  limit = 100,
  offset = 0,
  counts = {
    all: total,
    running: items.filter((item) => item.status === "running").length,
    archive: items.filter((item) => item.status === "finished").length,
  },
) {
  return { items, total, limit, offset, counts };
}

const running: SeriesListItem = {
  ...seriesItemFixture,
  id: "running-1",
  name: "RPT Live",
  status: "running",
  starts_on: isoShift(-10),
  ends_on: isoShift(5),
  today_events_count: 2,
  venue: { ...seriesItemFixture.venue, timezone: "UTC" },
};

const soon: SeriesListItem = {
  ...seriesItemFixture,
  id: "soon-1",
  name: "EAPT Soon",
  status: "schedule_published",
  starts_on: isoShift(12),
  ends_on: isoShift(25),
  organizer: { id: "org-2", name: "EAPT", slug: "eapt", logo_url: null },
  venue: { ...seriesItemFixture.venue, timezone: "UTC" },
};

const announced: SeriesListItem = {
  ...seriesItemFixture,
  id: "ann-1",
  name: "SPF Announce",
  status: "announced",
  starts_on: isoShift(60),
  ends_on: isoShift(70),
  events_count: 0,
  min_buyins: [],
  organizer: { id: "org-3", name: "SPF", slug: "spf", logo_url: null },
  venue: { ...seriesItemFixture.venue, timezone: "UTC" },
};

const finished: SeriesListItem = {
  ...seriesItemFixture,
  id: "fin-1",
  name: "RPT Past",
  status: "finished",
  starts_on: isoShift(-90),
  ends_on: isoShift(-80),
  venue: { ...seriesItemFixture.venue, timezone: "UTC" },
};

describe("HomePage", () => {
  beforeEach(async () => {
    await clearGuestBookmarks();
    fetchScheduleFilters.mockResolvedValue(filtersFixture);
    fetchSeriesList.mockResolvedValue(page([running, soon, announced]));
    fetchSeriesFilterCounts.mockResolvedValue({
      total: 3,
      countries: [{ value: "RU", count: 3 }],
      organizers: [{ value: "org-1", count: 1 }],
      buyin: [
        { value: "lt10k", count: 1 },
        { value: "10-50k", count: 2 },
        { value: "gte50k", count: 0 },
      ],
    });
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
  });

  it("groups series into sections", async () => {
    renderWithProviders(<AppRoutes />, { route: "/" });

    expect(await screen.findByRole("heading", { name: "Идут сейчас" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Скоро" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Анонсы" })).toBeInTheDocument();
    expect(screen.getByText("RPT Live")).toBeInTheDocument();
    expect(screen.getByText("EAPT Soon")).toBeInTheDocument();
    expect(screen.getByText("SPF Announce")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Анонсы/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Все 3" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Идут 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Архив 0" })).toBeInTheDocument();
    expect(screen.queryByText(/Найдено/)).not.toBeInTheDocument();
    expect(screen.getByTestId("home-feed-toolbar")).toBeInTheDocument();
    expect(screen.queryByText("Фильтры")).not.toBeInTheDocument();
    expect(screen.queryByTestId("filter-chips")).not.toBeInTheDocument();
  });

  it("treats legacy announced URL as all", async () => {
    renderWithProviders(<AppRoutes />, { route: "/?status=announced" });

    expect(await screen.findByRole("heading", { name: "Анонсы" })).toBeInTheDocument();
    expect(screen.getByText("SPF Announce")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Все 3" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /Анонсы/ })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(fetchSeriesList).toHaveBeenCalledWith(expect.objectContaining({ status: "actual" }));
    });
  });

  it("keeps a zero-count tab clickable and shows empty state", async () => {
    fetchSeriesList.mockImplementation((params: { status?: string }) => {
      if (params.status === "running") {
        return Promise.resolve(page([], 0, 100, 0, { all: 3, running: 0, archive: 0 }));
      }
      return Promise.resolve(
        page([running, soon, announced], 3, 100, 0, { all: 3, running: 0, archive: 0 }),
      );
    });
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/" });
    await screen.findByText("RPT Live");

    await user.click(screen.getByRole("tab", { name: "Идут 0" }));
    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сбросить фильтры" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Идут/ })).toHaveAttribute("aria-selected", "true");
  });

  it("writes multi filters to URL from sheet", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/" });
    await screen.findByText("RPT Live");

    await user.click(screen.getByRole("button", { name: /Фильтры/ }));
    await user.click(await screen.findByRole("button", { name: /Россия/ }));
    await user.click(screen.getByRole("button", { name: /Показать/ }));

    await waitFor(() => {
      expect(fetchSeriesList).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "actual",
          countries: "RU",
          limit: 100,
        }),
      );
    });
    expect(screen.getByRole("button", { name: /Убрать 🇷🇺 Россия/ })).toBeInTheDocument();
    expect(screen.getByTestId("filter-chips")).toBeInTheDocument();
  });

  it("updates tab counts when subject filters change", async () => {
    fetchSeriesList.mockImplementation((params: { countries?: string }) => {
      if (params.countries === "RU") {
        return Promise.resolve(page([running], 1, 100, 0, { all: 1, running: 1, archive: 0 }));
      }
      return Promise.resolve(
        page([running, soon, announced], 3, 100, 0, { all: 3, running: 1, archive: 2 }),
      );
    });
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/" });
    expect(await screen.findByRole("tab", { name: "Все 3" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Архив 2" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Фильтры/ }));
    await user.click(await screen.findByRole("button", { name: /Россия/ }));
    await user.click(screen.getByRole("button", { name: /Показать/ }));

    expect(await screen.findByRole("tab", { name: "Все 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Идут 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Архив 0" })).toBeInTheDocument();
  });

  it("restores filters from URL on reload", async () => {
    renderWithProviders(<AppRoutes />, {
      route: "/?countries=RU&buyin=10-50k&status=running",
    });
    await waitFor(() => {
      expect(fetchSeriesList).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "running",
          countries: "RU",
          buyin: "10-50k",
        }),
      );
    });
    expect(await screen.findByRole("button", { name: "Убрать 🇷🇺 Россия" })).toBeInTheDocument();
    expect(screen.getByText("10–50 тыс. ₽")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Идут/ })).toHaveAttribute("aria-selected", "true");
  });

  it("loads archive from URL and requests finished series", async () => {
    fetchSeriesList.mockResolvedValue(page([finished], 1, 20, 0));
    renderWithProviders(<AppRoutes />, { route: "/?status=archive" });

    expect(await screen.findByText("RPT Past")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Архив/ })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => {
      expect(fetchSeriesList).toHaveBeenCalledWith(
        expect.objectContaining({ status: "finished", limit: 20, offset: 0 }),
      );
    });
  });

  it("shows error state with retry", async () => {
    fetchSeriesList.mockRejectedValueOnce(new ApiError(500, "server", "boom"));
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/" });

    expect(await screen.findByText("Не удалось загрузить расписание")).toBeInTheDocument();
    fetchSeriesList.mockResolvedValueOnce(page([soon]));
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("EAPT Soon")).toBeInTheDocument();
  });

  it("shows empty state and resets filters", async () => {
    fetchSeriesList.mockResolvedValue(page([]));
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/?countries=CY" });

    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    await waitFor(() => {
      expect(fetchSeriesList).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "actual",
          countries: undefined,
          buyin: undefined,
          organizers: undefined,
        }),
      );
    });
  });

  it("applies country filter in archive on the same series endpoint", async () => {
    fetchSeriesList.mockImplementation((params: { status?: string; countries?: string }) => {
      if (params.status === "finished" && params.countries === "RU") {
        return Promise.resolve(page([finished], 1, 20, 0));
      }
      if (params.status === "finished") {
        return Promise.resolve(page([finished], 1, 20, 0));
      }
      return Promise.resolve(page([running, soon, announced]));
    });
    fetchSeriesFilterCounts.mockResolvedValue({
      total: 1,
      countries: [
        { value: "RU", count: 1 },
        { value: "BY", count: 0 },
        { value: "CY", count: 0 },
      ],
      organizers: [{ value: "org-1", count: 1 }],
      buyin: [
        { value: "lt10k", count: 0 },
        { value: "10-50k", count: 1 },
        { value: "gte50k", count: 0 },
      ],
    });

    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/?status=archive" });
    expect(await screen.findByText("RPT Past")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Фильтры/ }));
    expect(await screen.findByRole("button", { name: /За последний месяц/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Весь архив/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ближайший месяц/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Россия/ }));
    await user.click(screen.getByRole("button", { name: /Показать/ }));

    await waitFor(() => {
      expect(fetchSeriesList).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "finished",
          countries: "RU",
          limit: 20,
        }),
      );
    });
    expect(fetchSeriesFilterCounts).toHaveBeenCalledWith(
      expect.objectContaining({ status: "finished" }),
    );
  });

  it("keeps filters when switching to archive and shows archive empty copy", async () => {
    fetchSeriesList.mockImplementation((params: { status?: string; countries?: string }) => {
      if (params.status === "finished") {
        return Promise.resolve(page([], 0, 20, 0));
      }
      return Promise.resolve(page([running]));
    });
    fetchSeriesFilterCounts.mockResolvedValue({
      total: 0,
      countries: [
        { value: "RU", count: 0 },
        { value: "BY", count: 0 },
        { value: "CY", count: 0 },
      ],
      organizers: [],
      buyin: [],
    });

    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/?countries=BY" });
    await screen.findByText("RPT Live");

    await user.click(screen.getByRole("tab", { name: /^Архив/ }));

    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("В архиве нет серий по выбранным фильтрам")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Убрать BY/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchSeriesList).toHaveBeenCalledWith(
        expect.objectContaining({ status: "finished", countries: "BY" }),
      );
    });

    await user.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    await waitFor(() => {
      expect(fetchSeriesList).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "finished",
          countries: undefined,
        }),
      );
    });
  });

  it("hides empty sections", async () => {
    fetchSeriesList.mockResolvedValue(page([soon]));
    renderWithProviders(<AppRoutes />, { route: "/" });
    expect(await screen.findByText("EAPT Soon")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Идут сейчас" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Анонсы" })).not.toBeInTheDocument();
  });

  it("toggles bookmark button locally", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/" });
    await screen.findByText("RPT Live");
    const button = screen.getAllByRole("button", { name: "В закладки" })[0];
    await user.click(button);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Убрать из закладок" }).length).toBeGreaterThan(
        0,
      );
    });
  });
});
